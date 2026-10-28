const params = new URLSearchParams(location.search);
const isBubble = params.get("view") !== "dashboard";
let live = null,
  preview = params.has("preview"),
  view = "overview",
  filter = "recent",
  selected = null,
  accountChoice = null;
const drafts = new Map();
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
  return {
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
}
function quota(w, a) {
  const expired = w?.resetsAt && w.resetsAt <= Date.now();
  const stale = a && Date.now() - a.at > 600000;
  const valid = w && w.state === "reported" && !expired;
  const n = valid ? w.remaining : null;
  return `<div class="quota-number mono">${n === null ? "—" : esc(n) + "%"}<small>${n === null ? "unavailable" : "remaining"}</small></div><div class="bar quota-rail ${n === null ? "unknown" : n <= 8 ? "red" : n <= 30 ? "amber" : ""}"><span style="width:${n === null ? 0 : n}%"></span></div><div class="reset">${expired ? "Awaiting refreshed reading" : stale ? "Stale · last reported value" : reset(w?.resetsAt)}</div>`;
}
// Styles set in generated markup are restricted to numeric percentages from normalised data.
function spectrum(s) {
  const score = s.risk?.score;
  return `<div class="spectrum" title="Continuity-risk heuristic, not measured performance"><i style="left:${score ?? 0}%;${score === null ? "display:none" : ""}"></i></div>`;
}
function bubble(s) {
  const a = s.accounts.find((a) => a.id === accountChoice) || s.accounts[0];
  const sessions = s.sessions.filter((x) => !x.stale).slice(0, 3);
  return `<div class="bubble"><header class="titlebar"><div class="brand"><span class="mark">◴</span>Token Tracker</div><div><button class="icon-btn" data-action="pin" title="Toggle always on top" aria-label="Toggle always on top">⌖</button><button class="icon-btn" data-action="hide" title="Minimise to tray" aria-label="Minimise to tray">−</button></div></header><div class="bubble-main"><div class="row clock-row"><span class="muted">${clock()}</span>${preview ? '<span class="tag preview">DESIGN PREVIEW</span>' : '<span class="tiny"><span class="dot"></span>LOCAL</span>'}</div><div class="row quota-title"><select id="account-select" aria-label="Choose account allowance">${s.accounts.map((v, i) => `<option value="${esc(v.id)}" ${v.id === a?.id ? "selected" : ""}>${esc(v.client)} · profile ${i + 1}</option>`).join("") || "<option>Account allowance</option>"}</select><span class="tiny muted">Shared across chats</span></div><div class="quota-block"><div class="name">Current usage window${a?.current?.minutes ? " · " + Math.round(a.current.minutes / 60) + "h" : ""}</div>${quota(a?.current, a)}</div><div class="quota-block"><div class="name">Weekly allowance</div>${quota(a?.weekly, a)}</div><div class="bubble-section"><div class="row"><span class="eyebrow">Sessions</span><span class="tiny muted">${s.sessions.filter((x) => !x.stale).length} recent</span></div>${sessions.length ? sessions.map((x) => `<div class="bubble-session"><div class="row"><strong>${esc(x.project || x.client)}</strong><span class="tiny muted">${esc(x.status || "Observed")}</span></div><div class="session-sub"><span>${esc(x.client)} · context ${x.context ? Math.round(x.context.used) + "% used" : "unavailable"}</span><span>${x.compactions || 0} compactions</span></div>${spectrum(x)}</div>`).join("") : '<div class="empty">Waiting for session readings.<br>Open the dashboard to connect a client.</div>'}</div></div><footer class="bubble-footer"><span>${preview ? "Illustrative data" : age(a?.at)}<br>Context scale = continuity risk</span><button data-action="dashboard">Dashboard ↗</button></footer></div>`;
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
  return `<div class="section-heading"><h2>Remaining usage</h2><span class="muted tiny">Account limits are shared. Token counts shown only when reported.</span></div><div class="account-grid">${s.accounts.length ? s.accounts.map(accountCard).join("") : '<div class="panel empty">No account allowance reported yet. Codex connects from local session records. Connect Claude in Integrations.</div>'}</div><div class="section-heading"><h2>Sessions <span class="muted">/ ${s.sessions.length}</span></h2><select id="session-filter"><option value="recent" ${filter === "recent" ? "selected" : ""}>Recently observed</option><option value="all" ${filter === "all" ? "selected" : ""}>All recorded sessions</option></select></div>${sessionsTable(s)}<p class="muted tiny">Green → amber → red: context occupancy and observed compactions. A risk heuristic, not a performance measurement.</p><div class="lower-grid"><section class="panel"><div class="row"><h2>Recent activity</h2><span class="eyebrow">Local history</span></div>${
    s.events
      .slice(0, 5)
      .map(
        (e) =>
          `<div class="timeline"><time class="mono">${time(e.at)}</time><div>${esc(e.label)}<small>${esc(s.sessions.find((x) => x.id === e.sessionId)?.project || "Recorded session")}</small></div></div>`,
      )
      .join("") ||
    '<p class="muted">Activity appears when a connected client reports events.</p>'
  }</section>${details(s) || `<section class="panel"><span class="eyebrow">Leave a clean stopping point</span><h2 style="margin-top:12px">Enough room to finish well.</h2><p class="muted">Choose a session to save verified progress or record a download that will continue running.</p><p class="tiny muted">Warnings begin at 30% remaining. Prepare at 15%; wrap up at 8%. These are planning signals, not guaranteed time remaining.</p><button data-action="copy">Copy current AI update</button></section>`}</div>`;
}
function integrations(s) {
  return `<section class="panel"><h2>Client connections</h2><div class="integration"><div class="row"><h3>Codex</h3><span class="tag">READING LOCAL RECORDS</span></div><p>Current and weekly account allowances, last-request context and task events. Session discovery covers the latest 7 days, up to 100 recently modified files. Earlier compactions may be missing when reading a recent tail.</p><p>Automatic updates into existing Codex Desktop chats are not connected. Copy an awareness update, run the local CLI, or configure the optional read-only MCP tool.</p><button data-action="copy">Copy awareness update</button></div><div class="integration"><div class="row"><h3>Claude Code</h3><span class="tag">${s.claudeInstalled ? "INSTALLED · AWAITING EVENTS" : "NOT INSTALLED"}</span></div><p>Connect the official statusline feed and lifecycle hooks. The existing statusline command is preserved, and settings are backed up. Uses your existing Node installation.</p><p>Prompt and session-start hooks deliver a short update to Claude. Stop and tool events update the monitor; stop hooks do not force another model response. Weekly/current allowance requires the client to supply rate-limit fields.</p><button id="install-claude" ${preview ? "disabled" : ""}>${s.claudeInstalled ? "Remove Claude integration" : "Connect Claude Code"}</button></div><div class="integration"><h3>Data and privacy</h3><p>Metadata stays in this computer’s application-data folder. No provider passwords, API keys or full messages are collected. The observer reads local records; it does not control the other apps.</p><label for="timezone-input">Display timezone</label><input class="field" id="timezone-input" value="${esc(zone())}"><button id="save-timezone">Save timezone</button><p>Automatic startup is off.</p></div></section>`;
}
function dashboard(s) {
  return `<div class="workspace"><aside class="sidebar"><div class="brand"><span class="mark">◴</span>Token Tracker</div><div class="nav"><button data-view="overview" class="${view === "overview" ? "selected" : ""}">◫ &nbsp; Overview</button><button data-view="integrations" class="${view === "integrations" ? "selected" : ""}">⌁ &nbsp; Integrations</button><button data-action="bubble">◴ &nbsp; Show bubble</button></div><div class="sidebar-bottom"><span class="dot"></span>Runs on your computer<br>Monitoring uses no AI tokens.<br><br><span class="tiny">${esc(zone())}<br><span id="clock">${clock()}</span></span></div></aside><main class="main"><header class="pagehead"><div><span class="eyebrow">Your AI working allowance</span><h1>${view === "overview" ? "Room to finish." : "Connected, on your terms."}</h1><p class="muted">${view === "overview" ? "Plan the work. Know when to save your place." : "Live readings and model updates are separate capabilities."}</p></div><div class="head-actions"><button id="preview-toggle">${preview ? "Return to live data" : "Preview design"}</button><button data-action="hide">Minimise to tray</button></div></header>${preview ? '<div class="notice">DESIGN PREVIEW · These figures are illustrative. No sample usage is written into your live history.</div>' : ""}${s.collector?.errors?.length ? '<div class="notice">Some readings could not refresh. Last observed data is retained and may be stale.</div>' : ""}${view === "overview" ? overview(s) : integrations(s)}<p class="muted tiny">${preview ? "Illustrative preview" : `Collector ${age(s.collector?.lastScan)} · client-reported values · stale after 10 minutes`}</p></main></div>`;
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
function render() {
  if (!live) return;
  const s = preview ? demo() : live;
  document.querySelector("#app").innerHTML = isBubble
    ? bubble(s)
    : dashboard(s);
  document
    .querySelectorAll("[data-action]")
    .forEach((b) => (b.onclick = () => act(b.dataset.action)));
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
  const install = document.querySelector("#install-claude");
  if (install)
    install.onclick = async () => {
      install.disabled = true;
      await act(s.claudeInstalled ? "removeClaude" : "installClaude");
      live = await window.tracker.request("snapshot");
      render();
    };
}
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
