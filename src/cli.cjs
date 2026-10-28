#!/usr/bin/env node
// Standalone hook client: never reads provider credentials or stores prompt content.
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const home =
  process.env.COMPASS_HOME ||
  path.join(
    process.env.APPDATA || path.join(os.homedir(), ".config"),
    "TokenTracker",
  );
function call(payload) {
  return new Promise((resolve, reject) => {
    let d;
    try {
      d = JSON.parse(fs.readFileSync(path.join(home, "bridge.json"), "utf8"));
    } catch {
      return reject(Error("Token Tracker is not running"));
    }
    const s = net.createConnection(d.address);
    let text = "";
    s.setTimeout(2000, () => s.destroy(Error("Token Tracker timed out")));
    s.on("error", reject);
    s.on("connect", () =>
      s.write(JSON.stringify({ ...payload, token: d.token }) + "\n"),
    );
    s.on("data", (x) => (text += x));
    s.on("end", () => {
      try {
        const r = JSON.parse(text);
        if (!r.ok) throw Error(r.error);
        resolve(r);
      } catch (e) {
        reject(e);
      }
    });
  });
}
async function main() {
  const mode = process.argv[2] || "status";
  if (mode === "status") {
    console.log(
      (await call({ action: "status", sessionId: process.argv[3] })).text,
    );
    return;
  }
  if (mode === "mcp") {
    require("node:readline")
      .createInterface({ input: process.stdin })
      .on("line", async (line) => {
        let m;
        try {
          m = JSON.parse(line);
          if (m.id === undefined) return;
          let result;
          let deliveryId;
          if (m.method === "initialize")
            result = {
              protocolVersion: m.params?.protocolVersion || "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "token-tracker", version: "0.2.0" },
            };
          else if (m.method === "tools/list")
            result = {
              tools: [
                {
                  name: "get_session_awareness",
                  description:
                    "Read reported remaining account usage, resets, local time and session context. Monitoring itself runs independently.",
                  inputSchema: {
                    type: "object",
                    properties: { sessionId: { type: "string" } },
                    additionalProperties: false,
                  },
                },
              ],
            };
          else if (
            m.method === "tools/call" &&
            m.params?.name === "get_session_awareness"
          ) {
            const status = await call({
              action: "status",
              sessionId: m.params.arguments?.sessionId,
              target: "model",
            });
            deliveryId = status.deliveryId;
            result = {
              content: [
                {
                  type: "text",
                  text: status.text,
                },
              ],
            };
          } else if (["resources/list", "prompts/list"].includes(m.method))
            result = { [m.method.split("/")[0]]: [] };
          else {
            process.stdout.write(
              JSON.stringify({
                jsonrpc: "2.0",
                id: m.id,
                error: { code: -32601, message: "Method not found" },
              }) + "\n",
            );
            return;
          }
          await new Promise((resolve) =>
            process.stdout.write(
              JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\n",
              resolve,
            ),
          );
          if (deliveryId)
            try {
              await call({ action: "delivery", deliveryId });
            } catch {}
        } catch (e) {
          if (m?.id !== undefined)
            process.stdout.write(
              JSON.stringify({
                jsonrpc: "2.0",
                id: m.id,
                error: { code: -32603, message: e.message },
              }) + "\n",
            );
        }
      });
    return;
  }
  let raw = "";
  for await (const x of process.stdin) {
    raw += x;
    if (raw.length > 1048576) return;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }
  if (mode === "claude-statusline") {
    let previous;
    try {
      previous = JSON.parse(
        fs.readFileSync(path.join(home, "claude-integration.json"), "utf8"),
      ).previousStatusLine;
    } catch {}
    if (previous?.command) {
      const child = spawnSync(previous.command, {
        shell: true,
        input: raw,
        encoding: "utf8",
        timeout: 2000,
        windowsHide: true,
        maxBuffer: 1048576,
      });
      if (child.stdout) process.stdout.write(child.stdout);
    } else process.stdout.write("Token Tracker · usage in desktop bubble");
    try {
      await call({ action: "claude", event: "statusline", data });
    } catch {}
    return;
  }
  if (mode === "claude-hook") {
    try {
      const event = data.hook_event_name;
      const r = await call({ action: "claude", event, data });
      if (["UserPromptSubmit", "SessionStart"].includes(event)) {
        await new Promise((resolve) =>
          process.stdout.write(
            JSON.stringify({
              hookSpecificOutput: {
                hookEventName: event,
                additionalContext: r.text,
              },
            }) + "\n",
            resolve,
          ),
        );
        if (r.deliveryId)
          await call({ action: "delivery", deliveryId: r.deliveryId });
      }
    } catch {} // Tracker failure must not prevent the user's AI from working.
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
