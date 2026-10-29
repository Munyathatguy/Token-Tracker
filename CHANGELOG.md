# Changelog

## 0.3.0 — 2026-10-28
- Retain current/weekly readings independently; suppress empty metadata-only quota cards.
- Independent signed-in Codex account refresh without model requests.
- Visible reset times/countdowns and persistent warning/exhaustion/reset/availability events.
- Configurable alarm sounds, volume and playback receipts.
- Reversible Codex model-awareness hooks with explicit trust/receipt status.
- Remove the design-preview toggle from normal dashboards.

## 0.2.0 — 2026-10-28
- Compact 260 × 96 strip by default, with smaller secondary text and prominent remaining-allowance figures.
- Expanded panel and floating icon; explicit always-visible, updates-only, floating-icon-only and tray-only behaviours.
- Direct size, opacity, theme, visibility and always-on-top controls on the bubble/dashboard.
- Persistent appearance, content-visibility, account-selection, pop-up and planning-threshold settings.
- Acknowledged client-output notifications for supported Claude hooks/MCP, and separately labelled recent client activity.
- Non-focusing timed pop-ups, no polling-triggered pop-ups, no compaction/performance claims.
- Functional native tests for resizing, opacity, quick controls, settings persistence, themes, visibility and return-to-tray behaviour.

## 0.1.0 — 2026-10-28
- Initial local Codex observer, metadata history, desktop bubble/dashboard, tray, optional Claude hooks and read-only awareness bridge.
## 2026-10-29 connection reliability repair
- Verify the local bridge and atomically repair stale connection descriptors on collector ticks; expose current health and record repairs.
- Disconnected Codex hooks report monitoring unavailable to the model; Stop remains loop-free.
- Exit secondary instances immediately and only remove descriptors owned by the closing bridge.
- Add regression tests for descriptor recovery and disconnected model output.

