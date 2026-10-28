const { bubbleSize } = require("./preferences.cjs");
class BubbleController {
  constructor(
    win,
    preferences,
    workArea,
    changed = () => {},
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  ) {
    this.win = win;
    this.preferences = preferences;
    this.workArea = workArea;
    this.changed = changed;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.mode = this.preferredMode();
    this.temporary = false;
    this.generation = 0;
  }
  cancel() {
    this.generation++;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    this.temporary = false;
  }
  preferredMode() {
    const p = this.preferences();
    return p.visibilityMode === "floating-icon" ? "icon" : p.bubbleMode;
  }
  reconcile() {
    this.cancel();
    this.apply();
    const p = this.preferences();
    if (["updates", "tray"].includes(p.visibilityMode)) this.win.hide();
    else this.win.showInactive();
  }
  apply(mode = this.preferredMode()) {
    const p = this.preferences();
    this.mode = mode;
    const { width, height } = bubbleSize(p, mode);
    const old = this.win.getBounds();
    const area = this.workArea(old);
    const x = Math.max(
      area.x,
      Math.min(old.x + old.width - width, area.x + area.width - width),
    );
    const y = Math.max(
      area.y,
      Math.min(old.y + old.height - height, area.y + area.height - height),
    );
    this.win.setBounds({ x, y, width, height });
    this.win.setOpacity(p.opacity);
    this.win.setAlwaysOnTop(this.temporary || p.pin);
    this.changed();
  }
  show(mode = this.preferredMode()) {
    this.cancel();
    this.apply(mode);
    this.win.show();
    this.win.focus();
  }
  hide() {
    this.cancel();
    this.win.hide();
    this.apply();
  }
  delivery(kind = "delivery", force = false) {
    const p = this.preferences();
    if (
      !force &&
      (["tray", "floating-icon"].includes(p.visibilityMode) ||
        !(kind === "activity" ? p.popupOnActivity : p.popupOnDelivery))
    )
      return false;
    if (this.win.isVisible() && !this.temporary) {
      this.changed();
      return false;
    }
    this.cancel();
    this.temporary = true;
    this.apply("compact");
    this.win.showInactive();
    const generation = this.generation;
    this.timer = this.setTimer(() => {
      if (generation !== this.generation || this.win.isDestroyed()) return;
      this.win.hide();
      this.temporary = false;
      this.timer = null;
      this.apply();
    }, p.popupSeconds * 1000);
    return true;
  }
}
module.exports = { BubbleController };
