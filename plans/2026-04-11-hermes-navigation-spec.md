# 2026-04-11 Hermes Navigation Spec
## Goal
Document the current Hermes navigation contract around the `/hermes` base path: canonical entry, sidebar/header coverage, no-access recovery, and whether the customer-ops routes exposed in code are actually reachable through the app shell without dead ends or hidden route families.

## Files Reviewed
- `app-manifest.json`
- `dev.local.apps.json`
- `plans/2026-04-11-cross-app-ci-smoke-spec.md`
- `plans/2026-04-11-hermes-test-plan.md`
- `apps/hermes/next.config.mjs`
- `apps/hermes/src/middleware.ts`
- `apps/hermes/src/lib/base-path.ts`
- `apps/hermes/src/app/layout.tsx`
- `apps/hermes/src/app/page.tsx`
- `apps/hermes/src/app/no-access/page.tsx`
- `apps/hermes/src/app/insights/page.tsx`
- `apps/hermes/src/app/orders/page.tsx`
- `apps/hermes/src/app/reviews/page.tsx`
- `apps/hermes/src/app/messaging/page.tsx`
- `apps/hermes/src/app/accounts/page.tsx`
- `apps/hermes/src/app/logs/page.tsx`
- `apps/hermes/src/app/settings/page.tsx`
- `apps/hermes/src/app/campaigns/page.tsx`
- `apps/hermes/src/app/campaigns/new/page.tsx`
- `apps/hermes/src/app/campaigns/[id]/page.tsx`
- `apps/hermes/src/app/experiments/page.tsx`
- `apps/hermes/src/app/templates/page.tsx`
- `apps/hermes/src/components/app-shell/nav.ts`
- `apps/hermes/src/components/app-shell/app-sidebar.tsx`
- `apps/hermes/src/components/app-shell/app-header.tsx`

## Repro Routes
- `/hermes`
- `/hermes/insights`
- `/hermes/orders`
- `/hermes/reviews`
- `/hermes/messaging`
- `/hermes/accounts`
- `/hermes/logs`
- `/hermes/settings`
- `/hermes/campaigns`
- `/hermes/campaigns/new`
- `/hermes/campaigns/[id]`
- `/hermes/experiments`
- `/hermes/templates`
- `/hermes/no-access`

## Confirmed Issues
- `no-access` recovery has an unsafe portal fallback. `apps/hermes/src/app/no-access/page.tsx` resolves the return URL from `NEXT_PUBLIC_PORTAL_AUTH_URL || PORTAL_AUTH_URL || '/'`, so a missing portal env sends a blocked user to `/` instead of a guaranteed portal launcher/home surface.
- Hermes’ shell navigation hides major route families that the app and test plan treat as first-class surfaces. `apps/hermes/src/components/app-shell/nav.ts` exposes only `Insights`, `Orders`, `Reviews`, `Messaging`, `Accounts`, `Logs`, and `Settings`, while the test plan’s P0 and P1 flows explicitly include `Campaigns`, `Experiments`, and `Templates` in `plans/2026-04-11-hermes-test-plan.md`. Those routes exist in `apps/hermes/src/app/campaigns/**`, `apps/hermes/src/app/experiments/page.tsx`, and `apps/hermes/src/app/templates/page.tsx`, but they are absent from the sidebar.
- Local standalone origin/topology is inconsistent with the launcher map. `plans/2026-04-11-cross-app-ci-smoke-spec.md` recorded Hermes at `http://localhost:3014/hermes`, while `dev.local.apps.json` expects `http://localhost:3214/hermes`. Since middleware builds login callbacks from env-derived app origin in `apps/hermes/src/middleware.ts`, this drift directly affects deep-link return behavior.

## Likely Root Causes
- Hermes’ navigation contract is split between the route tree and a manually curated shell nav list. New surfaces were added under `app/` and into the test plan, but `nav.ts` was not updated.
- Recovery routing is configuration-driven but not configuration-safe. `no-access` uses a fallback intended to “go somewhere,” not a required portal target.
- Base-path and callback handling are centralized in middleware, but they depend on app-origin env values lining up with the actual launcher topology. The repo already shows that they do not.

## Recommended Fixes
- Make the portal return target required for `/hermes/no-access`. Remove the `'/'` fallback and use one canonical launcher/home URL helper.
- Decide which Hermes surfaces are part of primary navigation and make the shell reflect that contract. If `campaigns`, `experiments`, and `templates` are real product surfaces, add them to the app shell. If they are intentionally secondary, update the Hermes test plan to stop treating them like mainline nav coverage.
- Unify Hermes standalone origin across app map, local runtime, and auth/callback env so `/hermes/...` deep links round-trip to the same host and port.
- Add browser coverage for the missing shell-to-route contract: `/hermes` entry, sidebar links, and direct access to campaign/experiment/template routes.

## Verification Plan
- Assert `/hermes` redirects to `/hermes/insights`.
- Assert all sidebar items load and keep the `/hermes` base path.
- Assert direct navigation to `/hermes/campaigns`, `/hermes/campaigns/new`, `/hermes/campaigns/[id]`, `/hermes/experiments`, and `/hermes/templates` succeeds without hidden-route dead ends.
- Force a forbidden user to `/hermes/orders` and verify `/hermes/no-access` returns to the actual portal origin, not `/`.
- Force an unauthenticated deep link to `/hermes/campaigns/[id]` and verify portal login preserves the full `/hermes/...` callback URL.
- Assert the local launcher target for Hermes matches the host/port used in callback generation.

## Cross-App Notes
- `app-manifest.json` marks Hermes as `active`.
- The cross-app smoke already confirmed the current happy path for `/hermes/insights` and `/hermes/orders`, but it did not exercise campaigns, experiments, templates, or no-access recovery.
- Hermes shares the same portal-origin drift pattern as the other role-gated apps: callback behavior depends on app/env topology matching the SSO launcher map.

## Open Questions
- Are `campaigns`, `experiments`, and `templates` intended to be first-class shell destinations, or are they intentionally secondary routes reached only from internal links?
- Is the authoritative standalone Hermes origin `3014` or `3214`?
- Should `no-access` return to the portal launcher, the auth root, or a dedicated access-request flow?
