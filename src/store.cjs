const { DatabaseSync } = require("node:sqlite");
const { risk } = require("./core.cjs");
const { DEFAULTS, validatePreferences } = require("./preferences.cjs");
class Store {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,session_id TEXT,at INTEGER,label TEXT);
      CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY,session_id TEXT,at INTEGER,kind TEXT,body TEXT);
      CREATE TABLE IF NOT EXISTS alerts(id TEXT PRIMARY KEY,at INTEGER,data TEXT);`);
  }
  get(table, id) {
    return JSON.parse(
      this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id)?.data ||
        "null",
    );
  }
  put(table, id, data) {
    this.db
      .prepare(
        `INSERT INTO ${table}(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
      )
      .run(id, JSON.stringify(data));
  }
  apply(x, key) {
    if (!x?.session) return false;
    if (this.db.prepare("SELECT id FROM events WHERE id=?").get(key))
      return false;
    this.db.exec("BEGIN");
    try {
      const old = this.get("sessions", x.session.id) || {
        compactions: 0,
        status: "Observed",
        coverage: "Observed locally; compaction history may be incomplete",
      };
      const clean = Object.fromEntries(
        Object.entries(x.session).filter(
          ([, v]) => v !== undefined && v !== null,
        ),
      );
      const next = { ...old, ...clean };
      if (x.compaction) {
        next.compactions = (old.compactions || 0) + 1;
        next.context = null;
      }
      this.put("sessions", next.id, next);
      if (x.account) {
        this.upsertAccount(x.account);
      }
      this.db
        .prepare("INSERT INTO events VALUES (?,?,?,?)")
        .run(key, next.id, x.at || Date.now(), x.event || "Usage updated");
      this.db.exec("COMMIT");
      return true;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  snapshot() {
    const now = Date.now();
    const allAccounts = this.db
      .prepare("SELECT data FROM accounts")
      .all()
      .map((r) => JSON.parse(r.data));
    return {
      at: now,
      accounts: allAccounts
        .filter((a) => a.current || a.weekly)
        .map((a) => ({
          ...a,
          current: a.current
            ? { ...a.current, reportedAt: a.current.reportedAt || a.at }
            : null,
          weekly: a.weekly
            ? { ...a.weekly, reportedAt: a.weekly.reportedAt || a.at }
            : null,
        })),
      unreportedBuckets: allAccounts
        .filter((a) => !a.current && !a.weekly)
        .map((a) => ({ client: a.client, bucket: a.bucket, at: a.at })),
      alerts: this.db
        .prepare("SELECT data FROM alerts ORDER BY at DESC LIMIT 80")
        .all()
        .map((r) => JSON.parse(r.data)),
      sessions: this.db
        .prepare("SELECT data FROM sessions")
        .all()
        .map((r) => {
          const s = JSON.parse(r.data);
          return {
            ...s,
            risk: risk(s.context, s.compactions),
            stale: now - (s.lastActivity || s.observedAt || 0) > 600000,
          };
        })
        .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0)),
      events: this.db
        .prepare(
          "SELECT id,session_id AS sessionId,at,label FROM events WHERE label!='Usage updated' ORDER BY at DESC LIMIT 80",
        )
        .all(),
      notes: this.db
        .prepare("SELECT * FROM notes ORDER BY at DESC LIMIT 100")
        .all(),
      settings: { ...DEFAULTS, ...(this.get("settings", "preferences") || {}) },
      lastDelivery: this.get("settings", "lastDelivery"),
      lastCodexHook: this.get("settings", "lastCodexHook"),
      lastCodexDelivery: this.get("settings", "lastCodexDelivery"),
      bridgeHealth: this.get("settings", "bridgeHealth"),
      integrations: {
        codex: {
          observe: "Local session records",
          inform:
            "On-demand CLI / optional MCP; automatic Desktop injection unavailable",
        },
        claude: {
          observe: "Install statusline and hooks to connect",
          inform:
            "Prompt/start hooks; stop events recorded without starting another model turn",
        },
      },
    };
  }
  note(sessionId, kind, body) {
    if (
      !["checkpoint", "background job"].includes(kind) ||
      typeof body !== "string" ||
      !body.trim() ||
      body.length > 12000
    )
      throw Error("Invalid note");
    if (!this.get("sessions", sessionId)) throw Error("Unknown session");
    this.db
      .prepare("INSERT INTO notes(session_id,at,kind,body) VALUES(?,?,?,?)")
      .run(sessionId, Date.now(), kind, body.trim());
  }
  upsertAccount(next) {
    const old = this.get("accounts", next.id);
    const merged = { ...(old || {}), ...next };
    for (const scope of ["current", "weekly"]) {
      const incoming = next[scope],
        previous = old?.[scope];
      merged[scope] =
        incoming &&
        (!previous ||
          (incoming.reportedAt || next.at) >= (previous.reportedAt || old.at))
          ? { ...incoming, reportedAt: incoming.reportedAt || next.at }
          : previous || null;
    }
    merged.at = Math.max(old?.at || 0, next.at || 0);
    this.put("accounts", next.id, merged);
    return merged;
  }
  recordAlert(alert) {
    if (this.db.prepare("SELECT id FROM alerts WHERE id=?").get(alert.id))
      return false;
    this.db
      .prepare("INSERT INTO alerts VALUES(?,?,?)")
      .run(alert.id, alert.at, JSON.stringify(alert));
    this.db
      .prepare("INSERT OR IGNORE INTO events VALUES(?,?,?,?)")
      .run("alert:" + alert.id, alert.sessionId || "", alert.at, alert.title);
    return true;
  }
  updateAlert(id, patch) {
    const r = this.db.prepare("SELECT data FROM alerts WHERE id=?").get(id);
    if (!r) return;
    this.db
      .prepare("UPDATE alerts SET data=? WHERE id=?")
      .run(JSON.stringify({ ...JSON.parse(r.data), ...patch }), id);
  }
  updatePreferences(patch) {
    const next = { ...this.snapshot().settings, ...validatePreferences(patch) };
    if (!(
      next.alertWrapRemaining < next.alertPrepareRemaining &&
      next.alertPrepareRemaining < next.alertWarnRemaining
    ))
      throw Error(
        "Wrap-up threshold must be below prepare, and prepare below warning",
      );
    this.put("settings", "preferences", next);
    return next;
  }
  recordDelivery(ticket) {
    const delivery = {
      id: ticket.id,
      at: Date.now(),
      client: ticket.client,
      sessionId: ticket.sessionId || "",
      summary: ticket.summary || null,
    };
    this.put("settings", "lastDelivery", delivery);
    if (ticket.client === "Codex")
      this.put("settings", "lastCodexDelivery", delivery);
    this.db
      .prepare("INSERT OR IGNORE INTO events VALUES(?,?,?,?)")
      .run(
        delivery.id,
        delivery.sessionId,
        delivery.at,
        "Awareness supplied to " + delivery.client,
      );
    return delivery;
  }
  close() {
    this.db.close();
  }
}
module.exports = { Store };
