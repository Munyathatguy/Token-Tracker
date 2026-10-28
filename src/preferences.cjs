const DEFAULTS = Object.freeze({
  pin: true,
  notifications: true,
  timezone: "Africa/Johannesburg",
  theme: "dark",
  opacity: 0.96,
  bubbleMode: "compact",
  compactWidth: 260,
  compactScale: 1,
  popupOnDelivery: true,
  popupOnActivity: true,
  popupSeconds: 5,
  startInTray: false,
  visibilityMode: "always",
  showContext: true,
  showCompactions: true,
  showClock: true,
  sessionRows: 3,
  preferredAccountId: "",
  alertWarnRemaining: 30,
  alertPrepareRemaining: 15,
  alertWrapRemaining: 8,
});
function validatePreferences(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw Error("Invalid settings");
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULTS, k)) throw Error("Unknown setting: " + k);
    if (
      [
        "pin",
        "notifications",
        "popupOnDelivery",
        "popupOnActivity",
        "startInTray",
        "showContext",
        "showCompactions",
        "showClock",
      ].includes(k)
    ) {
      if (typeof v !== "boolean") throw Error(k + " must be a boolean");
    }
    if (k === "theme" && !["light", "dark", "system"].includes(v))
      throw Error("Invalid theme");
    if (k === "bubbleMode" && !["compact", "expanded", "icon"].includes(v))
      throw Error("Invalid bubble mode");
    if (
      k === "visibilityMode" &&
      !["always", "updates", "floating-icon", "tray"].includes(v)
    )
      throw Error("Invalid display behaviour");
    const ranges = {
      opacity: [0.35, 1],
      compactWidth: [240, 380],
      compactScale: [0.8, 1.4],
      popupSeconds: [2, 15],
      sessionRows: [1, 5],
      alertWarnRemaining: [1, 99],
      alertPrepareRemaining: [1, 99],
      alertWrapRemaining: [1, 99],
    };
    if (
      ranges[k] &&
      (!Number.isFinite(v) || v < ranges[k][0] || v > ranges[k][1])
    )
      throw Error("Invalid " + k);
    if (
      [
        "sessionRows",
        "alertWarnRemaining",
        "alertPrepareRemaining",
        "alertWrapRemaining",
      ].includes(k) &&
      !Number.isInteger(v)
    )
      throw Error("Expected a whole number for " + k);
    if (k === "preferredAccountId" && (typeof v !== "string" || v.length > 300))
      throw Error("Invalid preferred account");
    if (k === "timezone") {
      if (typeof v !== "string" || v.length > 100)
        throw Error("Invalid timezone");
      try {
        new Intl.DateTimeFormat(undefined, { timeZone: v });
      } catch {
        throw Error("Invalid IANA timezone");
      }
    }
    out[k] = v;
  }
  return out;
}
function bubbleSize(prefs, mode = prefs.bubbleMode) {
  return mode === "icon"
    ? { width: 48, height: 48 }
    : mode === "expanded"
      ? { width: 350, height: 440 }
      : {
          width: Math.round(
            (prefs.compactWidth || 260) * (prefs.compactScale || 1),
          ),
          height: Math.round(96 * (prefs.compactScale || 1)),
        };
}
module.exports = { DEFAULTS, validatePreferences, bubbleSize };
