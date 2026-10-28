const params = new URLSearchParams(location.search);
const isBubble = params.get("view") !== "dashboard";
let live = null,
  preview = params.has("preview"),
  view = params.get("section") || "overview",
  filter = "recent",
  selected = null,
  accountChoice = null;
const drafts = new Map();
let settingsDraft = null;
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const zone = () => live?.settings?.timezone || "Africa/Johannesburg";
const time = (t) =>
  t
    ? new Date(t).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: zone(),
      })
    : "Unknown";
const reset = (t) =>
  t
    ? new Date(t).toLocaleString([], {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: zone(),
      })
    : "Reset unavailable";
const age = (t) =>
  !t
    ? "Not observed"
    : Date.now() - t < 60000
      ? "Just updated"
      : Math.floor((Date.now() - t) / 60000) + "m ago";
const clock = () =>
  new Date().toLocaleString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone(),
  });
function demo() {
  const now = Date.now();
  const result = {
    at: now,
    accounts: [
      {
        id: "demo-codex",
        client: "Codex",
        owner: "preview",
        bucket: "codex",
        at: now,
        current: { remaining: 18, resetsAt: now + 5400000, state: "reported" },
        weekly: {
          remaining: 64,
          resetsAt: now + 3 * 86400000,
          state: "reported",
        },
      },
      {
        id: "demo-claude",
        client: "Claude",
        owner: "preview",
        bucket: "claude",
        at: now,
        current: { remaining: 72, resetsAt: now + 7200000, state: "reported" },
        weekly: {
          remaining: 41,
          resetsAt: now + 2 * 86400000,
          state: "reported",
        },
      },
    ],
    sessions: [
      {
        id: "demo-1",
        client: "Codex",
        project: "Token Tracker",
        model: "Example model",
        status: "Working",
        lastActivity: now,
        context: { used: 68 },
        compactions: 2,
        risk: { score: 68, level: "Elevated" },
        coverage: "Illustrative preview",
      },
      {
        id: "demo-2",
        client: "Claude",
        project: "Website refresh",
        status: "Waiting",
        lastActivity: now - 120000,
        context: { used: 32 },
        compactions: 0,
        risk: { score: 32, level: "Low" },
        coverage: "Illustrative preview",
      },
      {
        id: "demo-3",
        client: "Codex",
        project: "Documentation",
        status: "Waiting",
        lastActivity: now - 600000,
        context: { used: 84 },
        compactions: 3,
        risk: { score: 84, level: "High" },
        coverage: "Illustrative preview",
      },
    ],
    events: [
      { sessionId: "demo-1", at: now - 120000, label: "Work started" },
      { sessionId: "demo-1", at: now - 420000, label: "Context compacted" },
      { sessionId: "demo-2", at: now - 600000, label: "Response completed" },
    ],
    notes: [],
    settings: { pin: true },
    collector: { lastScan: now, errors: [] },
    integrations: live?.integrations || {},
    claudeInstalled: false,
  };
  if (params.get("scenario") === "exhausted") {
    result.accounts = [result.accounts[0]];
    result.accounts[0].current.remaining = 0;
    result.accounts[0].weekly.remaining = 84;
    result.alerts = [
      {
        title: "Codex current allowance exhausted — 0% left",
        body: "Illustrative regression case: weekly allowance remains independent.",
        at: now,
        notification: "example only",
        soundStatus: "disabled",
      },
    ];
  }
  return result;
}
function quota(w, a) {
  const n = Number.isFinite(w?.remaining) ? w.remaining : null;
  const at = w?.reportedAt || a?.at;
  const stale = !at || Date.now() - at > 600000;
  const due = w?.resetsAt && w.resetsAt <= Date.now();
  const minutes = w?.resetsAt
    ? Math.max(0, Math.ceil((w.resetsAt - Date.now()) / 60000))
    : null;
  return `<div class="quota-number mono">${n === null ? "Not reported" : esc(n) + "%"}<small>${n === null ? "" : due || stale ? "last reported left" : "remaining"}</small></div><div class="bar quota-rail ${n === null ? "unknown" : n <= (live?.settings.alertWrapRemaining ?? 8) ? "red" : n <= (live?.settings.alertWarnRemaining ?? 30) ? "amber" : ""}"><span style="width:${n ?? 0}%"></span></div><div class="reset">${w?.resetsAt ? "Reset " + reset(w.resetsAt) + (due ? " · time reached, checking" : minutes < 60 ? " · in " + minutes + "m" : " · in " + Math.floor(minutes / 60) + "h " + (minutes % 60) + "m") : "Reset not reported"}</div>${stale ? '<div class="tiny muted">Last report ' + age(at) + "; retained independently</div>" : ""}`;
}
// Styles set in generated markup are restricted to numeric percentages from normalised data.
function spectrum(s) {
  const score = s.risk?.score;
  return `<div class="spectrum" title="Continuity-risk heuristic, not measured performance"><i style="left:${score ?? 0}%;${score === null ? "display:none" : ""}"></i></div>`;
}
function bubble(s) {
  if (s.bubble?.mode === "icon")
    return `<button class="floating-icon" data-mode="compact" title="Show Token Tracker usage strip" aria-label="Show Token Tracker usage strip"><span>◴</span><i></i></button>`;
  if ((s.bubble?.mode || s.settings.bubbleMode) === "compact")
    return compactBubble(s);
  const a =
    s.accounts.find(
      (a) => a.id === (accountChoice || s.settings.preferredAccountId),
    ) || s.accounts[0];
  const sessions = s.sessions
    .filter((x) => !x.stale)
    .slice(0, s.settings.sessionRows || 3);
  return `<div class="bubble ${s.settings.showContext === false ? "hide-context" : ""} ${s.settings.showCompactions === false ? "hide-compactions" : ""} ${s.settings.showClock === false ? "hide-clock" : ""}"><header class="titlebar"><div class="brand"><span class="mark">◴</span>Token Tracker</div><div><button class="icon-btn" data-action="settings" title="Settings" aria-label="Settings">⚙</button><button class="icon-btn" data-mode="compact" title="Collapse to compact strip" aria-label="Collapse to compact strip">⤡</button><button class="icon-btn" data-action="pin" title="Toggle always on top" aria-label="Toggle always on top">⌖</button><button class="icon-btn" data-action="hide" title="Minimise to tray" aria-label="Minimise to tray">−</button></div></header><div class="bubble-main"><div class="bubble-quick">${quickControls(s)}<span class="muted tiny">Size · opacity · theme · pin</span></div><div class="row clock-row"><span class="muted bubble-clock">${clock()}</span>${preview ? '<span class="tag preview">DESIGN PREVIEW</span>' : '<span class="tiny"><span class="dot"></span>LOCAL</span>'}</div><div class="row quota-title"><select id="account-select" aria-label="Choose account allowance">${s.accounts.map((v, i) => `<option value="${esc(v.id)}" ${v.id === a?.id ? "selected" : ""}>${esc(v.client)} · profile ${i + 1}</option>`).join("") || "<option>Account allowance</option>"}</select><span class="tiny muted">Shared across chats</span></div><div class="quota-block"><div class="name">Current usage window${a?.current?.minutes ? " · " + Math.round(a.current.minutes / 60) + "h" : ""}</div>${quota(a?.current, a)}</div><div class="quota-block"><div class="name">Weekly allowance</div>${quota(a?.weekly, a)}</div><div class="bubble-section"><div class="row"><span class="eyebrow">Sessions</span><span class="tiny muted">${s.sessions.filter((x) => !x.stale).length} recent</span></div>${sessions.length ? sessions.map((x) => `<div class="bubble-session"><div class="row"><strong>${esc(x.project || x.client)}</strong><span class="tiny muted">${esc(x.status || "Observed")}</span></div><div class="session-sub"><span class="session-context">${esc(x.client)} · context ${x.context ? Math.round(x.context.used) + "% used" : "unavailable"}</span><span class="session-compactions">${x.compactions || 0} compactions</span></div>${spectrum(x)}</div>`).join("") : '<div class="empty">Waiting for session readings.<br>Open the dashboard to connect a client.</div>'}</div></div><footer class="bubble-footer"><span>${preview ? "Illustrative data" : age(a?.at)}<br>Context scale = continuity risk</span><button data-action="dashboard">Dashboard ↗</button></footer></div>`;
}
function quickControls(s) {
  const p = s.settings;
  return `<div class="quick-controls"><button data-quick="smaller" title="Smaller bubble (${Math.round(p.compactScale * 100)}%)" aria-label="Smaller bubble">A−</button><button data-quick="larger" title="Larger bubble (${Math.round(p.compactScale * 100)}%)" aria-label="Larger bubble">A+</button><button class="opacity-quick" data-quick="opacity" title="Opacity ${Math.round(p.opacity * 100)}%, transparency ${Math.round((1 - p.opacity) * 100)}% — click to cycle" aria-label="Cycle bubble opacity">${Math.round(p.opacity * 100)}%</button><button data-quick="theme" title="Switch light / dark theme" aria-label="Switch light / dark theme">${live?.effectiveTheme === "light" ? "☾" : "☼"}</button><button data-quick="visibility" title="${p.visibilityMode === "updates" ? "Show bubble all the time" : "Show only on AI updates / activity"}" aria-label="Toggle always visible / updates only">${p.visibilityMode === "updates" ? "◌" : "◉"}</button><button data-quick="pin" class="${p.pin ? "enabled" : ""}" aria-pressed="${p.pin}" title="${p.pin ? "Disable" : "Enable"} always on top" aria-label="Toggle always on top">⌖</button></div>`;
}
function compactBubble(s) {
  const a =
    (s.bubble?.temporary && s.lastPopup?.client
      ? s.accounts.find((a) => a.client === s.lastPopup.client)
      : null) ||
    s.accounts.find(
      (a) => a.id === (accountChoice || s.settings.preferredAccountId),
    ) ||
    s.accounts[0];
  const session =
    s.sessions.find((x) => !x.stale && x.client === a?.client) ||
    s.sessions.find((x) => !x.stale);
  const pct = (w) =>
    Number.isFinite(w?.remaining)
      ? `${Math.round(w.remaining)}<small>%</small>`
      : '<span class="unavailable" title="Provider has not reported this window">?</span>';
  const stale = !a || Date.now() - a.at > 600000;
  const notice = s.bubble?.temporary
    ? s.lastPopup?.label
    : preview
      ? "Design preview"
      : stale
        ? "Stale reading"
        : "Reported";
  return `<section class="compact-bubble"><header class="compact-header"><span class="compact-source"><span class="dot"></span>${esc(a?.client || "Token Tracker")}</span><span class="compact-notice" title="${esc(notice)}">${esc(notice || "Reported")}</span><div class="compact-controls">${quickControls(s)}<button class="icon-btn" data-action="settings" title="Settings" aria-label="Settings">⚙</button><button class="icon-btn" data-mode="expanded" title="Expand bubble" aria-label="Expand bubble">⤢</button><button class="icon-btn" data-action="hide" title="Hide to tray" aria-label="Hide to tray">−</button></div></header><button class="compact-metrics ${s.settings.showContext === false ? "no-context" : ""}" data-action="dashboard" title="Open detailed usage dashboard"><span><small title="${esc(reset(a?.current?.resetsAt))}">Current left</small><strong class="mono">${pct(a?.current)}</strong></span><span><small title="${esc(reset(a?.weekly?.resetsAt))}">Weekly left</small><strong class="mono">${pct(a?.weekly)}</strong></span>${s.settings.showContext !== false ? `<span class="compact-context"><small>Context used</small><b class="mono">${session?.context ? Math.round(session.context.used) + "%" : "—"}</b>${s.settings.showCompactions !== false ? `<em>↻ ${session?.compactions || 0}</em>` : ""}</span>` : ""}</button><footer class="compact-footer">${s.settings.showContext !== false ? `<span class="compact-risk">${spectrum(session || {})}</span>` : ""}<span>${stale ? "stale · " : ""}${[s.settings.showClock !== false ? time(Date.now()) : "", s.settings.showCompactions !== false ? (session?.compactions || 0) + " compactions" : ""].filter(Boolean).join(" · ") || "Shared account allowance"}</span></footer><div class="compact-resets" title="Current reset ${esc(reset(a?.current?.resetsAt))}; weekly reset ${esc(reset(a?.weekly?.resetsAt))}">Reset ${a?.current?.resetsAt ? time(a.current.resetsAt) : "not reported"} · Weekly ${a?.weekly?.resetsAt ? reset(a.weekly.resetsAt) : "not reported"}</div></section>`;
}
function settingsView(s) {
  const p = settingsDraft || s.settings;
  return `<section class="panel settings-panel"><h2>Desktop bubble</h2><p class="muted">Keep the strip small. Expand only when you need more detail. Changes are saved on this computer.</p><form id="preferences-form"><div class="settings-grid"><label>Display behaviour<select class="field" name="visibilityMode">${[
    ["always", "Always visible"],
    ["updates", "Only on AI updates / activity"],
    ["floating-icon", "Floating icon only"],
    ["tray", "Tray icon only — no pop-ups"],
  ]
    .map(
      ([k, l]) =>
        `<option value="${k}" ${p.visibilityMode === k ? "selected" : ""}>${l}</option>`,
    )
    .join(
      "",
    )}</select></label><label>Default bubble view<select class="field" name="bubbleMode">${[
    ["compact", "Compact strip"],
    ["expanded", "Expanded panel"],
  ]
    .map(
      ([k, l]) =>
        `<option value="${k}" ${p.bubbleMode === k ? "selected" : ""}>${l}</option>`,
    )
    .join(
      "",
    )}</select></label><label>Colour theme<select class="field" name="theme">${["dark", "light", "system"].map((k) => `<option value="${k}" ${p.theme === k ? "selected" : ""}>${k[0].toUpperCase() + k.slice(1)}</option>`).join("")}</select></label><label>Overall compact size <output id="scale-value">${Math.round(p.compactScale * 100)}%</output><input class="field" name="compactScale" type="range" min="80" max="140" step="10" value="${Math.round(p.compactScale * 100)}"><small class="muted">Scales the whole strip, including text. Quick A− / A+ controls are on the bubble.</small></label><label>Compact width <output id="width-value">${p.compactWidth}px</output><input class="field" name="compactWidth" type="range" min="240" max="380" step="10" value="${p.compactWidth}"><small class="muted">Default 260 × 96 logical pixels. Windows display scaling also affects size.</small></label><label>Bubble opacity <output id="opacity-value">${Math.round(p.opacity * 100)}%</output><input class="field" name="opacity" type="range" min="35" max="100" step="1" value="${Math.round(p.opacity * 100)}"><small class="muted">35% is more transparent; 100% is fully opaque. Dashboard stays opaque.</small></label><label>Pop-up duration<select class="field" name="popupSeconds">${[2, 3, 5, 8, 10, 15].map((n) => `<option value="${n}" ${p.popupSeconds === n ? "selected" : ""}>${n} seconds</option>`).join("")}</select></label><label>Display timezone<input name="timezone" class="field" value="${esc(p.timezone)}"></label><label>Account shown in bubble<select class="field" name="preferredAccountId"><option value="">Automatic · latest reported</option>${s.accounts.map((a, i) => `<option value="${esc(a.id)}" ${a.id === p.preferredAccountId ? "selected" : ""}>${esc(a.client)} · profile ${i + 1}</option>`).join("")}</select></label><label>Session rows in expanded view<select class="field" name="sessionRows">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${p.sessionRows === n ? "selected" : ""}>${n} session${n === 1 ? "" : "s"}</option>`).join("")}</select></label>${[
    ["alertWarnRemaining", "Warning"],
    ["alertPrepareRemaining", "Prepare to finish"],
    ["alertWrapRemaining", "Wrap up"],
  ]
    .map(
      ([k, l]) =>
        `<label>${l} at % remaining<input class="field" name="${k}" type="number" min="1" max="99" value="${p[k]}"></label>`,
    )
    .join(
      "",
    )}<label>Alarm volume <output id="volume-value">${Math.round(p.soundVolume * 100)}%</output><input class="field" name="soundVolume" type="range" min="0" max="100" value="${Math.round(p.soundVolume * 100)}"></label></div><div class="settings-checks">${[
    ["pin", "Keep the bubble above other windows"],
    ["showContext", "Show context occupancy and risk scale"],
    ["showCompactions", "Show observed compaction count"],
    ["showClock", "Show clock in bubble"],
    [
      "popupOnDelivery",
      "Briefly show the strip when an awareness update is supplied",
    ],
    [
      "popupOnActivity",
      "Briefly show the strip on observed AI prompt / response activity",
    ],
    ["notifications", "Desktop notifications when allowance is low"],
    ["notifyOnReset", "Nudge when a scheduled reset time is reached"],
    [
      "resetAlarmForAll",
      "Nudge on every reset, even if allowance was not exhausted",
    ],
    [
      "soundOnExhaustion",
      "Play an alarm when current or weekly allowance reaches 0%",
    ],
    [
      "soundOnReset",
      "Play an alarm when reset time arrives / availability is confirmed",
    ],
    ["soundOnWarning", "Play a sound for an early low-usage warning"],
  ]
    .map(
      ([k, l]) =>
        `<label><input type="checkbox" name="${k}" ${p[k] ? "checked" : ""}> ${l}</label>`,
    )
    .join(
      "",
    )}</div><p class="muted tiny">Pop-ups do not take keyboard focus and return to the tray automatically. Delivery means the adapter supplied the update to the client, not proof the model read it. Codex model updates require reviewed/trusted hooks; connection and client-output receipts are shown separately.</p><button class="primary" type="submit">Save settings</button><button type="button" id="preview-popup">Preview compact strip</button><button type="button" data-action="testSound">Test alarm sound</button></form></section>`;
}
function alertPanel(s) {
  const hook = s.lastCodexHook;
  return `<section class="panel usage-alerts"><div class="row"><h2>Usage alerts & model connection</h2><span class="tag">${esc(s.codexService?.state || "Local records")}</span></div><p class="muted">Quota refresh: ${s.codexService?.lastRefresh ? age(s.codexService.lastRefresh) : "waiting for account API"}. ${hook ? `Codex hook observed ${age(hook.at)}. Latest client output: ${s.lastCodexDelivery ? age(s.lastCodexDelivery.at) : "not observed"}.` : "Codex model updates: NOT CONNECTED. Monitoring alone does not warn the AI."}</p>${s.lastCodexDelivery?.summary ? `<details><summary>Last awareness text supplied to Codex</summary><p class="note">${esc(s.lastCodexDelivery.summary)}</p></details>` : ""}${s.codexService?.error ? `<p class="error">${esc(s.codexService.error)}. Last reported figures are retained.</p>` : ""}${
    (s.alerts || [])
      .slice(0, 4)
      .map(
        (a) =>
          `<div class="alarm-record"><strong>${esc(a.title)}</strong><p>${esc(a.body)}</p><small>${time(a.at)} · Notification: ${esc(a.notification)} · Sound: ${esc(a.soundStatus)}. This is a user alert; model delivery is tracked separately.</small></div>`,
      )
      .join("") ||
    '<p class="muted tiny">No recorded usage warnings yet. Earlier unlogged warnings cannot be claimed retroactively.</p>'
  }</section>`;
}
function accountCard(a) {
  return `<article class="account-card"><div class="row"><h2>${esc(a.client)}</h2><span class="tag">${Date.now() - a.at > 600000 ? "STALE" : "REPORTED"}</span></div><div class="account-meta">Shared account allowance · ${esc(a.bucket)} · ${age(a.at)}</div><div class="quota-pair"><div><div class="name">Current window</div>${quota(a.current, a)}</div><div><div class="name">Weekly</div>${quota(a.weekly, a)}</div></div></article>`;
}
function sessionsTable(s) {
  const rows = s.sessions.filter((x) => filter === "all" || !x.stale);
  return `<table class="session-table"><thead><tr><th>Session / project</th><th>Activity</th><th>Context & risk</th><th>Compactions</th><th>Last activity</th></tr></thead><tbody>${rows.map((x) => `<tr class="session-row ${selected === x.id ? "chosen" : ""}" tabindex="0" data-session="${esc(x.id)}"><td><div class="session-name">${esc(x.project || "Untitled session")}</div><span class="tiny muted">${esc(x.client)} · ${esc(x.model || "Model not reported")}</span></td><td><span class="tag">${x.stale ? "Not recently observed" : esc(x.status || "Observed")}</span></td><td class="context-cell">${x.context ? Math.round(x.context.used) + "% used" : "Unavailable"} ${spectrum(x)}</td><td class="mono">${x.compactions || 0} <span class="muted tiny">observed</span></td><td class="muted tiny">${age(x.lastActivity)}</td></tr>`).join("")}</tbody></table>${rows.length ? "" : '<div class="empty">No recently observed sessions. Show all recorded sessions or open Codex and send a message.</div>'}`;
}
function details(s) {
  const x = s.sessions.find((x) => x.id === selected);
  if (!x) return "";
  const notes = s.notes.filter((n) => n.session_id === x.id);
  return `<section class="panel"><div class="row"><h2>${esc(x.project || x.client)}</h2><button data-copy="${esc(x.id)}">Copy AI update</button></div><p class="muted">${esc(x.coverage || "Observed since monitoring began")}. Compactions indicate possible continuity risk, not measured model performance.</p><div class="summary-grid"><div><span>Session identity</span><small>${esc(x.id)}</small></div><div><span>Last-request context occupancy</span>${x.context ? Math.round(x.context.used) + "%" : "Unavailable"}</div></div><label class="muted" for="note-kind">Save a continuation record</label><select class="field" id="note-kind"><option value="checkpoint">Checkpoint</option><option value="background job">Background job</option></select><textarea id="note-body" class="field" placeholder="Verified progress, remaining work, decisions — or job ID, log path, output and continuation instructions."></textarea><button class="primary" id="save-note" ${preview ? "disabled" : ""}>Save locally</button>${notes.map((n) => `<div class="note"><span class="tag">${esc(n.kind)}</span> ${reset(n.at)}<p>${esc(n.body)}</p></div>`).join("")}</section>`;
}
function overview(s) {
  return `<div class="section-heading"><h2>Remaining usage</h2><span class="muted tiny">Account limits are shared. Token counts shown only when reported.</span></div><div class="account-grid">${s.accounts.length ? s.accounts.map(accountCard).join("") : '<div class="panel empty">No account allowance reported yet. Codex connects from local session records. Connect Claude in Integrations.</div>'}</div>${alertPanel(s)}<div class="section-heading"><h2>Sessions <span class="muted">/ ${s.sessions.length}</span></h2><select id="session-filter"><option value="recent" ${filter === "recent" ? "selected" : ""}>Recently observed</option><option value="all" ${filter === "all" ? "selected" : ""}>All recorded sessions</option></select></div>${sessionsTable(s)}<p class="muted tiny">Green → amber → red: context occupancy and observed compactions. A risk heuristic, not a performance measurement.</p><div class="lower-grid"><section class="panel"><div class="row"><h2>Recent activity</h2><span class="eyebrow">Local history</span></div>${
    s.events
      .slice(0, 5)
      .map(
        (e) =>
          `<div class="timeline"><time class="mono">${time(e.at)}</time><div>${esc(e.label)}<small>${esc(s.sessions.find((x) => x.id === e.sessionId)?.project || "Account / connection event")}</small></div></div>`,
      )
      .join("") ||
    '<p class="muted">Activity appears when a connected client reports events.</p>'
  }</section>${details(s) || `<section class="panel"><span class="eyebrow">Leave a clean stopping point</span><h2 style="margin-top:12px">Enough room to finish well.</h2><p class="muted">Choose a session to save verified progress or record a download that will continue running.</p><p class="tiny muted">Warnings begin at ${s.settings.alertWarnRemaining}% remaining. Prepare at ${s.settings.alertPrepareRemaining}%; wrap up at ${s.settings.alertWrapRemaining}%. These are planning signals, not guaranteed time remaining.</p><button data-action="copy">Copy current AI update</button></section>`}</div>`;
}
function integrations(s) {
  return `<section class="panel"><h2>Client connections</h2><div class="integration"><div class="row"><h3>Codex account readings</h3><span class="tag">${esc(s.codexService?.state || "Starting")}</span></div><p>Independent account-API refresh every minute, including when a model is idle or out of allowance. Last refresh: ${age(s.codexService?.lastRefresh)}. Local session records supply per-chat context and activity.</p><button data-action="refreshQuota">Refresh usage now</button>${s.unreportedBuckets?.length ? `<p class="muted">The provider also reported metadata-only buckets (${s.unreportedBuckets.map((b) => esc(b.bucket)).join(", ")}). These are not additional accounts and do not contain current/weekly allowance figures, so they do not get usage cards.</p>` : ""}</div><div class="integration"><div class="row"><h3>Codex model updates</h3><span class="tag">${s.lastCodexHook ? "HOOK OBSERVED" : s.codexInstalled ? "TRUST REVIEW NEEDED" : "NOT CONNECTED"}</span></div><p>Quota monitoring and model delivery are separate. Configure the reversible lifecycle hooks, review and trust their exact definitions through Codex /hooks, then resume the chat. Prompt/start updates are supplied every time; tool-event updates are throttled to once per minute or a warning-level change. Stop never forces another model turn.</p><p>${s.lastCodexDelivery ? "Latest client output: " + age(s.lastCodexDelivery.at) : "No Codex model-facing output has been observed yet."}</p><button id="install-codex" ${preview ? "disabled" : ""}>${s.codexInstalled ? "Remove Codex hooks" : "Configure Codex model updates"}</button></div><div class="integration"><div class="row"><h3>Claude Code</h3><span class="tag">${s.claudeInstalled ? "INSTALLED · AWAITING EVENTS" : "NOT INSTALLED"}</span></div><p>Connect the official statusline feed and lifecycle hooks. Existing statusline output is preserved and settings are backed up. Requires Node on PATH.</p><button id="install-claude" ${preview ? "disabled" : ""}>${s.claudeInstalled ? "Remove Claude integration" : "Connect Claude Code"}</button></div><div class="integration"><h3>Data and privacy</h3><p>Only session/usage metadata and your notes are stored locally. Provider credentials and full messages are not collected. The account service uses Codex's existing sign-in without reading credential files.</p><label for="timezone-input">Display timezone</label><input class="field" id="timezone-input" value="${esc(zone())}"><button id="save-timezone">Save timezone</button></div></section>`;
}
function dashboard(s) {
  return `<div class="workspace"><aside class="sidebar"><div class="brand"><span class="mark">◴</span>Token Tracker</div><div class="nav"><button data-view="overview" class="${view === "overview" ? "selected" : ""}">◫ &nbsp; Overview</button><button data-view="integrations" class="${view === "integrations" ? "selected" : ""}">⌁ &nbsp; Integrations</button><button data-view="settings" class="${view === "settings" ? "selected" : ""}">⚙ &nbsp; Settings</button><button data-action="bubble">◴ &nbsp; Show bubble</button></div><div class="sidebar-bottom"><span class="dot"></span>Runs on your computer<br>Monitoring uses no AI tokens.<br><br><span class="tiny">${esc(zone())}<br><span id="clock">${clock()}</span></span></div></aside><main class="main"><header class="pagehead"><div><span class="eyebrow">Your AI working allowance</span><h1>${view === "overview" ? "Room to finish." : view === "settings" ? "Small, and out of your way." : "Connected, on your terms."}</h1><p class="muted">${view === "overview" ? "Plan the work. Know when to save your place." : "Live readings and model updates are separate capabilities."}</p></div><div class="head-actions">${quickControls(s)}<button data-action="refreshQuota">Refresh usage</button><button data-action="hide">Minimise to tray</button></div></header>${preview ? '<div class="notice">DESIGN PREVIEW · These figures are illustrative. No sample usage is written into your live history.</div>' : ""}${s.collector?.errors?.length ? '<div class="notice">Some readings could not refresh. Last observed data is retained and may be stale.</div>' : ""}${view === "overview" ? overview(s) : view === "settings" ? settingsView(s) : integrations(s)}<p class="muted tiny">${preview ? "Illustrative preview" : `Collector ${age(s.collector?.lastScan)} · client-reported values · stale after 10 minutes`}</p></main></div>`;
}
function toast(text) {
  const el = document.querySelector("#toast");
  el.textContent = text;
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 4500);
}
async function act(action, payload) {
  try {
    const r = await window.tracker.request(action, payload);
    if (typeof r === "string") toast(r);
    return r;
  } catch (e) {
    toast(e.message);
  }
}
function readPreferencesForm(form) {
  const p = {
    theme: form.elements.theme.value,
    bubbleMode: form.elements.bubbleMode.value,
    visibilityMode: form.elements.visibilityMode.value,
    compactWidth: Number(form.elements.compactWidth.value),
    compactScale: Number(form.elements.compactScale.value) / 100,
    soundVolume: Number(form.elements.soundVolume.value) / 100,
    opacity: Number(form.elements.opacity.value) / 100,
    popupSeconds: Number(form.elements.popupSeconds.value),
    timezone: form.elements.timezone.value,
    preferredAccountId: form.elements.preferredAccountId.value,
    sessionRows: Number(form.elements.sessionRows.value),
  };
  for (const k of [
    "alertWarnRemaining",
    "alertPrepareRemaining",
    "alertWrapRemaining",
  ])
    p[k] = Number(form.elements[k].value);
  for (const k of [
    "pin",
    "popupOnDelivery",
    "popupOnActivity",
    "notifications",
    "showContext",
    "showCompactions",
    "showClock",
    "notifyOnReset",
    "resetAlarmForAll",
    "soundOnReset",
    "soundOnExhaustion",
    "soundOnWarning",
  ])
    p[k] = form.elements[k].checked;
  return p;
}
function render() {
  if (!live) return;
  const s = preview ? demo() : live;
  if (preview) {
    s.settings = { ...s.settings, ...live.settings };
    s.bubble = live.bubble;
  }
  document.documentElement.dataset.theme = live.effectiveTheme || "dark";
  document.body.classList.toggle("bubble-window", isBubble);
  document.documentElement.style.setProperty(
    "--compact-scale",
    String(s.settings.compactScale || 1),
  );
  document.documentElement.classList.toggle("bubble-window", isBubble);
  document.querySelector("#app").innerHTML = isBubble
    ? bubble(s)
    : dashboard(s);
  document
    .querySelectorAll("[data-action]")
    .forEach((b) => (b.onclick = () => act(b.dataset.action)));
  document.querySelectorAll("[data-quick]").forEach(
    (button) =>
      (button.onclick = async () => {
        const p = live.settings;
        const key = button.dataset.quick;
        let patch;
        if (key === "pin") patch = { pin: !p.pin };
        if (key === "theme")
          patch = { theme: live.effectiveTheme === "dark" ? "light" : "dark" };
        if (key === "visibility")
          patch = {
            visibilityMode:
              p.visibilityMode === "updates" ? "always" : "updates",
          };
        if (key === "opacity")
          patch = {
            opacity: p.opacity > 0.85 ? 0.75 : p.opacity > 0.6 ? 0.5 : 1,
          };
        if (key === "smaller" || key === "larger")
          patch = {
            compactScale: Math.min(
              1.4,
              Math.max(
                0.8,
                Math.round(
                  (p.compactScale + (key === "larger" ? 0.1 : -0.1)) * 10,
                ) / 10,
              ),
            ),
          };
        if (patch) {
          const next = await act(
            key === "visibility" ? "preferences" : "quickPreferences",
            patch,
          );
          if (next) {
            live = await window.tracker.request("snapshot");
            render();
          }
        }
      }),
  );
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => (b.onclick = () => act("bubbleMode", b.dataset.mode)));
  document.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.view;
        render();
      }),
  );
  document.querySelectorAll("[data-session]").forEach((b) => {
    const choose = () => {
      selected = b.dataset.session;
      render();
    };
    b.onclick = choose;
    b.onkeydown = (e) => {
      if (e.key === "Enter") choose();
    };
  });
  document
    .querySelectorAll("[data-copy]")
    .forEach((b) => (b.onclick = () => act("copy", b.dataset.copy)));
  const toggle = document.querySelector("#preview-toggle");
  if (toggle)
    toggle.onclick = () => {
      preview = !preview;
      selected = null;
      render();
    };
  const a = document.querySelector("#account-select");
  if (a)
    a.onchange = () => {
      accountChoice = a.value;
      render();
    };
  const tz = document.querySelector("#save-timezone");
  if (tz)
    tz.onclick = async () => {
      await act("timezone", document.querySelector("#timezone-input").value);
      live = await window.tracker.request("snapshot");
      render();
    };
  const f = document.querySelector("#session-filter");
  if (f)
    f.onchange = () => {
      filter = f.value;
      render();
    };
  const save = document.querySelector("#save-note");
  const noteBody = document.querySelector("#note-body");
  if (noteBody) {
    noteBody.value = drafts.get(selected) || "";
    noteBody.oninput = () => drafts.set(selected, noteBody.value);
  }
  if (save)
    save.onclick = async () => {
      const result = await act("note", {
        sessionId: selected,
        kind: document.querySelector("#note-kind").value,
        body: document.querySelector("#note-body").value,
      });
      if (result) {
        drafts.delete(selected);
        live = await window.tracker.request("snapshot");
        render();
      }
    };
  const codexInstall = document.querySelector("#install-codex");
  if (codexInstall)
    codexInstall.onclick = async () => {
      codexInstall.disabled = true;
      await act(s.codexInstalled ? "removeCodex" : "installCodex");
      live = await window.tracker.request("snapshot");
      render();
    };
  const install = document.querySelector("#install-claude");
  if (install)
    install.onclick = async () => {
      install.disabled = true;
      await act(s.claudeInstalled ? "removeClaude" : "installClaude");
      live = await window.tracker.request("snapshot");
      render();
    };
  const form = document.querySelector("#preferences-form");
  if (form) {
    form.oninput = () => {
      settingsDraft = readPreferencesForm(form);
    };
    form.onchange = form.oninput;
    form.elements.soundVolume.oninput = () =>
      (document.querySelector("#volume-value").textContent =
        form.elements.soundVolume.value + "%");
    form.elements.compactScale.oninput = () =>
      (document.querySelector("#scale-value").textContent =
        form.elements.compactScale.value + "%");
    form.elements.opacity.oninput = () =>
      (document.querySelector("#opacity-value").textContent =
        form.elements.opacity.value + "%");
    form.elements.compactWidth.oninput = () =>
      (document.querySelector("#width-value").textContent =
        form.elements.compactWidth.value + "px");
    form.onsubmit = async (e) => {
      e.preventDefault();
      const patch = readPreferencesForm(form);
      const result = await act("preferences", patch);
      if (result) {
        live = await window.tracker.request("snapshot");
        render();
        settingsDraft = null;
        render();
        toast("Settings saved");
      }
    };
    document.querySelector("#preview-popup").onclick = () =>
      act("previewPopup");
  }
}
window.tracker.onNavigate((section) => {
  if (["overview", "integrations", "settings"].includes(section)) {
    view = section;
    render();
  }
});
window.tracker
  .request("snapshot")
  .then((s) => {
    live = s;
    render();
  })
  .catch((e) => {
    document.querySelector("#app").textContent =
      "Could not load tracker: " + e.message;
  });
window.tracker.subscribe((s) => {
  const editing = document.activeElement?.matches("textarea,input,select");
  live = s;
  if (!editing) render();
});
setInterval(() => {
  if (isBubble && !document.activeElement?.matches("textarea,input")) render();
  const c = document.querySelector("#clock");
  if (c) c.textContent = clock();
}, 30000);

window.tracker.onAlarm(async (alert) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    if (ctx.state !== "running") throw Error("Audio unavailable");
    const notes =
      alert.kind === "exhausted" ? [660, 440, 220] : [660, 880, 1174];
    await new Promise((resolve) => {
      notes.forEach((frequency, i) => {
        const osc = ctx.createOscillator(),
          gain = ctx.createGain(),
          at = ctx.currentTime + i * 0.25;
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(
          Math.min(1, Math.max(0, alert.volume ?? 0.6)) * 0.2,
          at + 0.02,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.24);
        if (i === notes.length - 1) osc.onended = resolve;
      });
    });
    await ctx.close();
    await window.tracker.request("soundResult", {
      id: alert.id,
      status: "completed",
    });
  } catch {
    await window.tracker.request("soundResult", {
      id: alert.id,
      status: "failed",
    });
  }
});
