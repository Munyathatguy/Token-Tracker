const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { Store } = require("../src/store.cjs");
const { startBridge } = require("../src/bridge.cjs");
function cli(home, mode, input) {
  return new Promise((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [path.join(__dirname, "..", "src", "cli.cjs"), mode],
      { env: { ...process.env, COMPASS_HOME: home }, windowsHide: true },
    );
    let out = "",
      err = "";
    p.stdout.on("data", (x) => (out += x));
    p.stderr.on("data", (x) => (err += x));
    p.on("error", reject);
    p.on("exit", (code) => (code ? reject(Error(err)) : resolve(out)));
    p.stdin.end(input);
  });
}
test("real CLI prompt hook delivers awareness, stop observes without a model loop, MCP works", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "compass-cli-"));
  const s = new Store(":memory:");
  const b = await startBridge(s, home);
  try {
    const prompt = JSON.parse(
      await cli(
        home,
        "claude-hook",
        JSON.stringify({
          session_id: "cli-test",
          hook_event_name: "UserPromptSubmit",
        }),
      ),
    );
    assert.equal(prompt.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    assert.match(prompt.hookSpecificOutput.additionalContext, /Local time/);
    const stop = await cli(
      home,
      "claude-hook",
      JSON.stringify({ session_id: "cli-test", hook_event_name: "Stop" }),
    );
    assert.equal(stop, "");
    assert.equal(s.snapshot().sessions[0].status, "Waiting");
    const mcp = await cli(
      home,
      "mcp",
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "get_session_awareness",
          arguments: { sessionId: "cli-test" },
        },
      }) + "\n",
    );
    assert.match(
      JSON.parse(mcp).result.content[0].text,
      /allowance unavailable/,
    );
  } finally {
    await b.close();
    s.close();
    await fs.rm(home, { recursive: true, force: true });
  }
});
