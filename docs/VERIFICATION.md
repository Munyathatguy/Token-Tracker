# Verification — 2026-10-28

## Verified locally
- Node 24.14.1; Electron 45.1.0; Windows x64.
- `npm test`: 12 passing functional tests. Covers current/weekly remaining calculations; invalid/expired readings; latest-request vs cumulative context; privacy allowlisting; compaction deduplication/invalidation; incremental partial JSONL and restart; authenticated local IPC; prompt/start hook briefing; loop-free Stop handling; actual stdio MCP call; reversible Claude configuration and preservation of unrelated edits.
- `npm run check`: source syntax checks pass.
- `npm audit`: zero reported vulnerabilities (including development dependencies at verification time).
- `npm run capture`: bubble and dashboard render; tray exists; close hides; restore works. Preview data never enters the live database.
- `npm run start -- --smoke`: real local Codex metadata drives the desktop. Six discovered sessions and two account/bucket records at this observation; one recently active session. These counts are a local snapshot, not complete account coverage.
- `npm run pack`: produces `dist/win-unpacked/Token Tracker.exe` plus supporting files and the external CLI bridge.
- Packaged executable launched with `--smoke`: successful native tray, SQLite, usage rendering, dashboard, hide and restore checks. Owned smoke process exits after checks.

## Not yet verified / not yet implemented
- Claude live installation and a real model's receipt of hook updates. Synthetic stdin -> CLI -> local bridge -> returned `additionalContext` is tested; that is not live model acceptance.
- Automatic delivery to existing Codex Desktop conversations. Local-record observation does not establish a supported message-injection channel.
- Model completion/Stop updates are observed and saved; they are not automatically appended to the model at Stop because that can create another inference/feedback loop. Prompt/start delivery is implemented for Claude; completion delivery needs a client-specific safe mechanism.
- Automatic semantic handoffs, workload-specific finishing reserves and exhaustion forecasting remain roadmap items. Current checkpoints/background-job notes are user-authored local records.
- Other clients, multiple Claude profiles, signed installer/distribution, cross-platform tray behaviour, screen-reader validation and all display-scale combinations.
- Remote CI result is independent of local test success; inspect GitHub Actions after publishing.

## Data handling and publication review
Only allowlisted session metadata is persisted by collectors. Full source transcripts are read locally for event parsing but not copied into this repository. No auth files are read. Manual notes stay in the local database. `runtime/`, `dist/`, SQLite files, log files and `node_modules/` are ignored. Public screenshots show illustrative preview data only.

The implementation is a working first desktop version with explicit capability boundaries. Do not describe all originally requested client integrations or automatic handoff behaviour as complete.
