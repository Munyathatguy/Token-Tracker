const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Store } = require("../src/store.cjs");
const { startBridge, request } = require("../src/bridge.cjs");
test("bridge rejects missing authentication and accepts metadata only", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "compass-test-"));
  const s = new Store(":memory:");
  const b = await startBridge(s, dir);
  try {
    await assert.rejects(
      request({ ...b.descriptor, token: "wrong" }, { action: "status" }),
      /Unauthorized/,
    );
    await request(b.descriptor, {
      action: "claude",
      event: "UserPromptSubmit",
      data: { session_id: "abc", cwd: "D:/safe", prompt: "PRIVATE CONTENT" },
    });
    assert.equal(s.snapshot().sessions[0].status, "Working");
    assert.ok(!JSON.stringify(s.snapshot()).includes("PRIVATE CONTENT"));
    assert.match(
      (await request(b.descriptor, { action: "status", sessionId: "abc" }))
        .text,
      /allowance unavailable/,
    );
  } finally {
    await b.close();
    s.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("only acknowledged model-facing output triggers a delivery notice, once", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tracker-delivery-"));
  const s = new Store(":memory:");
  let notices = 0;
  const b = await startBridge(s, dir, () => notices++);
  try {
    await request(b.descriptor, { action: "status" });
    assert.equal(notices, 0);
    const r = await request(b.descriptor, {
      action: "status",
      target: "model",
    });
    assert.equal(notices, 0);
    assert.ok(r.deliveryId);
    await request(b.descriptor, {
      action: "delivery",
      deliveryId: r.deliveryId,
    });
    assert.equal(notices, 1);
    assert.equal(s.snapshot().lastDelivery.client, "MCP client");
    await assert.rejects(
      request(b.descriptor, { action: "delivery", deliveryId: r.deliveryId }),
      /Unknown/,
    );
    assert.equal(notices, 1);
  } finally {
    await b.close();
    s.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
