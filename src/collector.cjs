const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { normaliseCodex } = require("./core.cjs");
const CHUNK = 512 * 1024;
class Collector {
  constructor(store, root = path.join(os.homedir(), ".codex", "sessions")) {
    this.store = store;
    this.root = root;
    this.errors = [];
    this.running = false;
    this.lastScan = null;
  }
  async discover() {
    const files = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * 86400000);
      const dir = path.join(
        this.root,
        String(d.getFullYear()),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0"),
      );
      try {
        for (const name of await fs.readdir(dir)) {
          if (!name.endsWith(".jsonl")) continue;
          const p = path.join(dir, name);
          const st = await fs.stat(p);
          files.push({ p, st });
        }
      } catch (e) {
        if (e.code !== "ENOENT")
          this.errors.push("Cannot read Codex session directory: " + e.code);
      }
    }
    return files.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs).slice(0, 100);
  }
  async tail(p, st) {
    let cursor = this.store.get("files", p);
    const fd = await fs.open(p, "r");
    try {
      if (!cursor || st.size < cursor.offset) {
        const head = Buffer.alloc(Math.min(st.size, 1024 * 1024));
        await fd.read(head, 0, head.length, 0);
        const end = head.indexOf(10);
        if (end < 0) return;
        let meta;
        try {
          meta = normaliseCodex(
            JSON.parse(head.subarray(0, end).toString("utf8")),
          );
        } catch {
          return;
        }
        if (!meta?.session?.nativeId) return;
        const generation = st.birthtimeMs + ":" + (cursor ? Date.now() : 0);
        cursor = {
          offset: Math.max(end + 1, st.size - CHUNK),
          nativeId: meta.session.nativeId,
          account: meta.session.account,
          generation,
          skipFirst: st.size - CHUNK > end + 1,
        };
        meta.session.coverage = cursor.skipFirst
          ? "Recent tail observed; earlier compactions may be missing"
          : "Observed from session start";
        this.store.apply(meta, p + ":" + generation + ":meta");
      }
      if (st.size <= cursor.offset) return;
      const buffer = Buffer.alloc(Math.min(CHUNK, st.size - cursor.offset));
      const { bytesRead } = await fd.read(
        buffer,
        0,
        buffer.length,
        cursor.offset,
      );
      const last = buffer.subarray(0, bytesRead).lastIndexOf(10);
      if (last < 0) {
        if (bytesRead === CHUNK) {
          cursor.offset += bytesRead;
          cursor.skipFirst = true;
          this.store.put("files", p, cursor);
        }
        return;
      }
      let start = 0;
      while (start <= last) {
        const end = buffer.indexOf(10, start);
        if (end < 0 || end > last) break;
        const offset = cursor.offset + start;
        if (cursor.skipFirst) {
          cursor.skipFirst = false;
          start = end + 1;
          continue;
        }
        try {
          const e = JSON.parse(buffer.subarray(start, end).toString("utf8"));
          const x = normaliseCodex(e, cursor.nativeId, cursor.account);
          if (x)
            this.store.apply(x, p + ":" + cursor.generation + ":" + offset);
        } catch (e) {
          if (e.code?.startsWith("ERR_SQLITE")) throw e;
        }
        start = end + 1;
      }
      cursor.offset += last + 1;
      this.store.put("files", p, cursor);
    } finally {
      await fd.close();
    }
  }
  async scan() {
    if (this.running) return;
    this.running = true;
    this.errors = [];
    try {
      for (const { p, st } of await this.discover()) {
        try {
          await this.tail(p, st);
        } catch (e) {
          this.errors.push("Session read failed: " + (e.code || e.name));
        }
      }
      this.lastScan = Date.now();
    } finally {
      this.running = false;
    }
  }
}
module.exports = { Collector };
