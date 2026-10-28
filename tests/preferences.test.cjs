const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Store } = require("../src/store.cjs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { bubbleSize, validatePreferences } = require("../src/preferences.cjs");
test("compact is the default and matches the requested small desktop footprint", () => {
  const s = new Store(":memory:");
  assert.equal(s.snapshot().settings.bubbleMode, "compact");
  assert.deepEqual(bubbleSize(s.snapshot().settings, "compact"), {
    width: 260,
    height: 96,
  });
  assert.deepEqual(
    bubbleSize({ ...s.snapshot().settings, compactScale: 0.8 }, "compact"),
    { width: 208, height: 77 },
  );
  s.close();
});
test("saved appearance survives a database close and reopen", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tracker-prefs-"));
  const file = path.join(dir, "state.sqlite");
  let s = new Store(file);
  try {
    s.updatePreferences({
      theme: "light",
      opacity: 0.5,
      bubbleMode: "icon",
      popupOnDelivery: false,
    });
    s.close();
    s = new Store(file);
    const p = s.snapshot().settings;
    assert.equal(p.theme, "light");
    assert.equal(p.opacity, 0.5);
    assert.equal(p.bubbleMode, "icon");
    assert.equal(p.popupOnDelivery, false);
  } finally {
    s.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("appearance and popup preferences persist and reject unsupported or unreadable values", () => {
  const s = new Store(":memory:");
  s.updatePreferences({
    theme: "light",
    opacity: 0.65,
    popupOnDelivery: false,
    popupSeconds: 8,
    compactWidth: 280,
  });
  const p = s.snapshot().settings;
  assert.equal(p.theme, "light");
  assert.equal(p.opacity, 0.65);
  assert.equal(p.popupOnDelivery, false);
  for (const patch of [
    { opacity: 0 },
    { theme: "bad" },
    { popupSeconds: NaN },
    { pin: "true" },
    { compactWidth: 100 },
    { unknown: true },
  ])
    assert.throws(() => validatePreferences(patch));
  assert.equal(s.snapshot().settings.opacity, 0.65);
  s.close();
});
test("visibility and planning thresholds are validated as a coherent set", () => {
  const s = new Store(":memory:");
  s.updatePreferences({
    showContext: false,
    showClock: false,
    showCompactions: false,
    sessionRows: 1,
    alertWarnRemaining: 40,
    alertPrepareRemaining: 25,
    alertWrapRemaining: 12,
  });
  assert.equal(s.snapshot().settings.showContext, false);
  assert.equal(s.snapshot().settings.sessionRows, 1);
  assert.throws(() => s.updatePreferences({ alertWrapRemaining: 26 }), /below/);
  assert.equal(s.snapshot().settings.alertWrapRemaining, 12);
  assert.throws(() => s.updatePreferences({ sessionRows: 1.5 }));
  assert.throws(() => s.updatePreferences({ toString: "bad" }));
  s.close();
});
