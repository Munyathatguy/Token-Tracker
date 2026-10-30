# Token Tracker — product specification

October 30 reconciliation: [status and handoff](STATUS-AND-HANDOFF.md). Immediate priority is reliable launches and cross-chat warning delivery; recurring lifecycle failure remains unresolved.

## Core objective
Help the user and AI plan workload around the **remaining current-window and weekly usage allowances**, and verify/save work before model access is exhausted. Context, compaction, clock/date, tasks and recovery support this objective.

## Delivery objective
Build a Windows desktop companion with an independent local collector, bottom-right bubble, tray lifecycle, detailed dashboard, durable local history and client-specific integrations. This folder starts empty; the older GitHub repository is reference material, not a verified implementation to copy.

## User requirements
- Current-window and weekly allowance remaining and reset times are the most prominent metrics.
- Prefer actual provider-reported token allowance; if only percentages exist show percentages. Never derive remaining account tokens from lifetime token usage or context capacity.
- Account limits are shared across sessions. Do not present shared quota as a budget allocated to each chat.
- Observe multiple active sessions, identify projects/clients/models, show activity and freshness.
- Context occupancy, compaction count and a green-to-red continuity-risk scale are secondary. Compaction count is a heuristic risk signal, not proof of declining performance.
- Include local date, time, timezone, session duration and last activity.
- Brief model updates at user messages, completion/stop events, startup/resume and threshold crossings, wherever supported. Never introduce infinite stop-hook loops or claim delivery from merely observing an event.
- Preserve unfinished tasks, decisions, verified checkpoints and external background-job identity/log/output/continuation information.
- Movable, optionally pinned bubble above the taskbar; minimise/close to tray; restore from tray; full dashboard.
- Collection, display and rule evaluation consume no model tokens. Only information sent into model context and model-generated handoffs have token overhead.
- Free local tooling, no required cloud service. No passwords, provider credentials or full transcript content stored in this project.
- Preserve unrelated files, models, sessions, processes and client configuration. Integrations must be explicit, reversible and preserve existing settings.

## Approach
Chosen direction: standalone desktop application with independent collection and lightweight adapters; optional MCP as an access path, not the monitor's foundation. A browser-only dashboard cannot provide the full native tray/window lifecycle. MCP-only would depend on tool calls and does not independently observe usage.

Implementation choice by builder: Electron + HTML/CSS/JavaScript UI, Node collector, SQLite metadata store. Electron supports the Windows tray and movable windows and the machine already has Node. Rust is not installed; no machine-wide compiler installation is required. This replaces the earlier suggested Tauri shell, not the architecture or quality requirements.

## Bubble design
Blue-grey surface, pale blue usage rails, amber/red only for approaching limits. Two large account usage rails precede compact session rows. Each row includes client/project, activity, context occupancy and compactions. A thin spectrum shows continuity risk. Last observation age is always visible. Explicit preview mode must never be confused with live data.

## Acceptance
1. Real Codex local events drive current and weekly remaining allowances and reset times.
2. Multiple sessions retain separate context/activity; quota is grouped by provider/account bucket.
3. Partial records, rotated/truncated files, restarts, missing values, expired reset windows and stale observations do not manufacture healthy readings.
4. Compactions are deduplicated and observation coverage is visible.
5. Closing bubble/dashboard leaves collection running; tray restores both; Quit stops only this app.
6. No remote page runs privileged code. Renderer is sandboxed and uses a narrow validated preload API.
7. Completion criteria distinguish implemented, tested, live-connected and blocked integrations.

## Boundaries
No universal guarantee of session attachment or intervention. No automatic credential extraction, usage-limit circumvention, autonomous interruption of other processes, destructive cleanup, or claims that thresholds guarantee task completion. Abrupt quota changes and client failures remain possible. Exact token allowances may be unavailable.

## Desktop refinement — 2026-10-28
Compact is the default, matching the owner's approximately 318 × 118 screen-pixel reference at their Windows scaling. Base size is 260 × 96 logical pixels, user-scalable from 80–140% with base width 240–380. The full panel is 350 × 440 and the optional floating icon 48 × 48. Keep current/weekly allowance figures emphasised; reduce secondary text.

Expose important adjustments on the main windows: size, opacity/transparency, theme, visibility and always-on-top. Settings also controls content visibility, account preference, clock/timezone, expanded rows, planning thresholds, event pop-ups and their duration. Explicit display modes: always visible, updates only, floating icon only, tray icon only. Compact remains the default; users may choose another mode. Preserve standalone, zero-model-token monitoring.
