# Architecture and data contracts

Collector -> normalised events -> SQLite -> snapshot -> bubble/dashboard and model bridge.

## Observation adapters
Codex: read local `~/.codex/sessions` JSONL records. Allowlist metadata from session_meta, turn_context, event_msg/token_count, task_started, task_complete and compacted/contextCompaction records. Current context uses the latest request usage, never cumulative billed usage. Raw API readings remain labelled as last-request occupancy. Rate limits use primary/secondary windows, account owner metadata where available and provider limit bucket. Unknown ownership stays unverified, never merges into a verified account.

Claude: optional statusline adapter reads official statusline JSON; hooks observe UserPromptSubmit, Stop, SessionStart, PreCompact/PostCompact and tool completion. Hook registration is user-triggered and backed up. Stop observations must not create another inference loop. Support and delivery are reported independently.

Read local records without persisting prompts, tool outputs, keys or auth files. SQLite uses WAL; events have source/offset identity for deduplication. Incremental file tails retain incomplete lines and resume from stored offsets. Bounded discovery handles historical backfill without repeatedly loading complete transcripts. Metadata-only history survives restart.

## Model bridge
Local named pipe (Windows) / Unix socket with random per-run capability token; descriptor under application userData. No public HTTP server. Requests have size limits and an allowlisted action. CLI `status` returns a brief awareness message, hook commands ingest metadata and optionally return `additionalContext` for supported prompt/start hooks. No automatic messaging into arbitrary Codex Desktop chats is claimed. Optional MCP exposes read-only status through the same local service.

## Rules
Allowances: reported used percentage -> remaining = 100 - used, bounded 0..100. Expired windows become awaiting-refresh, never automatically reset to 100%. Reading age over 10 minutes is stale. Warn <=30%, prepare <=15%, wrap <=8%; these are planning hints, not enforced cutoffs. Shared account quota is displayed once per source account/bucket, current and weekly windows separately.

Context risk: max(context occupancy, compaction heuristic capped below critical in isolation); unknown occupancy remains unknown. Display explanation and count separately. Compactions are observed events, not a quality measurement. Burn-rate forecasting and task-specific reserve calibration require adequate history; do not invent a time-to-exhaustion.

## Desktop
Main process owns collector, DB, bridge and native windows. Sandbox + contextIsolation, nodeIntegration=false, restrictive CSP, navigation/window creation denied, IPC sender validation. Bubble anchored to display workArea, draggable, bounded after display changes, pin toggle, close/minimise hides to tray. Dashboard is independent of bubble visibility. No launch-on-login without opt-in.

## Sources checked 2026-10-28
- https://learn.chatgpt.com/docs/app-server (usage, limits and compaction protocol; not proof of external Desktop attachment)
- https://code.claude.com/docs/en/statusline
- https://code.claude.com/docs/en/hooks
- https://www.electronjs.org/docs/latest/api/tray
- https://www.electronjs.org/docs/latest/tutorial/security
