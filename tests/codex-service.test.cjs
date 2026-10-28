const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough, Writable } = require("node:stream");
const { EventEmitter } = require("node:events");
const { Store } = require("../src/store.cjs");
const { CodexService } = require("../src/codex-service.cjs");
test("independent Codex service reads account quotas without starting a model turn", async () => {
  const s = new Store(":memory:"),
    methods = [];
  let child;
  const service = new CodexService(s, {
    findBinary: async () => "/official/codex",
    spawnProcess: () => {
      child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new Writable({
        write(chunk, encoding, done) {
          for (const line of chunk.toString().trim().split("\n")) {
            const m = JSON.parse(line);
            methods.push(m.method);
            if (m.id) {
              const result =
                m.method === "initialize"
                  ? {}
                  : {
                      accountId: "test-account",
                      rateLimitsByLimitId: {
                        codex: {
                          primary: {
                            usedPercent: 100,
                            windowDurationMins: 300,
                            resetsAt: Date.now() / 1000 + 100,
                          },
                          secondary: {
                            usedPercent: 16,
                            windowDurationMins: 10080,
                            resetsAt: Date.now() / 1000 + 90000,
                          },
                        },
                        premium: { primary: null, secondary: null },
                      },
                    };
              setImmediate(() =>
                child.stdout.write(JSON.stringify({ id: m.id, result }) + "\n"),
              );
            }
          }
          done();
        },
      });
      child.kill = () => {
        child.killed = true;
        child.emit("exit", 0);
      };
      return child;
    },
  });
  try {
    await service.refresh();
    const snap = s.snapshot();
    assert.equal(snap.accounts.length, 1);
    assert.equal(snap.accounts[0].current.remaining, 0);
    assert.equal(snap.accounts[0].weekly.remaining, 84);
    assert.equal(service.status.state, "connected");
    assert.deepEqual(methods, [
      "initialize",
      "initialized",
      "account/rateLimits/read",
    ]);
  } finally {
    service.close();
    s.close();
  }
});
