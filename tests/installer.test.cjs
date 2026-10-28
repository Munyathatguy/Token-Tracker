const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { installClaude, uninstallClaude } = require("../src/installer.cjs");
test("install/remove preserves existing statusline, hooks and unrelated edits", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "compass-install-"));
  const settings = path.join(dir, "settings.json");
  const previous = {
    statusLine: { type: "command", command: "my-existing-status", padding: 2 },
    hooks: {
      Stop: [{ hooks: [{ type: "command", command: "my-existing-hook" }] }],
    },
    theme: "dark",
  };
  try {
    await fs.writeFile(settings, JSON.stringify(previous));
    await installClaude(dir, "C:\\example\\cli.cjs", settings);
    let current = JSON.parse(await fs.readFile(settings));
    assert.equal(current.hooks.Stop.length, 2);
    assert.match(current.statusLine.command, /claude-statusline/);
    current.theme = "light";
    await fs.writeFile(settings, JSON.stringify(current));
    await uninstallClaude(dir);
    current = JSON.parse(await fs.readFile(settings));
    assert.deepEqual(current.statusLine, previous.statusLine);
    assert.deepEqual(current.hooks.Stop, previous.hooks.Stop);
    assert.equal(current.theme, "light");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("invalid existing client settings are never overwritten", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "compass-install-"));
  const settings = path.join(dir, "settings.json");
  try {
    await fs.writeFile(settings, "{broken");
    await assert.rejects(
      installClaude(dir, "C:/cli.cjs", settings),
      /left untouched/,
    );
    assert.equal(await fs.readFile(settings, "utf8"), "{broken");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
