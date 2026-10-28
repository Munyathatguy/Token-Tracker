const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  screen,
  Notification,
  clipboard,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { Store } = require("./store.cjs");
const { Collector } = require("./collector.cjs");
const { startBridge } = require("./bridge.cjs");
const { briefing } = require("./core.cjs");
const { installClaude, uninstallClaude } = require("./installer.cjs");
app.setName("Token Tracker");
const capture = process.argv.includes("--capture");
const smoke = process.argv.includes("--smoke");
const runtimeRoot = path.join(
  app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, ".."),
  "runtime",
);
if (capture || smoke)
  app.setPath(
    "userData",
    path.join(runtimeRoot, capture ? "capture" : "smoke"),
  );
else app.setPath("userData", path.join(app.getPath("appData"), "TokenTracker"));
if (!app.requestSingleInstanceLock()) app.quit();
let store,
  collector,
  bridge,
  tray,
  bubble,
  dashboard,
  timer,
  quitting = false;
const notified = new Set();
const ui = path.join(__dirname, "..", "ui", "index.html");
function windowOptions(extra) {
  return {
    backgroundColor: "#172434",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
    ...extra,
  };
}
function guard(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}
function anchor() {
  const work = screen.getPrimaryDisplay().workArea;
  return {
    x: work.x + work.width - 390 - 18,
    y: work.y + work.height - 594 - 18,
  };
}
function showBubble() {
  if (!bubble) return;
  bubble.show();
  bubble.focus();
}
function showDashboard() {
  if (!dashboard) {
    dashboard = new BrowserWindow(
      windowOptions({
        width: 1220,
        height: 850,
        minWidth: 850,
        minHeight: 600,
        title: "Token Tracker · Dashboard",
        show: false,
        autoHideMenuBar: true,
      }),
    );
    guard(dashboard);
    dashboard.on("minimize", (e) => {
      e.preventDefault();
      dashboard.hide();
    });
    dashboard.loadFile(ui, { query: { view: "dashboard" } });
    dashboard.once("ready-to-show", () => dashboard.show());
  } else {
    dashboard.show();
    dashboard.focus();
  }
}
function snapshot() {
  const s = store.snapshot();
  s.accounts.sort((a, b) => b.at - a.at);
  return {
    ...s,
    collector: { lastScan: collector.lastScan, errors: collector.errors },
    claudeInstalled: !!store.get("settings", "claudeInstalled"),
  };
}
async function tick() {
  await collector.scan();
  const snap = snapshot();
  for (const w of [bubble, dashboard])
    if (w && !w.isDestroyed()) w.webContents.send("tracker:changed", snap);
  if (!capture && !smoke && snap.settings.notifications) {
    for (const a of snap.accounts)
      for (const [name, w] of [
        ["current", a.current],
        ["weekly", a.weekly],
      ]) {
        if (
          !w ||
          w.remaining > 15 ||
          w.state !== "reported" ||
          Date.now() - a.at > 600000
        )
          continue;
        const level = w.remaining <= 8 ? "wrap" : "prepare";
        const key = a.id + name + w.resetsAt + level;
        if (!notified.has(key)) {
          notified.add(key);
          if (Notification.isSupported())
            new Notification({
              title: `${a.client}: ${w.remaining}% ${name} allowance left`,
              body:
                level === "wrap"
                  ? "Finish verification and save a continuation checkpoint."
                  : "Prepare a stopping point before starting large work.",
            }).show();
        }
      }
  }
}
app
  .whenReady()
  .then(async () => {
    const home = app.getPath("userData");
    await fs.mkdir(home, { recursive: true });
    store = new Store(path.join(home, "tracker.sqlite"));
    collector = new Collector(store);
    bridge = await startBridge(store, home);
    const prefs = store.snapshot().settings;
    bubble = new BrowserWindow(
      windowOptions({
        width: 390,
        height: 594,
        minWidth: 390,
        minHeight: 400,
        frame: false,
        resizable: false,
        alwaysOnTop: prefs.pin,
        skipTaskbar: false,
        show: false,
        ...anchor(),
      }),
    );
    guard(bubble);
    bubble.once("ready-to-show", () => {
      if (!capture && !smoke) showBubble();
    });
    bubble.on("minimize", (e) => {
      e.preventDefault();
      bubble.hide();
    });
    bubble.loadFile(ui, {
      query: { view: "bubble", ...(capture ? { preview: "1" } : {}) },
    });
    const icon = nativeImage
      .createFromPath(path.join(__dirname, "..", "assets", "icon.png"))
      .resize({ width: 24, height: 24 });
    tray = new Tray(icon);
    tray.setToolTip("Token Tracker · remaining AI usage");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Show usage bubble", click: showBubble },
        { label: "Open dashboard", click: showDashboard },
        { type: "separator" },
        {
          label: "Keep bubble on top",
          type: "checkbox",
          checked: !!prefs.pin,
          click: (item) => {
            bubble.setAlwaysOnTop(item.checked);
            store.put("settings", "preferences", {
              ...store.snapshot().settings,
              pin: item.checked,
            });
          },
        },
        { type: "separator" },
        {
          label: "Quit Token Tracker",
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on("click", () => (bubble.isVisible() ? bubble.hide() : showBubble()));
    ipcMain.handle("tracker:request", async (event, action, payload) => {
      if (![bubble, dashboard].some((w) => w && w.webContents === event.sender))
        throw Error("Untrusted sender");
      if (action === "snapshot") return snapshot();
      if (action === "hide") {
        BrowserWindow.fromWebContents(event.sender).hide();
        return true;
      }
      if (action === "dashboard") {
        showDashboard();
        return true;
      }
      if (action === "bubble") {
        showBubble();
        return true;
      }
      if (action === "pin") {
        const pin = !bubble.isAlwaysOnTop();
        bubble.setAlwaysOnTop(pin);
        store.put("settings", "preferences", {
          ...store.snapshot().settings,
          pin,
        });
        return pin;
      }
      if (action === "copy") {
        const text = briefing(snapshot(), String(payload || ""));
        clipboard.writeText(text);
        return "Awareness update copied";
      }
      if (action === "note") {
        if (!payload || typeof payload.sessionId !== "string")
          throw Error("Invalid session");
        store.note(payload.sessionId, payload.kind, payload.body);
        return "Saved locally";
      }
      if (action === "timezone") {
        if (typeof payload !== "string" || payload.length > 100)
          throw Error("Invalid timezone");
        try {
          new Intl.DateTimeFormat(undefined, { timeZone: payload });
        } catch {
          throw Error(
            "Use a valid IANA timezone, for example Africa/Johannesburg",
          );
        }
        store.put("settings", "preferences", {
          ...store.snapshot().settings,
          timezone: payload,
        });
        return "Timezone saved";
      }
      if (action === "installClaude") {
        const cli = app.isPackaged
          ? path.join(process.resourcesPath, "bridge", "cli.cjs")
          : path.join(__dirname, "cli.cjs");
        const result = await installClaude(home, cli);
        store.put("settings", "claudeInstalled", true);
        return result.message;
      }
      if (action === "removeClaude") {
        const result = await uninstallClaude(home);
        store.put("settings", "claudeInstalled", false);
        return result.message;
      }
      throw Error("Unsupported action");
    });
    await tick();
    timer = setInterval(
      () =>
        tick().catch(() => {
          collector.errors = ["Collector error; last readings retained"];
        }),
      3000,
    );
    screen.on("display-metrics-changed", () =>
      bubble.setPosition(anchor().x, anchor().y),
    );
    app.on("second-instance", showBubble);
    if (capture || smoke) {
      await bubble.webContents.executeJavaScript(
        'new Promise(r=>document.readyState==="complete"?r():window.addEventListener("load",r))',
      );
      await new Promise((r) => setTimeout(r, 1200));
      const out = runtimeRoot;
      await fs.mkdir(out, { recursive: true });
      await fs.writeFile(
        path.join(out, capture ? "bubble-design.png" : "bubble-live.png"),
        (await bubble.webContents.capturePage()).toPNG(),
      );
      const result = {
        sessionCount: snapshot().sessions.length,
        accountCount: snapshot().accounts.length,
        sqlite: true,
        tray: !tray.isDestroyed(),
        renderer: await bubble.webContents.executeJavaScript(
          '({title:document.title,quotaRails:document.querySelectorAll(".quota-rail").length,body:document.body.innerText.includes("remaining")})',
        ),
      };
      showBubble();
      bubble.close();
      result.closeHides = !bubble.isVisible() && !bubble.isDestroyed();
      showBubble();
      result.restore = bubble.isVisible();
      showDashboard();
      await new Promise((r) =>
        dashboard.webContents.once("did-finish-load", r),
      );
      await new Promise((r) => setTimeout(r, 500));
      if (capture)
        await dashboard.webContents.executeJavaScript(
          'document.querySelector("#preview-toggle").click()',
        );
      await new Promise((r) => setTimeout(r, 250));
      await fs.writeFile(
        path.join(out, capture ? "dashboard-design.png" : "dashboard-live.png"),
        (await dashboard.webContents.capturePage()).toPNG(),
      );
      result.dashboard = await dashboard.webContents.executeJavaScript(
        '({sessions:document.querySelectorAll(".session-row").length,accounts:document.querySelectorAll(".account-card").length})',
      );
      if (
        !result.tray ||
        !result.closeHides ||
        !result.restore ||
        !result.renderer.body ||
        result.renderer.quotaRails !== 2
      )
        throw Error("Desktop smoke assertions failed");
      await fs.writeFile(
        path.join(out, capture ? "design-check.json" : "smoke-result.json"),
        JSON.stringify(result, null, 2),
      );
      quitting = true;
      app.quit();
    }
  })
  .catch((e) => {
    console.error(e);
    quitting = true;
    app.quit();
    process.exitCode = 1;
  });
app.on("window-all-closed", () => {});
app.on("before-quit", () => {
  quitting = true;
  clearInterval(timer);
});
app.on("will-quit", () => {
  tray?.destroy();
  bridge?.close().catch(() => {});
  if (!collector?.running) store?.close();
});
