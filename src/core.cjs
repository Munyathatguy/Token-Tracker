const path = require("node:path");
const finite = (n) => typeof n === "number" && Number.isFinite(n);
function quotaWindow(raw, now = Date.now()) {
  const used = raw?.used_percent ?? raw?.used_percentage ?? raw?.usedPercent;
  if (!finite(used) || used < 0 || used > 100) return null;
  const reset = raw.resets_at ?? raw.resetsAt;
  const resetsAt = finite(reset) && reset > 0 ? reset * 1000 : null;
  return {
    remaining: Math.round((100 - used) * 10) / 10,
    used,
    minutes: raw.window_minutes ?? raw.windowDurationMins ?? null,
    resetsAt,
    state: resetsAt && resetsAt <= now ? "awaiting refresh" : "reported",
    exactRemainingTokens: null,
    reportedAt: now,
  };
}
function contextInfo(info) {
  const last = info?.last_token_usage,
    capacity = info?.model_context_window;
  if (!last || !finite(capacity) || capacity <= 0 || !finite(last.input_tokens))
    return null;
  if (
    last.input_tokens < 0 ||
    (finite(last.output_tokens) && last.output_tokens < 0)
  )
    return null;
  const tokens =
    last.input_tokens + (finite(last.output_tokens) ? last.output_tokens : 0);
  return {
    tokens,
    capacity,
    used: Math.min(100, (100 * tokens) / capacity),
    basis: "last request; client reported",
  };
}
function risk(context, compactions = 0) {
  const score = context
    ? Math.max(context.used, Math.min(75, compactions * 15))
    : compactions
      ? Math.min(75, compactions * 15)
      : null;
  return {
    score,
    level:
      score === null
        ? "Unknown"
        : score >= 80
          ? "High"
          : score >= 50
            ? "Elevated"
            : "Low",
    explanation:
      "Continuity-risk heuristic from context occupancy and observed compactions; not a measured performance score.",
  };
}
function normaliseCodex(
  e,
  id = "unknown",
  account = "unverified-local",
  now = Date.now(),
) {
  const p = e.payload || {},
    at = Date.parse(e.timestamp) || now;
  if (e.type === "session_meta")
    return {
      session: {
        id: "codex:" + (p.id || p.session_id || id),
        nativeId: p.id || p.session_id || id,
        client: "Codex",
        account: p.creator_account_id || account,
        project: p.cwd
          ? path.win32.basename(p.cwd.replaceAll("/", "\\"))
          : "Untitled session",
        cwd: p.cwd || "",
        startedAt: at,
        lastActivity: at,
        observedAt: now,
      },
      at,
    };
  const sid = "codex:" + id;
  if (e.type === "turn_context")
    return { session: { id: sid, model: p.model || null }, at };
  if (e.type === "compacted" || p.type === "contextCompaction")
    return {
      session: { id: sid },
      compaction: true,
      event: "Context compacted",
      at,
    };
  if (e.type !== "event_msg") return null;
  if (p.type === "token_count") {
    const r = p.rate_limits;
    return {
      session: {
        id: sid,
        context: contextInfo(p.info),
        totalTokens: p.info?.total_token_usage?.total_tokens ?? null,
        lastActivity: at,
        observedAt: now,
      },
      account: r
        ? {
            id: "codex:" + account + ":" + (r.limit_id || "codex"),
            client: "Codex",
            owner: account,
            bucket: r.limit_id || "codex",
            current: quotaWindow(r.primary, at),
            weekly: quotaWindow(r.secondary, at),
            at,
          }
        : null,
      at,
    };
  }
  const types = {
    task_started: ["Working", "Work started"],
    task_complete: ["Waiting", "Response completed"],
    turn_aborted: ["Stopped", "Response stopped"],
    context_compacted: [null, "Context compacted"],
  };
  if (!types[p.type]) return null;
  const [status, event] = types[p.type];
  return {
    session: {
      id: sid,
      ...(status ? { status } : {}),
      lastActivity: at,
      observedAt: now,
    },
    compaction: p.type === "context_compacted",
    event,
    at,
  };
}
function normaliseClaude(data, event = "statusline", now = Date.now()) {
  const id = "claude:" + data.session_id;
  if (
    !data.session_id ||
    typeof data.session_id !== "string" ||
    data.session_id.length > 200
  )
    throw Error("Missing or invalid Claude session ID");
  const ctx = data.context_window;
  const u = ctx?.current_usage;
  const context = finite(ctx?.used_percentage)
    ? {
        used: Math.max(0, Math.min(100, ctx.used_percentage)),
        capacity: ctx.context_window_size ?? null,
        tokens: u
          ? u.input_tokens +
            (u.cache_read_input_tokens || 0) +
            (u.cache_creation_input_tokens || 0) +
            (u.output_tokens || 0)
          : null,
        basis: "Claude statusline; client reported",
      }
    : undefined;
  const session = {
    id,
    nativeId: data.session_id,
    client: "Claude",
    account: "unverified-local",
    project: path.win32.basename(
      data.workspace?.current_dir || data.cwd || "Claude session",
    ),
    lastActivity: now,
    observedAt: now,
  };
  if (context) session.context = context;
  if (data.model?.id) session.model = data.model.id;
  if (data.cwd) session.cwd = data.cwd;
  if (event === "UserPromptSubmit") session.status = "Working";
  if (event === "Stop") session.status = "Waiting";
  const r = data.rate_limits;
  return {
    session,
    at: now,
    event: event === "statusline" ? null : event,
    compaction: event === "PostCompact",
    account: r
      ? {
          id: "claude:unverified-local:claude",
          client: "Claude",
          owner: "unverified-local",
          bucket: "claude",
          current: quotaWindow(r.five_hour, now),
          weekly: quotaWindow(r.seven_day, now),
          at: now,
        }
      : null,
  };
}
function briefing(snapshot, id, now = Date.now()) {
  const timezone = snapshot.settings?.timezone || "Africa/Johannesburg";
  const s = snapshot.sessions.find((s) => s.id === id || s.nativeId === id);
  const accounts = s
    ? snapshot.accounts.filter(
        (a) => a.client === s.client && a.owner === s.account,
      )
    : snapshot.accounts;
  const lines = accounts.map(
    (a) =>
      `${a.client} shared allowance: current ${describe(a.current, a.at, now, timezone)}; weekly ${describe(a.weekly, a.at, now, timezone)}`,
  );
  const minimum = Math.min(
    ...accounts.flatMap((a) =>
      [a.current, a.weekly]
        .filter(
          (w) =>
            w &&
            w.state === "reported" &&
            (!w.resetsAt || w.resetsAt > now) &&
            now - a.at < 600000,
        )
        .map((w) => w.remaining),
    ),
  );
  return (
    `[TOKEN TRACKER] Local time: ${new Date(now).toLocaleString(undefined, { timeZone: timezone })} (${timezone}). ` +
    (lines.join(" | ") || "Current and weekly allowance unavailable.") +
    (s
      ? ` | Context: ${s.context ? Math.round(s.context.used) + "% used" : "unavailable"}; compactions observed: ${s.compactions || 0}.`
      : "") +
    (minimum <= (snapshot.settings?.alertWrapRemaining ?? 8)
      ? " Capacity is low: finish verification and save a checkpoint, unfinished work and background-job details."
      : minimum <= (snapshot.settings?.alertPrepareRemaining ?? 15)
        ? " Prepare a verified stopping point and handoff before starting large new work."
        : "")
  );
}
function describe(w, at, now, timezone) {
  if (!w) return "unavailable";
  const due = w.resetsAt && w.resetsAt <= now;
  const stale = now - (w.reportedAt || at) > 600000;
  return `${w.remaining}% ${due || stale ? "last reported remaining" : "remaining"}${w.resetsAt ? ", scheduled reset " + new Date(w.resetsAt).toLocaleString(undefined, { timeZone: timezone }) : ", reset not reported"}${due ? " (reset time reached; awaiting confirmation)" : stale ? " (stale)" : ""}`;
}
module.exports = {
  quotaWindow,
  contextInfo,
  risk,
  normaliseCodex,
  normaliseClaude,
  briefing,
};
