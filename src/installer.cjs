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
async function installCodex(
  home,
  cliPath,
  hooksPath = path.join(os.homedir(), ".codex", "hooks.json"),
) {
  let settings = {};
  try {
    settings = JSON.parse(await fs.readFile(hooksPath, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT")
      throw Error("Codex hooks could not be parsed; left untouched");
  }
  const marker = path.join(home, "codex-integration.json");
  if (
    Object.values(settings.hooks || {}).some((groups) =>
      groups.some((g) => g.hooks?.some((h) => h.command?.includes(cliPath))),
    )
  )
    return {
      message:
        "Codex hooks already configured; review /hooks in Codex if not trusted.",
    };
  await fs.mkdir(path.dirname(hooksPath), { recursive: true });
  await fs.mkdir(home, { recursive: true });
  const backup = hooksPath + ".token-tracker-backup-" + Date.now();
  await fs.writeFile(backup, JSON.stringify(settings, null, 2), {
    mode: 0o600,
  });
  settings.hooks = settings.hooks || {};
  for (const event of [
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "Stop",
  ])
    settings.hooks[event] = [
      ...(settings.hooks[event] || []),
      {
        hooks: [
          {
            type: "command",
            command: 'node "' + cliPath + '" codex-hook',
            timeout: 5,
            ...(event !== "Stop" ? { additionalContextLimit: 1500 } : {}),
          },
        ],
      },
    ];
  await fs.writeFile(marker, JSON.stringify({ hooksPath, backup, cliPath }), {
    mode: 0o600,
  });
  const tmp = hooksPath + ".token-tracker-tmp";
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2), { mode: 0o600 });
  await fs.rename(tmp, hooksPath);
  return {
    message:
      "Codex hooks configured. Review and trust the exact definitions in Codex /hooks, then resume/restart the chat. Configured does not mean delivered.",
    backup,
  };
}
async function uninstallCodex(home) {
  const marker = path.join(home, "codex-integration.json"),
    cfg = JSON.parse(await fs.readFile(marker, "utf8"));
  const settings = JSON.parse(await fs.readFile(cfg.hooksPath, "utf8"));
  for (const [event, groups] of Object.entries(settings.hooks || {}))
    settings.hooks[event] = groups
      .map((g) => ({
        ...g,
        hooks: (g.hooks || []).filter((h) => !h.command?.includes(cfg.cliPath)),
      }))
      .filter((g) => g.hooks.length);
  const tmp = cfg.hooksPath + ".token-tracker-tmp";
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2));
  await fs.rename(tmp, cfg.hooksPath);
  await fs.rm(marker);
  return {
    message: "Token Tracker Codex hooks removed; unrelated hooks preserved.",
  };
}
module.exports = {
  installClaude,
  uninstallClaude,
  installCodex,
  uninstallCodex,
};
