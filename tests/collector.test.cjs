const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Store } = require("../src/store.cjs");
const { Collector } = require("../src/collector.cjs");
test("incremental records tolerate partial lines and restart without duplicate compactions", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "compass-logs-"));
  const file = path.join(dir, "session.jsonl");
  const s = new Store(":memory:");
  const c = new Collector(s, dir);
  const line = (x) => JSON.stringify(x) + "\n";
  try {
    await fs.writeFile(
      file,
      line({
        type: "session_meta",
        payload: { id: "abc", creator_account_id: "a" },
      }) +
        line({ type: "compacted" }) +
        '{"type":',
    );
    await c.tail(file, await fs.stat(file));
    assert.equal(s.snapshot().sessions[0].compactions, 1);
    await fs.appendFile(file, '"compacted"}\n');
    await c.tail(file, await fs.stat(file));
    assert.equal(s.snapshot().sessions[0].compactions, 2);
    const c2 = new Collector(s, dir);
    await c2.tail(file, await fs.stat(file));
    assert.equal(s.snapshot().sessions[0].compactions, 2);
  } finally {
    s.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
