# Verification — 2026-10-28

## 2026-10-29 connection repair
- 28 automated tests pass, including stale descriptor repair with authenticated endpoint verification and explicit disconnected-hook model context. Syntax, formatting and audit checks pass.
- Rebuilt Windows package passed the native smoke checks with isolated data. The normal application was restarted with existing private history preserved.
- Live helper status and stored bridge health matched the new process. This chat received automatic fresh quota context. A new client-output receipt also appeared for the affected LOCAL AI chat; that receipt alone does not prove the model consumed or obeyed it.
- The stale descriptor's original cause remains unknown. The repair detects/replaces that condition, and disconnected trusted hooks now report monitoring unavailable instead of silently suppressing the failure. A host that never executes hooks remains outside that fallback.

## v0.3 repair acceptance
- 26 functional tests, including independent quota transport with no model turn; empty premium-bucket suppression; 0% current / 84% weekly retention; partial windows; persisted exhaustion/reset history; reversible Codex hooks; and a simulated 7% hook briefing with a wrap-up instruction.
- Actual signed-in Codex account API read succeeded without reading auth files or starting a model request.
- Updated Windows package passed native checks for single-card 0% / 84% display, no normal preview toggle, and a completed zero-volume audio playback receipt. The app was restarted with private history preserved.
- The owner enabled the five exact Token Tracker hooks. Live automatic developer-context updates were received by this chat mid-turn; local hook/client-output records matched this chat and the stable helper matched source. This supersedes the earlier disconnected-Codex status below.
- Physical speaker audibility and real future exhaustion/reset timing are not claimed from a silent test or a future promise. Earlier missed warnings cannot be recreated as delivered alerts.

## Historical v0.2 local acceptance
- Node 24.14.1; Electron 45.1.0; Windows x64.
- `npm test`: 21 passing functional tests. Covers current/weekly remaining calculations; invalid/expired readings; latest-request vs cumulative context; privacy allowlisting; compaction deduplication/invalidation; incremental partial JSONL and restart; authenticated local IPC; prompt/start hook briefing; loop-free Stop handling; actual stdio MCP call; reversible Claude configuration; ordered planning thresholds; preferences across database restart; visibility modes; acknowledged single-use delivery notices; focus-free timed pop-ups and cancellation on user interaction.
- `npm run check`: source syntax checks pass.
- `npm audit`: zero reported vulnerabilities (including development dependencies at verification time).
- `npm run capture`: bubble and dashboard render; tray exists; close hides; restore works. Preview data never enters the live database.
- `npm run start -- --smoke`: real local Codex metadata drives the desktop. Six discovered sessions and two account/bucket records at this observation; one recently active session. These counts are a local snapshot, not complete account coverage.
- `npm run pack`: produces `dist/win-unpacked/Token Tracker.exe` plus supporting files and the external CLI bridge.
- Packaged executable launched with `--smoke`: successful native tray, SQLite, usage rendering, dashboard, hide and restore checks. Owned smoke process exits after checks.
- v0.2 source native capture tests additionally verify compact footprint (within one logical pixel of Windows DPI rounding), no vertical overflow, expanded/icon sizes, delivery over the real named-pipe bridge -> non-focused compact pop-up -> automatic hide, settings form save, native opacity 0.65, light-theme application, quick size/opacity/pin actions, and context visibility controls.
- The rebuilt v0.2.0 Windows executable passed these same extended assertions with fresh isolated test data. It was then launched normally with the user's existing local history and default compact appearance.

## Not yet verified / not yet implemented
- Claude live installation and a real model's receipt of hook updates. Synthetic stdin -> CLI -> local bridge -> returned `additionalContext` is tested; that is not live model acceptance.
- Broader Codex lifecycle-hook compatibility across versions and real future exhaustion/reset transitions; owner-chat live delivery is verified above.
- Model completion/Stop updates are observed and saved; they are not automatically appended to the model at Stop because that can create another inference/feedback loop. Prompt/start delivery is implemented for Claude; completion delivery needs a client-specific safe mechanism.
- Automatic semantic handoffs, workload-specific finishing reserves and exhaustion forecasting remain roadmap items. Current checkpoints/background-job notes are user-authored local records.
- Other clients, multiple Claude profiles, signed installer/distribution, cross-platform tray behaviour, screen-reader validation and all display-scale combinations.
- Remote CI result is independent of local test success; inspect GitHub Actions after publishing.

## Data handling and publication review
Only allowlisted session metadata is persisted by collectors. Full source transcripts are read locally for event parsing but not copied into this repository. No auth files are read. Manual notes stay in the local database. `runtime/`, `dist/`, SQLite files, log files and `node_modules/` are ignored. Public screenshots show illustrative preview data only.

The implementation is a working first desktop version with explicit capability boundaries. Do not describe all originally requested client integrations or automatic handoff behaviour as complete.
