# Token Tracker

Read `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/VERIFICATION.md` and `docs/ROADMAP.md` before changing behaviour.

- Primary objective: remaining current-window and weekly **account usage** awareness for the user and AI, with clean task stopping/continuation. Context, time and compaction support that objective.
- Account allowance is shared, not a per-chat token allocation. Never infer remaining account tokens from cumulative usage or context occupancy.
- Missing/expired/stale data must stay explicit. Compaction risk is a heuristic, not a performance measurement. Observation is not delivery.
- Preserve prompts, client settings, unrelated sessions and running jobs. Never read provider credentials. Keep runtime metadata out of Git.
- Use the standalone collector and narrow client adapters. Do not replace unsupported integration with silent UI scraping or invented values.
- `npm test`, `npm run check`, `npm audit`; `npm run start -- --smoke` for native lifecycle. Keep source and packaged-app evidence distinct.
- Client integration changes must preserve existing settings and offer removal. Never introduce stop-hook feedback loops.
- Do not publish binary releases or enable login startup automatically. Public source publication has been requested for `Munyathatguy/Token-Tracker`.
- When asked to prepare for next session, refresh a project-local handoff with objectives, verified state, requirements, decisions, outstanding work and flexible next steps. No secrets. Historical handoffs are guidance, not immutable plans.
