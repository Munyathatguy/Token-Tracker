const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  quotaWindow,
  contextInfo,
  normaliseCodex,
  risk,
  briefing,
} = require("../src/core.cjs");
test("reported quotas keep current and weekly independent; reject fabricated values", () => {
  const now = Date.now();
  assert.equal(
    quotaWindow(
      { used_percent: 82, window_minutes: 300, resets_at: now / 1000 + 900 },
      now,
    ).remaining,
    18,
  );
  assert.equal(
    quotaWindow(
      { used_percent: 0, window_minutes: 10080, resets_at: now / 1000 + 900 },
      now,
    ).remaining,
    100,
  );
  assert.equal(quotaWindow({ used_percent: NaN }, now), null);
  assert.equal(quotaWindow({ used_percent: -1 }, now), null);
  assert.equal(quotaWindow({ used_percent: 110 }, now), null);
  assert.equal(
    quotaWindow({ used_percent: 90, resets_at: now / 1000 - 1 }, now).state,
    "awaiting refresh",
  );
});
test("context uses last request, not total billed or a double counted reasoning subset", () => {
  const c = contextInfo({
    model_context_window: 200000,
    last_token_usage: {
      input_tokens: 40000,
      output_tokens: 2000,
      reasoning_output_tokens: 1000,
    },
    total_token_usage: { total_tokens: 900000 },
  });
  assert.equal(c.used, 21);
  assert.equal(c.tokens, 42000);
  assert.equal(contextInfo({ model_context_window: 200000 }), null);
});
test("metadata normalisation excludes full prompts and partitions account quota", () => {
  const x = normaliseCodex({
    type: "session_meta",
    timestamp: "2026-10-28T10:00:00Z",
    payload: {
      id: "one",
      cwd: "D:/work",
      creator_account_id: "account-a",
      base_instructions: "DO NOT STORE",
    },
  });
  assert.equal(x.session.id, "codex:one");
  assert.equal(x.session.account, "account-a");
  assert.ok(!JSON.stringify(x).includes("DO NOT STORE"));
});
test("risk explains compactions without claiming measured performance", () => {
  assert.equal(risk(null, 0).score, null);
  assert.equal(risk({ used: 90 }, 0).level, "High");
  assert.ok(risk({ used: 20 }, 4).score > 20);
  assert.match(risk({ used: 20 }, 4).explanation, /heuristic/i);
});
test("briefing includes quota priority, time and explicitly unavailable readings", () => {
  const b = briefing({ accounts: [], sessions: [] }, "none");
  assert.match(b, /allowance.*unavailable/i);
  assert.match(b, /time/i);
});
test("stale per-window allowance is withheld from model guidance even if the account was recently updated", () => {
  const now = Date.now();
  const snapshot = {
    sessions: [],
    accounts: [
      {
        client: "Codex",
        at: now,
        current: {
          remaining: 54,
          state: "reported",
          reportedAt: now - 900000,
          resetsAt: now + 10000,
        },
        weekly: {
          remaining: 3,
          state: "reported",
          reportedAt: now,
          resetsAt: now + 900000,
        },
      },
    ],
  };
  const b = briefing(snapshot, "", now);
  assert.doesNotMatch(b, /54%/);
  assert.match(b, /current unavailable.*stale/i);
  assert.match(b, /weekly 3%/);
  assert.match(b, /Capacity is low/);
  snapshot.accounts[0].weekly.remaining = 90;
  snapshot.accounts[0].current.remaining = 1;
  assert.doesNotMatch(briefing(snapshot, "", now), /Capacity is low/);
});
