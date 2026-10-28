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
  "removeClaude",
  "timezone",
]);
contextBridge.exposeInMainWorld("tracker", {
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
});
