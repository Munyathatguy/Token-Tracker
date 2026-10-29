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
test("disconnected Codex hook explicitly warns the model while Stop stays loop free", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tracker-offline-"));
  try {
    const input = { session_id: "offline", hook_event_name: "PreToolUse" };
    const result = JSON.parse(
      await cli(home, "codex-hook", JSON.stringify(input)),
    );
    assert.match(
      result.hookSpecificOutput.additionalContext,
      /monitoring unavailable/i,
    );
    assert.match(
      result.hookSpecificOutput.additionalContext,
      /cannot provide.*warning/i,
    );
    assert.deepEqual(
      JSON.parse(
        await cli(
          home,
          "codex-hook",
          JSON.stringify({ ...input, hook_event_name: "Stop" }),
        ),
      ),
      {},
    );
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});
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
    const delivery = s.snapshot().lastDelivery;
    assert.equal(delivery.client, "Claude");
    const stop = await cli(
      home,
      "claude-hook",
      JSON.stringify({ session_id: "cli-test", hook_event_name: "Stop" }),
    );
    assert.equal(stop, "");
    assert.equal(s.snapshot().sessions[0].status, "Waiting");
    assert.equal(s.snapshot().lastDelivery.id, delivery.id);
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
    assert.equal(s.snapshot().lastDelivery.client, "MCP client");
  } finally {
    await b.close();
    s.close();
    await fs.rm(home, { recursive: true, force: true });
  }
});
test("Codex hooks provide a real briefing and receipt; stop does not request continuation", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tracker-codex-cli-"));
  const s = new Store(":memory:");
  const b = await startBridge(s, home);
  try {
    const now = Date.now();
    s.upsertAccount({
      id: "codex:test-owner:codex",
      client: "Codex",
      owner: "test-owner",
      bucket: "codex",
      at: now,
      current: {
        remaining: 7,
        state: "reported",
        reportedAt: now,
        resetsAt: now + 60000,
      },
      weekly: {
        remaining: 84,
        state: "reported",
        reportedAt: now,
        resetsAt: now + 86400000,
      },
    });
    s.apply(
      {
        session: {
          id: "codex:codex-test",
          nativeId: "codex-test",
          client: "Codex",
          account: "test-owner",
        },
        at: now,
      },
      "seed",
    );
    const out = JSON.parse(
      await cli(
        home,
        "codex-hook",
        JSON.stringify({
          session_id: "codex-test",
          hook_event_name: "UserPromptSubmit",
        }),
      ),
    );
    assert.match(
      out.hookSpecificOutput.additionalContext,
      /current 7% remaining.*weekly 84% remaining/,
    );
    assert.match(
      out.hookSpecificOutput.additionalContext,
      /Capacity is low: finish verification and save a checkpoint/,
    );
    assert.equal(s.snapshot().lastCodexDelivery.client, "Codex");
    assert.ok(s.snapshot().lastCodexHook);
    const stop = JSON.parse(
      await cli(
        home,
        "codex-hook",
        JSON.stringify({ session_id: "codex-test", hook_event_name: "Stop" }),
      ),
    );
    assert.deepEqual(stop, {});
  } finally {
    await b.close();
    s.close();
    await fs.rm(home, { recursive: true, force: true });
  }
});
