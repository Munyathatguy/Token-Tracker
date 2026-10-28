const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Store } = require("../src/store.cjs");
const { normaliseCodex } = require("../src/core.cjs");
test("compactions deduplicate and account quota never crosses owners", () => {
  const s = new Store(":memory:");
  s.apply(
    {
      session: { id: "one", client: "Codex", account: "a" },
      compaction: true,
      at: 1,
    },
    "x",
  );
  s.apply({ session: { id: "one" }, compaction: true, at: 1 }, "x");
  for (const owner of ["a", "b"])
    s.apply(
      normaliseCodex(
        {
          type: "event_msg",
          payload: {
            type: "token_count",
            rate_limits: { limit_id: "codex", primary: { used_percent: 20 } },
          },
        },
        owner,
        owner,
      ),
      "quota" + owner,
    );
  const snap = s.snapshot();
  assert.equal(snap.sessions.find((x) => x.id === "one").compactions, 1);
  assert.equal(snap.accounts.length, 2);
  s.note("one", "checkpoint", "Tests passed; documentation remains.");
  assert.equal(s.snapshot().notes.length, 1);
  s.close();
});
test("compaction invalidates the old context reading until fresh usage arrives", () => {
  const s = new Store(":memory:");
  s.apply({ session: { id: "one", context: { used: 95 } }, at: 1 }, "start");
  s.apply({ session: { id: "one" }, compaction: true, at: 2 }, "compact");
  assert.equal(s.snapshot().sessions[0].context, null);
  s.close();
});
