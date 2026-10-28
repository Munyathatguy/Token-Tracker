# Roadmap

## Current delivery
Windows desktop app, independent metadata collector, quota-first bubble and dashboard, local persistence, native tray, Codex record observation, optional Claude adapter and read-only model bridge.

## Next integration work
1. Owner-controlled live Claude acceptance: confirm statusline fields on the installed version, prompt/start delivery and reversible configuration.
2. Broader Codex hook acceptance across versions and quota transitions. Trusted lifecycle-hook delivery is verified in the owner development chat; the separate app-server process only reads account quotas.
3. Complete-session discovery beyond the bounded recent-file scan; display historical backfill progress and per-source capabilities.
4. Client-owned SDK integrations for reliable prompt/completion delivery, including safe one-time completion feedback where the host supports it.
5. Verified handoff automation: tie a finishing reserve to task type, save recovery records, validate the resulting work, preserve external job ownership and logs.
6. Source-specific exact allowance units and rate-limit bucket expansion without inventing token limits.
7. Burn-rate forecasting only when enough fresh readings support an honest uncertainty range.
8. Measured continuity evaluation across compactions; no claim that compaction count proves degradation.
9. Signed release packaging, updater, optional login startup, retention/export controls, accessibility and broader display-scale coverage.

No deadline or resource concern permits silently replacing supported integration with unreliable UI scraping or AI-guessed usage.
