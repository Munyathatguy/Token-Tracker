const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Store } = require("../src/store.cjs");
const { AlertEngine } = require("../src/alerts.cjs");
function reading(now, current = 0, weekly = 84) {
  return {
    id: "codex:account:codex",
    owner: "account",
    client: "Codex",
    bucket: "codex",
    at: now,
    current: {
      remaining: current,
      resetsAt: now + 60000,
      reportedAt: now,
      state: "reported",
    },
    weekly: {
      remaining: weekly,
      resetsAt: now + 86400000,
      reportedAt: now,
      state: "reported",
    },
  };
}
test("empty premium bucket cannot replace ordinary allowance and partial updates retain each window", () => {
  const s = new Store(":memory:");
  const now = Date.now();
  s.upsertAccount(reading(now));
  s.upsertAccount({
    ...reading(now),
    id: "codex:account:premium",
    bucket: "premium",
    current: null,
    weekly: null,
  });
  let a = s.snapshot().accounts;
  assert.equal(a.length, 1);
  assert.equal(a[0].current.remaining, 0);
  assert.equal(a[0].weekly.remaining, 84);
  s.upsertAccount({ ...reading(now + 100), current: null, weekly: null });
  a = s.snapshot().accounts;
  assert.equal(a[0].current.remaining, 0);
  assert.equal(a[0].weekly.remaining, 84);
  assert.equal(a[0].weekly.reportedAt, now);
  s.close();
});
test("warnings, exhaustion and reset-due alarms are durable, independent and deduplicated", () => {
  const s = new Store(":memory:");
  let now = Date.now();
  s.upsertAccount(reading(now));
  const engine = new AlertEngine(s);
  let notices = engine.evaluate(now);
  assert.ok(
    notices.some((x) => x.kind === "exhausted" && x.scope === "current"),
  );
  assert.equal(engine.evaluate(now).length, 0);
  now += 61000;
  notices = engine.evaluate(now);
  assert.ok(notices.some((x) => x.kind === "reset-due"));
  assert.equal(engine.evaluate(now).length, 0);
  assert.equal(s.snapshot().accounts[0].current.remaining, 0);
  assert.equal(s.snapshot().accounts[0].weekly.remaining, 84);
  assert.ok(s.snapshot().events.some((e) => /exhausted/i.test(e.label)));
  assert.ok(s.snapshot().alerts.length);
  s.close();
});
