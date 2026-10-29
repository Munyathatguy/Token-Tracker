# Quota correctness, alarms and model delivery — v0.3

## Incident and root causes
The owner reported that the dashboard and bubble replaced exhausted usage with dashes, displayed two Codex cards, and provided no evidence of model warnings or reset alarms.

Local event records established the sequence: the ordinary `codex` bucket reported current usage 100% and weekly usage 16%. A later `premium` record contained no primary or secondary window. The older app treated the empty bucket as another account and sorted it ahead of the useful bucket. It also replaced expired numeric readings with unavailable markers. Desktop notifications were not persisted in Recent activity, and no automatic Codex model integration had been configured. Earlier packaging/UI tests were not proof of model protection.

## Corrected behaviour
- Retain each window independently. Current 0% and weekly 84% remain separate values; a partial/empty update cannot erase either.
- Keep last-reported figures visible when stale or after scheduled reset. Label their age and reset status. Do not assume 100% at a deadline.
- Hide metadata-only buckets from usage cards without merging their identity into a different bucket. They are explained in Integrations.
- Read `account/rateLimits/read` through an owned Codex app-server process every 60 seconds; Refresh usage forces a read. This starts no model turn and reads no credential files. It uses the official client's existing sign-in. Local session records still provide context/activity.
- Show reset dates/countdowns and a compact reset line. Separate scheduled time reached from fresh provider-confirmed availability.
- Persist warning, prepare, wrap, exhaustion, reset-due and available-again events. They appear in the alert panel and activity history. Duplicate events are suppressed across restarts.
- Optional sounds for early warnings, exhaustion and reset/availability; adjustable volume and an explicit Test alarm sound button. Sounds work through the local renderer while windows are hidden. Playback completion is logged; this does not prove speakers were audible or the user heard it. Windows notifications are requested with an application identity/shortcut and their show/failure callbacks are recorded. Focus Assist and OS audio controls still apply.
- Remove the design-preview toggle from normal use. Explicit developer capture routes retain labelled illustrative fixtures, including the 0% / 84% regression case.

## Codex model connection
Integrations can configure reversible global Codex lifecycle hooks in `~/.codex/hooks.json`, preserving other hooks and a backup. The helper is copied to the stable local application-data bridge folder. Codex requires review/trust of the exact hook definitions; the app never writes trust state or uses a trust bypass.

SessionStart/UserPromptSubmit supply awareness; tool hooks send it at most once per minute or when warning severity changes. Stop returns an empty JSON object, never a continuation request. Model-visible updates contain only a short usage/time briefing. Supplying that text adds model-context tokens; independent collection and alarms do not.

The dashboard separately shows configured status, observed hook calls, and client-output receipts (with the last supplied text). A transport receipt is not proof a model consumed or obeyed a warning. Old warnings are not invented retroactively. Until the host trusts and runs the hooks, Codex protection remains unverified.

## Verification
### 2026-10-29 connection incident
The owner reported no warnings in another Codex chat. The installed helper failed with ENOENT: its descriptor still identified yesterday's process, while the running application had a different process and named pipe. Hook and database records had no new activity for the reported period. The reason the descriptor became stale has not been established. Yesterday's low-quota output receipts do not prove delivery today.

The bridge now verifies its endpoint and descriptor on each collector tick, atomically repairs missing/stale descriptor contents, records repairs, and exposes current health on the dashboard. Shutdown only removes its own descriptor. A second instance exits immediately rather than continuing initialization. A disconnected Codex helper returns explicit model-visible monitoring-unavailable context; Stop remains loop-free. This fallback requires the host to actually execute a trusted hook. It cannot inform a host that never runs hooks.

Regression tests reproduce stale descriptor replacement and disconnected helper output. A live endpoint check remains distinct from host consumption and successful task wrap-up. No claim is made that the unknown external cause of descriptor staleness is resolved.

26 automated functional tests include account API transport without thread/turn creation; empty bucket/partial window handling; warning/reset deduplication; actual CLI-to-bridge Codex output at a simulated 7% allowance with a wrap-up instruction; no Stop continuation; and reversible hook installation. The native Windows build verified one Codex card with 0% / 84%, no normal preview toggle, and a completed volume-zero audio pipeline test.

After the owner enabled the five matching hooks, this development chat actually received model-visible Token Tracker developer context mid-turn. The local receipt matched the current chat and the supplied current/weekly/reset figures; the stable helper matched the source hash. This establishes live automatic delivery. It does not retroactively establish delivery during the earlier incident, nor prove a future low-quota task will always finish. Physical speaker audibility remains user-verifiable through Test alarm sound.

References: [Codex account API](https://learn.chatgpt.com/docs/app-server), [Codex hook trust and output](https://learn.chatgpt.com/docs/hooks), [Electron Windows notifications](https://www.electronjs.org/docs/latest/tutorial/notifications).
