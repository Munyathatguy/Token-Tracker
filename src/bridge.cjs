const net = require("node:net");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { normaliseClaude, briefing } = require("./core.cjs");
async function startBridge(store, dir, onDelivery = () => {}) {
  const pending = new Map();
  function issue(client, sessionId, summary = "") {
    for (const [id, t] of pending)
      if (Date.now() - t.at > 30000) pending.delete(id);
    if (pending.size >= 100) pending.delete(pending.keys().next().value);
    const ticket = {
      id: crypto.randomUUID(),
      client,
      sessionId: typeof sessionId === "string" ? sessionId.slice(0, 200) : "",
      at: Date.now(),
      summary: summary.slice(0, 3000),
    };
    pending.set(ticket.id, ticket);
    return ticket.id;
  }
  const token = crypto.randomBytes(32).toString("hex");
  const address =
    process.platform === "win32"
      ? "\\\\.\\pipe\\token-tracker-" + crypto.randomBytes(8).toString("hex")
      : path.join(dir, "bridge.sock");
  if (process.platform !== "win32") await fs.rm(address, { force: true });
  const server = net.createServer((socket) => {
    socket.setTimeout(3000, () => socket.destroy());
    let buf = "";
    socket.on("error", () => {});
    socket.on("data", (chunk) => {
      buf += chunk;
      if (Buffer.byteLength(buf) > 1048576) {
        socket.destroy();
        return;
      }
      const idx = buf.indexOf("\n");
      if (idx < 0) return;
      socket.pause();
      try {
        const msg = JSON.parse(buf.slice(0, idx));
        if (
          typeof msg.token !== "string" ||
          msg.token.length !== token.length ||
          !crypto.timingSafeEqual(Buffer.from(msg.token), Buffer.from(token))
        )
          throw Error("Unauthorized");
        let result;
        if (msg.action === "ping") result = { pid: process.pid };
        else if (msg.action === "status")
          result = {
            text: briefing(
              store.snapshot(),
              String(msg.sessionId || "").slice(0, 200),
            ),
            ...(msg.target === "model"
              ? { deliveryId: issue("MCP client", msg.sessionId) }
              : {}),
          };
        else if (msg.action === "claude") {
          if (
            ![
              "statusline",
              "UserPromptSubmit",
              "Stop",
              "SessionStart",
              "PostCompact",
              "PreCompact",
              "PostToolUse",
              "SubagentStop",
            ].includes(msg.event)
          )
            throw Error("Unsupported event");
          store.apply(
            normaliseClaude(msg.data, msg.event),
            crypto.randomUUID(),
          );
          result = {
            text: briefing(store.snapshot(), msg.data.session_id),
            ...(["UserPromptSubmit", "SessionStart"].includes(msg.event)
              ? { deliveryId: issue("Claude", "claude:" + msg.data.session_id) }
              : {}),
          };
        } else if (msg.action === "codex") {
          if (
            ![
              "SessionStart",
              "UserPromptSubmit",
              "PreToolUse",
              "PostToolUse",
              "Stop",
            ].includes(msg.event) ||
            typeof msg.data?.session_id !== "string" ||
            msg.data.session_id.length > 200
          )
            throw Error("Invalid Codex hook event");
          const nativeId = msg.data.session_id,
            id = "codex:" + nativeId;
          const old = store.get("sessions", id);
          const now = Date.now();
          store.apply(
            {
              session: {
                id,
                nativeId,
                client: "Codex",
                ...(old
                  ? {}
                  : { account: "unverified-local", project: "Codex session" }),
                lastActivity: now,
                observedAt: now,
                ...(msg.event === "Stop"
                  ? { status: "Waiting" }
                  : msg.event === "UserPromptSubmit"
                    ? { status: "Working" }
                    : {}),
              },
              event: "Codex hook observed: " + msg.event,
              at: now,
            },
            crypto.randomUUID(),
          );
          store.put("settings", "lastCodexHook", {
            at: now,
            event: msg.event,
            sessionId: id,
          });
          const snap = store.snapshot(),
            key = "codexHookOutput:" + id,
            last = store.get("settings", key);
          const signature = JSON.stringify(
            snap.accounts
              .filter((a) => a.client === "Codex")
              .map((a) => [
                a.id,
                ...[a.current, a.weekly].map((w) =>
                  !w
                    ? "unknown"
                    : w.remaining === 0
                      ? "exhausted"
                      : w.remaining <= snap.settings.alertWrapRemaining
                        ? "wrap"
                        : w.remaining <= snap.settings.alertPrepareRemaining
                          ? "prepare"
                          : w.remaining <= snap.settings.alertWarnRemaining
                            ? "warning"
                            : "normal",
                ),
              ]),
          );
          const send =
            msg.event !== "Stop" &&
            (["SessionStart", "UserPromptSubmit"].includes(msg.event) ||
              !last ||
              now - last.at >= 60000 ||
              last.signature !== signature);
          const bound = old?.account && old.account !== "unverified-local";
          const text = send
            ? (bound
                ? ""
                : "Session account not matched yet; account-wide readings follow. ") +
              briefing(snap, bound ? id : "")
            : "";
          if (send) store.put("settings", key, { at: now, signature });
          result = {
            text,
            ...(send ? { deliveryId: issue("Codex", id, text) } : {}),
          };
        } else if (msg.action === "delivery") {
          const ticket = pending.get(msg.deliveryId);
          if (!ticket || Date.now() - ticket.at > 30000)
            throw Error("Unknown or expired delivery");
          pending.delete(msg.deliveryId);
          const delivery = store.recordDelivery(ticket);
          onDelivery(delivery);
          result = { recorded: true };
        } else throw Error("Unsupported action");
        socket.end(JSON.stringify({ ok: true, ...result }) + "\n");
      } catch (e) {
        socket.end(JSON.stringify({ ok: false, error: e.message }) + "\n");
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(address, resolve);
  });
  if (process.platform !== "win32") await fs.chmod(address, 0o600);
  const descriptor = { address, token, pid: process.pid };
  const file = path.join(dir, "bridge.json");
  async function publish() {
    const tmp = file + "." + process.pid + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(descriptor), { mode: 0o600 });
    await fs.rename(tmp, file);
  }
  await publish();
  return {
    descriptor,
    checkHealth: async () => {
      await request(descriptor, { action: "ping" });
      let saved;
      try {
        saved = JSON.parse(await fs.readFile(file, "utf8"));
      } catch {}
      const repaired =
        saved?.address !== address ||
        saved?.token !== token ||
        saved?.pid !== process.pid;
      if (repaired) await publish();
      return { state: "connected", at: Date.now(), repaired };
    },
    close: async () => {
      await new Promise((r) => server.close(r));
      let saved;
      try {
        saved = JSON.parse(await fs.readFile(file, "utf8"));
      } catch {}
      if (saved?.token === token) await fs.rm(file, { force: true });
      if (process.platform !== "win32") await fs.rm(address, { force: true });
    },
  };
}
function request(descriptor, payload) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection(descriptor.address);
    let data = "";
    s.setTimeout(2500, () => s.destroy(Error("Tracker unavailable")));
    s.on("error", reject);
    s.on("connect", () =>
      s.write(JSON.stringify({ ...payload, token: descriptor.token }) + "\n"),
    );
    s.on("data", (x) => {
      data += x;
      if (data.length > 1048576) s.destroy(Error("Response too large"));
    });
    s.on("end", () => {
      try {
        const r = JSON.parse(data);
        if (!r.ok) reject(Error(r.error));
        else resolve(r);
      } catch (e) {
        reject(e);
      }
    });
  });
}
module.exports = { startBridge, request };
