const net = require("node:net");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { normaliseClaude, briefing } = require("./core.cjs");
async function startBridge(store, dir, onDelivery = () => {}) {
  const pending = new Map();
  function issue(client, sessionId) {
    for (const [id, t] of pending)
      if (Date.now() - t.at > 30000) pending.delete(id);
    if (pending.size >= 100) pending.delete(pending.keys().next().value);
    const ticket = {
      id: crypto.randomUUID(),
      client,
      sessionId: typeof sessionId === "string" ? sessionId.slice(0, 200) : "",
      at: Date.now(),
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
        if (msg.action === "status")
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
  await fs.writeFile(file, JSON.stringify(descriptor), { mode: 0o600 });
  return {
    descriptor,
    close: async () => {
      await new Promise((r) => server.close(r));
      await fs.rm(file, { force: true });
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
