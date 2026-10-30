const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline");
const { quotaWindow } = require("./core.cjs");
async function findCodex({
  env = process.env,
  platform = process.platform,
} = {}) {
  if (env.TOKEN_TRACKER_CODEX_BINARY) return env.TOKEN_TRACKER_CODEX_BINARY;
  if (platform === "win32" && env.LOCALAPPDATA) {
    const root = path.join(env.LOCALAPPDATA, "OpenAI", "Codex", "bin");
    const installed = [];
    try {
      for (const name of await fs.readdir(root)) {
        if (!/^[a-f0-9]{8,64}$/i.test(name)) continue;
        const binary = path.join(root, name, "codex.exe");
        try {
          const stat = await fs.stat(binary);
          if (stat.isFile()) installed.push({ binary, at: stat.mtimeMs });
        } catch {}
      }
    } catch {}
    installed.sort((a, b) => b.at - a.at);
    if (installed.length) return installed[0].binary;
  }
  for (const dir of (env.PATH || "").split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(
      dir,
      platform === "win32" ? "codex.exe" : "codex",
    );
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch {}
  }
  throw Error("Codex executable not found on PATH");
}
class CodexService {
  constructor(
    store,
    { spawnProcess = spawn, findBinary = findCodex, changed = () => {} } = {},
  ) {
    this.store = store;
    this.spawnProcess = spawnProcess;
    this.findBinary = findBinary;
    this.changed = changed;
    this.status = { state: "not connected", lastRefresh: null };
    this.pending = new Map();
    this.seq = 0;
    this.busy = false;
  }
  rpc(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("Codex account request timed out"));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  async connect() {
    const binary = await this.findBinary();
    this.child = this.spawnProcess(binary, ["app-server", "--stdio"], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.lines = readline.createInterface({ input: this.child.stdout });
    this.child.stderr.on("data", () => {});
    this.child.on("error", () =>
      this.disconnect("Codex account service could not start"),
    );
    this.child.on("exit", () =>
      this.disconnect("Codex account service stopped"),
    );
    this.lines.on("line", (line) => {
      try {
        const m = JSON.parse(line);
        const p = this.pending.get(m.id);
        if (p) {
          this.pending.delete(m.id);
          clearTimeout(p.timer);
          m.error
            ? p.reject(Error("Codex account API rejected " + m.error.code))
            : p.resolve(m.result);
        }
      } catch {}
    });
    await this.rpc("initialize", {
      clientInfo: { name: "token_tracker", version: "0.3.0" },
      capabilities: { experimentalApi: true },
    });
    this.child.stdin.write(
      JSON.stringify({ method: "initialized", params: {} }) + "\n",
    );
  }
  disconnect(reason) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error(reason));
    }
    this.pending.clear();
    this.child = null;
    this.status = { ...this.status, state: "unavailable", error: reason };
  }
  async refresh() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (!this.child) await this.connect();
      const r = await this.rpc("account/rateLimits/read");
      if (!r.accountId) throw Error("Provider did not supply account identity");
      const at = Date.now();
      const buckets = r.rateLimitsByLimitId || {
        [r.rateLimits?.limitId || "codex"]: r.rateLimits,
      };
      for (const [key, b] of Object.entries(buckets)) {
        if (!b) continue;
        this.store.upsertAccount({
          id: "codex:" + r.accountId + ":" + key,
          client: "Codex",
          owner: r.accountId,
          bucket: key,
          current: quotaWindow(b.primary, at),
          weekly: quotaWindow(b.secondary, at),
          at,
          source: "Codex account API",
        });
      }
      this.status = { state: "connected", lastRefresh: at, error: null };
      this.changed();
    } catch (e) {
      this.status = { ...this.status, state: "unavailable", error: e.message };
      if (this.child) {
        const child = this.child;
        this.child = null;
        child.kill();
      }
    } finally {
      this.busy = false;
    }
  }
  close() {
    const child = this.child;
    this.child = null;
    this.lines?.close();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("Service stopped"));
    }
    this.pending.clear();
    child?.kill();
  }
}
module.exports = { CodexService, findCodex };
