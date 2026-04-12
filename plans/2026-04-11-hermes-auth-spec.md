# 2026-04-11 Hermes Auth Spec

## Goal
Document the auth behavior Hermes actually has today, isolate the code-evidenced auth defects from the happy-path smoke results, and define the minimum fixes and checks for entitlement gating, callback generation, app-origin resolution, shared session handling, dev bypass, and public-route boundaries.

## Files Reviewed
- Discovery inputs: `app-manifest.json`, `dev.local.apps.json`, `plans/2026-04-11-cross-app-ci-smoke-spec.md`, `plans/2026-04-11-hermes-test-plan.md`.
- Hermes runtime/config: `apps/hermes/.env.local`, `apps/hermes/package.json`, `apps/hermes/next.config.mjs`, `apps/hermes/src/middleware.ts`, `apps/hermes/src/app/layout.tsx`, `apps/hermes/src/app/page.tsx`, `apps/hermes/src/app/no-access/page.tsx`, `apps/hermes/src/lib/base-path.ts`, `apps/hermes/src/stores/connections-store.ts`, `apps/hermes/src/components/app-shell/app-shell.tsx`.
- Hermes covered routes and auth-sensitive APIs: `apps/hermes/src/app/insights/page.tsx`, `apps/hermes/src/app/insights/insights-client.tsx`, `apps/hermes/src/app/orders/page.tsx`, `apps/hermes/src/app/orders/orders-client.tsx`, `apps/hermes/src/app/api/health/route.ts`, `apps/hermes/src/app/api/accounts/route.ts`, `apps/hermes/src/app/api/analytics/overview/route.ts`, `apps/hermes/src/app/api/orders/count/route.ts`, `apps/hermes/src/app/api/orders/list/route.ts`, `apps/hermes/src/app/api/logs/attempts/route.ts`, `apps/hermes/src/app/api/solicitations/request-review/route.ts`, `apps/hermes/src/app/api/dispatches/requeue/route.ts`, `apps/hermes/src/app/api/dispatches/cancel/route.ts`, `apps/hermes/src/app/api/orders/backfill/route.ts`.
- Shared auth and portal launch/session files: `packages/auth/src/index.ts`, `packages/auth/dist/index.js`, `apps/sso/lib/apps.ts`, `apps/sso/lib/auth.ts`, `apps/sso/app/api/v1/authz/me/route.ts`, `apps/sso/app/login/page.tsx`, `apps/sso/app/auth/relay/page.tsx`, `apps/sso/app/api/auth/[...nextauth]/route.ts`, `apps/sso/app/api/auth/reset/route.ts`, `README.md`.
- Auth-adjacent tests/helpers: `apps/sso/tests/login.spec.ts`, `apps/atlas/tests/unit/middleware-origin.test.ts`. No direct Hermes auth test files were found.

## Repro Routes
- All routes below are under Hermes base path `/hermes`, set in `apps/hermes/next.config.mjs:6-16`.
- `/`: middleware gates first in `apps/hermes/src/middleware.ts:42-118`, then `apps/hermes/src/app/page.tsx:3-5` redirects to `/insights`.
- `/insights`: `apps/hermes/src/app/insights/page.tsx:3-4` renders `InsightsClient`, which loads `/api/accounts` via `apps/hermes/src/stores/connections-store.ts:63-84` and `/api/analytics/overview` via `apps/hermes/src/app/insights/insights-client.tsx:267-304`.
- `/orders`: `apps/hermes/src/app/orders/page.tsx:3-4` renders `OrdersClient`, which loads `/api/orders/count`, `/api/orders/list`, `/api/logs/attempts`, `/api/solicitations/request-review`, `/api/dispatches/requeue`, `/api/dispatches/cancel`, and `/api/orders/backfill` from `apps/hermes/src/app/orders/orders-client.tsx:262-619`.
- `/no-access`: public in `apps/hermes/src/middleware.ts:56-65`; rendered by `apps/hermes/src/app/no-access/page.tsx:1-15`.
- `/api/health`: intentionally public in `apps/hermes/src/middleware.ts:56-65` and implemented in `apps/hermes/src/app/api/health/route.ts:6-16`.
- Existing live smoke only exercised the entitled happy path: `plans/2026-04-11-cross-app-ci-smoke-spec.md:119-122` recorded `/hermes -> /hermes/insights`, then 200s for the initial analytics/account requests, then successful navigation to `/hermes/orders`.

## Confirmed Issues
- Local standalone auth origin and callback generation are pointed at production, not the repo’s standalone dev topology. `apps/hermes/src/middleware.ts:11-39,113-115` builds callback URLs from `NEXT_PUBLIC_APP_URL` / `BASE_URL` / `NEXTAUTH_URL`, and `packages/auth/src/index.ts:518-557` builds portal login URLs from `NEXT_PUBLIC_PORTAL_AUTH_URL` / `PORTAL_AUTH_URL` / `NEXTAUTH_URL` before using request context. But `apps/hermes/.env.local:10-20` sets those values to `https://os.targonglobal.com`, while the documented local contract is `http://localhost:3214/hermes` plus `http://localhost:3200` in `README.md:328-343`, `dev.local.apps.json:2-11`, and `apps/sso/lib/apps.ts:137-143,277-330`. The same drift affects the `/no-access` portal link in `apps/hermes/src/app/no-access/page.tsx:1-12`.
- Hermes’ dev auth bypass is broader than the shared auth package’s localhost-only bypass and short-circuits the entire protected surface. `apps/hermes/src/middleware.ts:67-80` skips auth for any non-production runtime with `ALLOW_DEV_AUTH_SESSION_BYPASS` or `ALLOW_DEV_AUTH_DEFAULTS`, but `packages/auth/src/index.ts:827-877` only honors those flags in loopback context. Because the covered route handlers do not perform their own session or entitlement checks, protected APIs such as `apps/hermes/src/app/api/accounts/route.ts:27-58`, `apps/hermes/src/app/api/analytics/overview/route.ts:10-47`, `apps/hermes/src/app/api/orders/count/route.ts:10-60`, `apps/hermes/src/app/api/orders/list/route.ts:26-89`, `apps/hermes/src/app/api/logs/attempts/route.ts:24-173`, `apps/hermes/src/app/api/solicitations/request-review/route.ts:34-125`, `apps/hermes/src/app/api/dispatches/requeue/route.ts:20-109`, `apps/hermes/src/app/api/dispatches/cancel/route.ts:18-79`, and `apps/hermes/src/app/api/orders/backfill/route.ts:52-200` become anonymous whenever that bypass path is taken.
- Hermes has no Hermes-specific auth coverage for unauthenticated, forbidden, callback, or no-access flows. The only Hermes discovery artifacts are the happy-path smoke notes in `plans/2026-04-11-cross-app-ci-smoke-spec.md:119-122` and the route boot plan in `plans/2026-04-11-hermes-test-plan.md:13-33,68-70`. `rg --files` found no `apps/hermes/tests` tree; adjacent auth coverage exists only in `apps/sso/tests/login.spec.ts:11-31` and `apps/atlas/tests/unit/middleware-origin.test.ts:6-65`.

## Likely Root Causes
- Hermes’ checked-in local config drifted away from the portal’s standalone dev contract. `apps/hermes/package.json:7-9` and `apps/hermes/.env.local:17-20` use `3014` and production URLs, while the portal app launcher still resolves Hermes to `3214` in `dev.local.apps.json:2-11` and `apps/sso/lib/apps.ts:137-143,321-348`.
- Hermes duplicates auth logic in `apps/hermes/src/middleware.ts` instead of delegating origin resolution and bypass policy fully to shared helpers in `packages/auth/src/index.ts`. That is why callback origin rules and bypass rules drifted.
- Hermes centralizes auth at the middleware boundary. No direct evidence yet of a page/API split-brain like xPlan, but this design makes bypass or matcher mistakes high impact because the handlers themselves do not re-assert identity or entitlement.

## Recommended Fixes
- Make Hermes pick one standalone dev contract and enforce it everywhere. Either move Hermes to the repo-standard `3214`/`3200` localhost topology from `README.md:328-343` and `dev.local.apps.json:2-11`, or update the portal launcher and docs to `3014`; do not keep both.
- Remove the inline bypass short-circuit from `apps/hermes/src/middleware.ts:67-80` and let shared auth own bypass semantics end-to-end. The bypass should stay localhost-only, matching `packages/auth/src/index.ts:827-877`.
- Replace Hermes’ local `resolveAppOrigin()` callback construction with a shared, tested helper pattern. The closest existing test coverage is `apps/atlas/tests/unit/middleware-origin.test.ts:6-65`; Hermes should have equivalent coverage for callback generation.
- Extend Hermes auth coverage beyond the current happy path: unauthenticated `/ -> /login?callbackUrl=...`, non-entitled `/ -> /no-access`, entitled `/ -> /insights`, `/no-access` portal link correctness, `/api/health` public access, and protected API 401/403 behavior.

## Verification Plan
- Unauthenticated local check: `GET /hermes` should redirect to the local portal login, not production, and the `callbackUrl` should round-trip to the local Hermes origin.
- Entitled user check: `/hermes` should land on `/hermes/insights`; `/hermes/api/accounts` and `/hermes/api/analytics/overview` should return `200`; `/hermes/orders` should load with `/hermes/api/orders/count` and `/hermes/api/orders/list` returning `200`.
- Non-entitled user check: page routes should redirect to `/hermes/no-access`; protected APIs should return `403` JSON with `error: "No access to Hermes"` from `apps/hermes/src/middleware.ts:100-110`.
- Public boundary check: `/hermes/api/health` stays public; `/hermes/no-access` stays reachable; all other covered `/api/*` routes remain protected.
- Dev bypass check after fix: bypass works on localhost when explicitly enabled, but the same env flag on a non-loopback host does not disable Hermes auth.

## Cross-App Notes
- `app-manifest.json:2-13` marks Hermes as `active`, so any denial is about session/entitlement, not lifecycle.
- Hermes currently does not show the xPlan-style “page allowed but API 401” failure. No direct evidence yet: `plans/2026-04-11-cross-app-ci-smoke-spec.md:119-122` shows `/insights` and `/orders` booting cleanly with 200s on the initial boot APIs.
- Portal launch already has a canonical Hermes dev mapping at `http://localhost:3214/hermes` in `dev.local.apps.json:2-11` and `apps/sso/lib/apps.ts:137-143,277-330`.
- Hermes entitlement gating is grant-presence only. `packages/auth/src/index.ts:1048-1127` allows access when `authz.apps.hermes` exists or the user is `platform_admin`; Hermes adds no finer capability gate. No direct evidence yet that Hermes needs more granularity.
- Hermes runtime auth comes from `packages/auth/dist/index.js`, not directly from source, because `apps/hermes/next.config.mjs:7-23` aliases `@targon/auth` to the built dist file.

## Open Questions
- Were `ALLOW_DEV_AUTH_SESSION_BYPASS` or `ALLOW_DEV_AUTH_DEFAULTS` enabled during the successful 2026-04-11 Hermes smoke run? No direct evidence yet.
- Is the checked-in `apps/hermes/.env.local` meant for PM2/prod-like deployment only, with a different untracked local developer env expected in practice? No direct evidence yet.
- Should `/hermes/no-access` remain public while showing “Your account is authenticated” in `apps/hermes/src/app/no-access/page.tsx:5-12`, or should that copy become auth-state-neutral? No direct evidence yet.
- Should Hermes keep middleware-only auth for side-effectful APIs like `/api/orders/backfill` and `/api/dispatches/*`, or add route-level defense in depth? No direct evidence yet.
