const { contextBridge, ipcRenderer } = require("electron");
const actions = new Set([
  "snapshot",
  "hide",
  "dashboard",
  "bubble",
  "pin",
  "copy",
  "note",
  "installClaude",
  "installCodex",
  "removeCodex",
  "removeClaude",
  "timezone",
  "refreshQuota",
  "soundResult",
  "testSound",
  "preferences",
  "quickPreferences",
  "settings",
  "bubbleMode",
  "previewPopup",
]);
contextBridge.exposeInMainWorld("tracker", {
  onAlarm: (callback) => {
    const listener = (_event, alert) => callback(alert);
    ipcRenderer.on("tracker:alarm", listener);
    return () => ipcRenderer.removeListener("tracker:alarm", listener);
  },
  request: (action, payload) => {
    if (!actions.has(action))
      return Promise.reject(Error("Unsupported action"));
    return ipcRenderer.invoke("tracker:request", action, payload);
  },
  subscribe: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("tracker:changed", listener);
    return () => ipcRenderer.removeListener("tracker:changed", listener);
  },
  onNavigate: (callback) => {
    const listener = (_event, section) => callback(section);
    ipcRenderer.on("tracker:navigate", listener);
    return () => ipcRenderer.removeListener("tracker:navigate", listener);
  },
});
