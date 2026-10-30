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
  nativeTheme,
  shell,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { Store } = require("./store.cjs");
const { Collector } = require("./collector.cjs");
const { startBridge, request } = require("./bridge.cjs");
const { briefing } = require("./core.cjs");
const {
  installClaude,
  uninstallClaude,
  installCodex,
  uninstallCodex,
} = require("./installer.cjs");
const { bubbleSize, DEFAULTS } = require("./preferences.cjs");
const { BubbleController } = require("./bubble.cjs");
const { AlertEngine } = require("./alerts.cjs");
const { CodexService } = require("./codex-service.cjs");
app.setName("Token Tracker");
if (process.platform === "win32")
  app.setAppUserModelId("local.tokentracker.desktop");
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
if (!app.requestSingleInstanceLock()) app.exit(0);
let store,
  collector,
  bridge,
  tray,
  bubble,
  dashboard,
  timer,
  quitting = false;
let alertEngine, codexService, quotaTimer, diagnosticTimer;
const startedAt = Date.now();
function runtimeDiagnostic(stage, error) {
  return fs
    .writeFile(
      path.join(app.getPath("userData"), "runtime-status.json"),
      JSON.stringify({
        pid: process.pid,
        startedAt,
        at: Date.now(),
        stage,
        quotaService: codexService?.status?.state || "not started",
        collectorRunning: collector?.running || false,
        lastScan: collector?.lastScan || null,
        error: error ? { name: error.name, code: error.code || null } : null,
      }),
    )
    .catch(() => {});
}
let bubbleControl,
  lastPopup = null,
  activityBaseline = false;
const seenActivity = new Set();
const ui = path.join(__dirname, "..", "ui", "index.html");
function windowOptions(extra) {
  return {
    backgroundColor: "#172434",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: "no-user-gesture-required",
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
      if (win === bubble && bubbleControl) bubbleControl.hide();
      else win.hide();
    }
  });
}
function anchor() {
  const work = screen.getPrimaryDisplay().workArea;
  const size = bubbleSize(store.snapshot().settings);
  return {
    x: work.x + work.width - size.width - 18,
    y: work.y + work.height - size.height - 18,
  };
}
function showBubble() {
  if (!bubble) return;
  bubbleControl.show();
}
function showDashboard(section = "overview") {
  if (typeof section !== "string") section = "overview";
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
    dashboard.loadFile(ui, {
      query: {
        view: "dashboard",
        section,
        ...(capture ? { preview: "1" } : {}),
      },
    });
    dashboard.once("ready-to-show", () => dashboard.show());
  } else {
    dashboard.show();
    dashboard.focus();
    dashboard.webContents.send("tracker:navigate", section);
  }
}
function snapshot() {
  const s = store.snapshot();
  s.accounts.sort((a, b) => b.at - a.at);
  return {
    ...s,
    collector: { lastScan: collector.lastScan, errors: collector.errors },
    claudeInstalled: !!store.get("settings", "claudeInstalled"),
    codexInstalled: !!store.get("settings", "codexInstalled"),
    effectiveTheme:
      s.settings.theme === "system"
        ? nativeTheme.shouldUseDarkColors
          ? "dark"
          : "light"
        : s.settings.theme,
    bubble: {
      mode: bubbleControl?.mode || s.settings.bubbleMode,
      temporary: !!bubbleControl?.temporary,
    },
    lastPopup,
    developerPreview: capture,
    codexService: codexService?.status || {
      state: "starting",
      lastRefresh: null,
    },
  };
}
function broadcast() {
  if (!store || !collector) return;
  const snap = snapshot();
  for (const win of [bubble, dashboard])
    if (win && !win.isDestroyed())
      win.webContents.send("tracker:changed", snap);
}
function setBubbleMode(mode) {
  store.updatePreferences(
    mode === "icon"
      ? { visibilityMode: "floating-icon" }
      : { bubbleMode: mode, visibilityMode: "always" },
  );
  bubbleControl.show(mode);
  updateTray();
  broadcast();
}
function updateTray() {
  if (!tray) return;
  const p = store.snapshot().settings;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show compact strip", click: () => setBubbleMode("compact") },
      { label: "Show expanded bubble", click: () => setBubbleMode("expanded") },
      { label: "Show floating icon", click: () => setBubbleMode("icon") },
      { label: "Hide to tray", click: () => bubbleControl.hide() },
      { label: "Open dashboard", click: () => showDashboard() },
      { label: "Settings", click: () => showDashboard("settings") },
      { type: "separator" },
      {
        label: "Keep bubble on top",
        type: "checkbox",
        checked: p.pin,
        click: (item) => {
          store.updatePreferences({ pin: item.checked });
          bubbleControl.apply(bubbleControl.mode);
          updateTray();
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
}
async function tick() {
  if (bridge) {
    try {
      const health = await bridge.checkHealth();
      store.put("settings", "bridgeHealth", health);
      if (health.repaired)
        store.recordAlert({
          id: "bridge-repaired:" + health.at,
          at: health.at,
          kind: "connection",
          title: "Model connection repaired",
          body: "A stale or missing connection descriptor was replaced after verifying the live bridge.",
          notification: "not requested",
          soundStatus: "disabled",
        });
    } catch {
      store.put("settings", "bridgeHealth", {
        state: "unavailable",
        at: Date.now(),
      });
    }
  }
  await collector.scan();
  const snap = snapshot();
  for (const e of [...snap.events].reverse()) {
    if (
      !seenActivity.has(e.id) &&
      activityBaseline &&
      Date.now() - e.at < 30000 &&
      [
        "Work started",
        "Response completed",
        "UserPromptSubmit",
        "Stop",
      ].includes(e.label)
    ) {
      lastPopup = {
        at: Date.now(),
        client: snap.sessions.find((s) => s.id === e.sessionId)?.client,
        label:
          e.label === "Work started"
            ? "AI work started"
            : e.label === "Response completed"
              ? "AI response finished"
              : e.label === "Stop"
                ? "AI response finished"
                : "Prompt observed",
      };
      bubbleControl.delivery("activity");
    }
    seenActivity.add(e.id);
  }
  activityBaseline = true;
  if (seenActivity.size > 2000) {
    seenActivity.clear();
    for (const e of snap.events) seenActivity.add(e.id);
  }
  broadcast();
  evaluateAlerts();
}
function evaluateAlerts() {
  if (!alertEngine) return;
  const alerts = alertEngine.evaluate();
  for (const alert of alerts) {
    if (capture || smoke) {
      store.updateAlert(alert.id, {
        notification: "test mode",
        soundStatus: "test mode",
      });
      continue;
    }
    if (store.snapshot().settings.notifications && Notification.isSupported()) {
      const notification = new Notification({
        title: alert.title,
        body: alert.body,
      });
      store.updateAlert(alert.id, { notification: "requested" });
      notification.on("show", () => {
        store.updateAlert(alert.id, { notification: "shown by OS" });
        broadcast();
      });
      notification.on("failed", () => {
        store.updateAlert(alert.id, { notification: "failed" });
        broadcast();
      });
      notification.show();
    } else
      store.updateAlert(alert.id, { notification: "disabled or unavailable" });
    if (alert.sound) sendSound(alert);
    lastPopup = {
      at: Date.now(),
      client: alert.client,
      label:
        alert.kind === "reset-due"
          ? "Reset time reached"
          : alert.kind === "available"
            ? "Usage available"
            : alert.title,
    };
    bubbleControl?.delivery("activity");
  }
  if (alerts.length) broadcast();
}
function sendSound(alert) {
  if (!bubble || bubble.isDestroyed()) {
    store.updateAlert(alert.id, {
      soundStatus: "failed: audio window unavailable",
    });
    return;
  }
  const send = () => bubble.webContents.send("tracker:alarm", alert);
  if (bubble.webContents.isLoading())
    bubble.webContents.once("did-finish-load", send);
  else send();
}
app
  .whenReady()
  .then(async () => {
    const home = app.getPath("userData");
    await fs.mkdir(home, { recursive: true });
    await runtimeDiagnostic("starting");
    diagnosticTimer = setInterval(() => runtimeDiagnostic("running"), 30000);
    store = new Store(path.join(home, "tracker.sqlite"));
    if (app.isPackaged && process.platform === "win32" && !capture && !smoke) {
      try {
        const shortcut = path.join(
          app.getPath("appData"),
          "Microsoft",
          "Windows",
          "Start Menu",
          "Programs",
          "Token Tracker (local companion).lnk",
        );
        let exists = false;
        try {
          await fs.access(shortcut);
          exists = true;
        } catch {}
        if (!exists) {
          const ok = shell.writeShortcutLink(shortcut, "create", {
            target: process.execPath,
            cwd: path.dirname(process.execPath),
            appUserModelId: "local.tokentracker.desktop",
            description: "Local AI usage and reset alarms",
          });
          store.put(
            "settings",
            "notificationShortcut",
            ok ? "created" : "unavailable",
          );
        } else store.put("settings", "notificationShortcut", "existing");
      } catch {
        store.put("settings", "notificationShortcut", "unavailable");
      }
    }
    if (capture || smoke)
      store.updatePreferences({
        ...DEFAULTS,
        bubbleMode: "compact",
        compactWidth: 260,
        compactScale: 1,
        theme: "dark",
        opacity: 1,
        popupSeconds: 2,
        popupOnDelivery: true,
        popupOnActivity: false,
        startInTray: false,
        visibilityMode: "always",
      });
    collector = new Collector(store);
    alertEngine = new AlertEngine(store);
    codexService = new CodexService(store, {
      changed: () => {
        evaluateAlerts();
        broadcast();
      },
    });
    bridge = await startBridge(store, home, (delivery) => {
      lastPopup = {
        at: delivery.at,
        client: delivery.client,
        label: "Update supplied · " + delivery.client,
      };
      bubbleControl?.delivery();
      broadcast();
    });
    const prefs = store.snapshot().settings;
    bubble = new BrowserWindow(
      windowOptions({
        ...bubbleSize(prefs),
        minWidth: 48,
        minHeight: 48,
        frame: false,
        resizable: false,
        alwaysOnTop: prefs.pin,
        skipTaskbar: true,
        transparent: true,
        backgroundColor: "#00000000",
        show: false,
        ...anchor(),
      }),
    );
    guard(bubble);
    bubbleControl = new BubbleController(
      bubble,
      () => store.snapshot().settings,
      (bounds) => screen.getDisplayMatching(bounds).workArea,
      broadcast,
    );
    bubbleControl.apply();
    bubble.once("ready-to-show", () => {
      if (!capture && !smoke) bubbleControl.reconcile();
    });
    bubble.on("minimize", (e) => {
      e.preventDefault();
      bubbleControl.hide();
    });
    bubble.loadFile(ui, {
      query: { view: "bubble", ...(capture ? { preview: "1" } : {}) },
    });
    const icon = nativeImage
      .createFromPath(path.join(__dirname, "..", "assets", "icon.png"))
      .resize({ width: 24, height: 24 });
    tray = new Tray(icon);
    tray.setToolTip("Token Tracker · remaining AI usage");
    updateTray();
    tray.on("click", () =>
      bubble.isVisible() ? bubbleControl.hide() : showBubble(),
    );
    ipcMain.handle("tracker:request", async (event, action, payload) => {
      if (![bubble, dashboard].some((w) => w && w.webContents === event.sender))
        throw Error("Untrusted sender");
      if (action === "snapshot") return snapshot();
      if (action === "refreshQuota") {
        await codexService.refresh();
        evaluateAlerts();
        broadcast();
        return codexService.status;
      }
      if (action === "soundResult") {
        if (
          !payload ||
          !["completed", "failed"].includes(payload.status) ||
          typeof payload.id !== "string"
        )
          throw Error("Invalid sound result");
        store.updateAlert(payload.id, { soundStatus: payload.status });
        broadcast();
        return true;
      }
      if (action === "testSound") {
        const alert = {
          id: "sound-test:" + Date.now(),
          at: Date.now(),
          kind: "test",
          title: "Alarm sound test",
          body: "User-requested local alarm test.",
          volume: store.snapshot().settings.soundVolume,
          soundStatus: "pending",
          notification: "not requested",
        };
        store.recordAlert(alert);
        sendSound(alert);
        return "Playing test sound";
      }
      if (action === "hide") {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win === bubble) bubbleControl.hide();
        else win.hide();
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
      if (action === "settings") {
        showDashboard("settings");
        return true;
      }
      if (action === "previewPopup") {
        lastPopup = { at: Date.now(), label: "Preview · no AI update" };
        bubbleControl.hide();
        bubbleControl.delivery("delivery", true);
        broadcast();
        return true;
      }
      if (action === "bubbleMode") {
        setBubbleMode(payload);
        return true;
      }
      if (action === "preferences") {
        const next = store.updatePreferences(payload);
        bubbleControl.reconcile();
        updateTray();
        broadcast();
        return next;
      }
      if (action === "quickPreferences") {
        const mode = bubbleControl.mode;
        const next = store.updatePreferences(payload);
        bubbleControl.cancel();
        bubbleControl.apply(mode);
        updateTray();
        broadcast();
        return next;
      }
      if (action === "pin") {
        const pin = !bubble.isAlwaysOnTop();
        store.updatePreferences({ pin });
        bubbleControl.apply(bubbleControl.mode);
        updateTray();
        broadcast();
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
      if (action === "installCodex") {
        const cli = path.join(home, "bridge", "cli.cjs");
        await fs.mkdir(path.dirname(cli), { recursive: true });
        await fs.copyFile(
          app.isPackaged
            ? path.join(process.resourcesPath, "bridge", "cli.cjs")
            : path.join(__dirname, "cli.cjs"),
          cli,
        );
        const result = await installCodex(home, cli);
        store.put("settings", "codexInstalled", true);
        store.recordAlert({
          id: "codex-hooks-configured:" + Date.now(),
          at: Date.now(),
          kind: "connection",
          title: "Codex hooks configured — trust review required",
          body: result.message,
          notification: "not requested",
          soundStatus: "disabled",
        });
        return result.message;
      }
      if (action === "removeCodex") {
        const result = await uninstallCodex(home);
        store.put("settings", "codexInstalled", false);
        return result.message;
      }
      if (action === "removeClaude") {
        const result = await uninstallClaude(home);
        store.put("settings", "claudeInstalled", false);
        return result.message;
      }
      throw Error("Unsupported action");
    });
    if (!capture && !smoke) {
      codexService.refresh();
      quotaTimer = setInterval(() => codexService.refresh(), 60000);
    }
    timer = setInterval(
      () =>
        tick().catch(() => {
          collector.errors = ["Collector error; last readings retained"];
        }),
      3000,
    );
    await tick();
    screen.on("display-metrics-changed", () =>
      bubbleControl.apply(bubbleControl.mode),
    );
    screen.on("display-removed", () => bubbleControl.apply(bubbleControl.mode));
    nativeTheme.on("updated", broadcast);
    app.on("second-instance", showBubble);
    if (capture || smoke) {
      await bubble.webContents.executeJavaScript(
        'new Promise(r=>document.readyState==="complete"?r():window.addEventListener("load",r))',
      );
      await new Promise((r) => setTimeout(r, 1200));
      const out = runtimeRoot;
      await fs.mkdir(out, { recursive: true });
      await fs.rm(
        path.join(out, capture ? "design-check.json" : "smoke-result.json"),
        { force: true },
      );
      await fs.writeFile(
        path.join(out, capture ? "bubble-design.png" : "bubble-live.png"),
        (await bubble.webContents.capturePage()).toPNG(),
      );
      const result = {
        sessionCount: snapshot().sessions.length,
        accountCount: snapshot().accounts.length,
        sqlite: true,
        tray: !tray.isDestroyed(),
        compactSize: bubble.getSize(),
        renderer: await bubble.webContents.executeJavaScript(
          '({title:document.title,compact:!!document.querySelector(".compact-bubble"),noVerticalOverflow:document.body.scrollHeight<=innerHeight,theme:document.documentElement.dataset.theme})',
        ),
      };
      showBubble();
      bubble.close();
      result.closeHides = !bubble.isVisible() && !bubble.isDestroyed();
      showBubble();
      result.restore = bubble.isVisible();
      bubbleControl.hide();
      const supplied = await request(bridge.descriptor, {
        action: "status",
        target: "model",
      });
      await request(bridge.descriptor, {
        action: "delivery",
        deliveryId: supplied.deliveryId,
      });
      result.popup = {
        visible: bubble.isVisible(),
        compact: bubbleControl.mode === "compact",
        focused: bubble.isFocused(),
      };
      await new Promise((r) => setTimeout(r, 2250));
      result.popup.autoHides = !bubble.isVisible();
      bubbleControl.show("expanded");
      await new Promise((r) => setTimeout(r, 200));
      result.expandedSize = bubble.getSize();
      if (capture)
        await fs.writeFile(
          path.join(out, "bubble-expanded-design.png"),
          (await bubble.webContents.capturePage()).toPNG(),
        );
      bubbleControl.show("icon");
      await new Promise((r) => setTimeout(r, 150));
      result.iconSize = bubble.getSize();
      if (capture)
        await fs.writeFile(
          path.join(out, "bubble-icon-design.png"),
          (await bubble.webContents.capturePage()).toPNG(),
        );
      showDashboard();
      await new Promise((r) =>
        dashboard.webContents.once("did-finish-load", r),
      );
      await new Promise((r) => setTimeout(r, 300));
      await new Promise((r) => setTimeout(r, 200));
      await fs.writeFile(
        path.join(out, capture ? "dashboard-design.png" : "dashboard-live.png"),
        (await dashboard.webContents.capturePage()).toPNG(),
      );
      dashboard.webContents.send("tracker:navigate", "settings");
      await new Promise((r) => setTimeout(r, 150));
      await dashboard.webContents.executeJavaScript(
        `(()=>{const f=document.querySelector('#preferences-form');f.elements.theme.value='light';f.elements.opacity.value='65';f.elements.compactWidth.value='280';f.elements.bubbleMode.value='compact';f.requestSubmit();})()`,
      );
      await new Promise((r) => setTimeout(r, 350));
      result.savedSettings = store.snapshot().settings;
      result.settingsPersisted =
        result.savedSettings.theme === "light" &&
        result.savedSettings.opacity === 0.65 &&
        result.savedSettings.compactWidth === 280;
      result.nativeOpacity = bubble.getOpacity();
      result.lightTheme = await dashboard.webContents.executeJavaScript(
        "document.documentElement.dataset.theme",
      );
      if (capture)
        await fs.writeFile(
          path.join(out, "settings-design.png"),
          (await dashboard.webContents.capturePage()).toPNG(),
        );
      store.updatePreferences({ compactWidth: 260, opacity: 1 });
      bubbleControl.show("compact");
      broadcast();
      await new Promise((r) => setTimeout(r, 150));
      if (capture)
        await fs.writeFile(
          path.join(out, "bubble-light-design.png"),
          (await bubble.webContents.capturePage()).toPNG(),
        );
      await bubble.webContents.executeJavaScript(
        'document.querySelector("[data-quick=larger]").click()',
      );
      await new Promise((r) => setTimeout(r, 200));
      result.quickSize =
        store.snapshot().settings.compactScale === 1.1 &&
        Math.abs(bubble.getSize()[0] - 286) <= 1;
      await bubble.webContents.executeJavaScript(
        'document.querySelector("[data-quick=opacity]").click()',
      );
      await new Promise((r) => setTimeout(r, 150));
      result.quickOpacity = Math.abs(bubble.getOpacity() - 0.75) < 0.02;
      await bubble.webContents.executeJavaScript(
        'document.querySelector("[data-quick=pin]").click()',
      );
      await new Promise((r) => setTimeout(r, 150));
      result.quickPin = !bubble.isAlwaysOnTop();
      await dashboard.webContents.executeJavaScript(
        `(()=>{const f=document.querySelector('#preferences-form');f.elements.showContext.checked=false;f.elements.showCompactions.checked=false;f.elements.visibilityMode.value='always';f.requestSubmit();})()`,
      );
      await new Promise((r) => setTimeout(r, 200));
      result.visibilityControls = await bubble.webContents.executeJavaScript(
        '!document.querySelector(".compact-context") && !document.querySelector(".compact-risk")',
      );
      const soundTest = {
        id: "silent-native-audio-test:" + Date.now(),
        at: Date.now(),
        kind: "test",
        title: "Silent automated audio transport test",
        body: "Volume zero: this verifies playback scheduling and receipt, not audible speakers.",
        volume: 0,
        soundStatus: "pending",
        notification: "test mode",
      };
      store.recordAlert(soundTest);
      sendSound(soundTest);
      for (let i = 0; i < 20; i++) {
        if (
          store.snapshot().alerts.find((a) => a.id === soundTest.id)
            ?.soundStatus !== "pending"
        )
          break;
        await new Promise((r) => setTimeout(r, 100));
      }
      result.audioReceipt = store
        .snapshot()
        .alerts.find((a) => a.id === soundTest.id)?.soundStatus;
      await dashboard.loadFile(ui, {
        query: { view: "dashboard", preview: "1", scenario: "exhausted" },
      });
      await new Promise((r) => setTimeout(r, 250));
      result.exhaustedUI = await dashboard.webContents.executeJavaScript(
        '({cards:document.querySelectorAll(".account-card").length,figures:[...document.querySelectorAll(".account-card .quota-number")].map(e=>e.textContent),previewButton:!!document.querySelector("#preview-toggle")})',
      );
      if (capture)
        await fs.writeFile(
          path.join(out, "quota-exhausted-regression.png"),
          (await dashboard.webContents.capturePage()).toPNG(),
        );
      if (
        !result.tray ||
        !result.closeHides ||
        !result.restore ||
        !result.renderer.compact ||
        !result.renderer.noVerticalOverflow ||
        Math.abs(result.compactSize[0] - 260) > 1 ||
        Math.abs(result.compactSize[1] - 96) > 1 ||
        !result.popup.visible ||
        !result.popup.compact ||
        !result.popup.autoHides ||
        result.popup.focused ||
        !result.settingsPersisted ||
        !result.quickSize ||
        !result.quickOpacity ||
        !result.quickPin ||
        !result.visibilityControls ||
        result.audioReceipt !== "completed" ||
        result.exhaustedUI.cards !== 1 ||
        !result.exhaustedUI.figures[0].includes("0%") ||
        !result.exhaustedUI.figures[1].includes("84%") ||
        result.exhaustedUI.previewButton ||
        result.lightTheme !== "light" ||
        Math.abs(result.nativeOpacity - 0.65) > 0.02
      )
        throw Error(
          "Desktop appearance/lifecycle smoke assertions failed: " +
            JSON.stringify(result),
        );
      await fs.writeFile(
        path.join(out, capture ? "design-check.json" : "smoke-result.json"),
        JSON.stringify(result, null, 2),
      );
      quitting = true;
      app.quit();
    }
  })
  .catch((e) => {
    runtimeDiagnostic("startup failed", e);
    console.error(e);
    quitting = true;
    app.quit();
    process.exitCode = 1;
    app.exit(1);
  });
app.on("window-all-closed", () => {});
app.on("before-quit", () => {
  quitting = true;
  clearInterval(timer);
  clearInterval(quotaTimer);
  clearInterval(diagnosticTimer);
  codexService?.close();
});
app.on("will-quit", () => {
  tray?.destroy();
  bridge?.close().catch(() => {});
  if (!collector?.running) store?.close();
});
