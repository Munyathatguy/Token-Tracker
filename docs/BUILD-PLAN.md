# Implementation plan — 2026-10-28

Execute in this chat as requested. Do not pause at another approval gate before building.

1. Core normalisation and tests: current/weekly remaining, account boundaries, stale/expired/unknown handling, context vs cumulative usage, event deduplication.
2. SQLite metadata persistence and incremental Codex discovery/tailing. Verify actual local schema without printing transcript content or credentials.
3. Desktop shell and isolated preload API. Bubble, tray, dashboard, pin/hide/restore, persistent window preferences.
4. Local authenticated bridge and CLI; Claude statusline/hook adapter, explicit reversible installer, optional read-only MCP bridge. Verify delivery capability separately from collection.
5. UI: quota-first hierarchy, session filters/details, context-risk spectrum, observation age, timezone/date and history/checkpoint/job records. Explicit design preview separate from live state.
6. Functional validation: unit/integration tests, Electron smoke tests including tray/window lifecycle, screenshots, real-data reading, package build and dependency audit.
7. Record verified status, remaining limitations and run instructions. No publishing/distribution or account configuration changes without user action.

Review focus: truncated/corrupt logs; exhausted/expired limits; multiple accounts; stop-hook feedback loops; untrusted metadata in privileged desktop UI.
