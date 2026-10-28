const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
async function installClaude(
  home,
  cliPath,
  settingsPath = path.join(os.homedir(), ".claude", "settings.json"),
) {
  let settings = {};
  try {
    settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT")
      throw Error("Claude settings could not be parsed; left untouched");
  }
  if (settings.statusLine?.command?.includes(cliPath))
    return { message: "Claude integration already installed" };
  const backup = settingsPath + ".compass-backup-" + Date.now();
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(backup, JSON.stringify(settings, null, 2), {
    mode: 0o600,
  });
  await fs.writeFile(
    path.join(home, "claude-integration.json"),
    JSON.stringify({
      settingsPath,
      backup,
      cliPath,
      previousStatusLine: settings.statusLine || null,
    }),
    { mode: 0o600 },
  );
  const base = 'node "' + cliPath + '"';
  settings.statusLine = {
    type: "command",
    command: base + " claude-statusline",
    padding: settings.statusLine?.padding || 0,
  };
  settings.hooks = settings.hooks || {};
  for (const name of [
    "SessionStart",
    "UserPromptSubmit",
    "Stop",
    "PostCompact",
    "PreCompact",
    "PostToolUse",
    "SubagentStop",
  ]) {
    const entries = settings.hooks[name] || [];
    settings.hooks[name] = [
      ...entries,
      {
        hooks: [
          { type: "command", command: base + " claude-hook", timeout: 5 },
        ],
      },
    ];
  }
  const tmp = settingsPath + ".compass-tmp";
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2), { mode: 0o600 });
  await fs.rename(tmp, settingsPath);
  return {
    message:
      "Installed. Restart Claude Code to activate. Existing statusline preserved.",
    backup,
  };
}
async function uninstallClaude(home) {
  const f = path.join(home, "claude-integration.json");
  const cfg = JSON.parse(await fs.readFile(f, "utf8"));
  const settings = JSON.parse(await fs.readFile(cfg.settingsPath, "utf8"));
  if (settings.statusLine?.command?.includes(cfg.cliPath)) {
    if (cfg.previousStatusLine) settings.statusLine = cfg.previousStatusLine;
    else delete settings.statusLine;
  }
  for (const [name, entries] of Object.entries(settings.hooks || {})) {
    settings.hooks[name] = entries
      .map((e) => ({
        ...e,
        hooks: e.hooks.filter((h) => !h.command?.includes(cfg.cliPath)),
      }))
      .filter((e) => e.hooks.length);
  }
  const tmp = cfg.settingsPath + ".compass-tmp";
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2));
  await fs.rename(tmp, cfg.settingsPath);
  await fs.rm(f);
  return {
    message: "Integration removed; unrelated Claude settings preserved.",
  };
}
module.exports = { installClaude, uninstallClaude };
