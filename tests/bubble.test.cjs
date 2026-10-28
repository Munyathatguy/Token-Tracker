const { test } = require("node:test");
const assert = require("node:assert/strict");
const { BubbleController } = require("../src/bubble.cjs");
function setup() {
  let visible = false,
    timer,
    focused = 0;
  const prefs = {
    bubbleMode: "expanded",
    compactWidth: 260,
    pin: false,
    opacity: 0.8,
    popupOnDelivery: true,
    popupSeconds: 5,
  };
  const w = {
    getBounds: () => ({ x: 100, y: 100, width: 350, height: 440 }),
    setBounds: (b) => (w.bounds = b),
    setOpacity: (n) => (w.opacity = n),
    setAlwaysOnTop: (b) => (w.pin = b),
    isVisible: () => visible,
    show: () => {
      visible = true;
      focused++;
    },
    showInactive: () => {
      visible = true;
    },
    hide: () => {
      visible = false;
    },
    focus: () => focused++,
    isDestroyed: () => false,
  };
  const c = new BubbleController(
    w,
    () => prefs,
    () => ({ x: 0, y: 0, width: 1920, height: 1040 }),
    () => {},
    (fn) => {
      timer = fn;
      return 1;
    },
    () => {},
  );
  return { w, c, prefs, expire: () => timer(), focused: () => focused };
}
test("a delivery while hidden shows compact without stealing focus and returns to tray", () => {
  const { c, w, expire, focused } = setup();
  c.delivery();
  assert.equal(c.mode, "compact");
  assert.equal(w.bounds.width, 260);
  assert.equal(w.isVisible(), true);
  assert.equal(focused(), 0);
  expire();
  assert.equal(w.isVisible(), false);
  assert.equal(c.mode, "expanded");
  assert.equal(w.pin, false);
});
test("disabled popups stay hidden and an explicitly open expanded panel is not collapsed", () => {
  const { c, w, prefs, expire } = setup();
  prefs.popupOnDelivery = false;
  c.delivery();
  assert.equal(w.isVisible(), false);
  prefs.popupOnDelivery = true;
  c.show();
  c.delivery();
  assert.equal(c.mode, "expanded");
  assert.equal(c.temporary, false);
});
test("user interaction cancels automatic hide and modes use configured opacity", () => {
  const { c, w, expire, prefs } = setup();
  c.delivery();
  c.show("expanded");
  expire();
  assert.equal(w.isVisible(), true);
  assert.equal(c.mode, "expanded");
  assert.equal(w.opacity, 0.8);
  c.hide();
  assert.equal(w.isVisible(), false);
});
test("display behaviour explicitly distinguishes updates-only, floating icon and tray only", () => {
  const { c, w, prefs, expire } = setup();
  prefs.visibilityMode = "updates";
  c.reconcile();
  assert.equal(w.isVisible(), false);
  c.delivery();
  assert.equal(w.isVisible(), true);
  expire();
  assert.equal(w.isVisible(), false);
  prefs.visibilityMode = "floating-icon";
  c.reconcile();
  assert.equal(w.isVisible(), true);
  assert.equal(c.mode, "icon");
  c.delivery();
  assert.equal(c.mode, "icon");
  prefs.visibilityMode = "tray";
  c.reconcile();
  assert.equal(w.isVisible(), false);
  c.delivery();
  assert.equal(w.isVisible(), false);
  prefs.visibilityMode = "always";
  c.reconcile();
  assert.equal(w.isVisible(), true);
});
