# 2026-04-11 xPlan Auth Spec
## Goal
Document the current xPlan auth surface and isolate evidenced failures around shared NextAuth config, callback URL generation, cookie/session handling, entitlement gating, API `401` behavior, and local-vs-portal config drift, using code plus the existing smoke findings rather than assumptions.

## Files Reviewed
- Repo/app topology and existing specs: `app-manifest.json`, `dev.local.apps.json`, `plans/2026-04-11-cross-app-ci-smoke-spec.md`, `plans/2026-04-11-xplan-test-plan.md`.
- xPlan auth/bootstrap files: `apps/xplan/lib/auth.ts`, `apps/xplan/middleware.ts`, `apps/xplan/next.config.ts`, `apps/xplan/app/layout.tsx`, `apps/xplan/app/api/auth/[...nextauth]/route.ts`, `apps/xplan/.env.dev.ci`, `apps/xplan/package.json`, `apps/xplan/README.md`.
- xPlan workbook entry and denial routes: `apps/xplan/app/page.tsx`, `apps/xplan/app/[sheet]/page.tsx`, `apps/xplan/app/[sheet]/error.tsx`, `apps/xplan/app/no-access/page.tsx`, `apps/xplan/lib/sheets.ts`, `apps/xplan/lib/workbook.ts`.
- xPlan provider/session-adjacent UI files: `apps/xplan/components/providers.tsx`, `apps/xplan/components/workbook-layout.tsx`, `apps/xplan/components/sheet-tabs.tsx`, `apps/xplan/components/sheets/setup-workspace.tsx`, `apps/xplan/components/sheets/strategy-table.tsx`, `apps/xplan/lib/base-path.ts`.
- xPlan auth helpers and entitlement/strategy helpers: `apps/xplan/lib/api/auth.ts`, `apps/xplan/lib/api/strategy-guard.ts`, `apps/xplan/lib/strategy-access.ts`.
- xPlan auth-sensitive API routes: `apps/xplan/app/api/v1/xplan/assignees/route.ts`, `strategies/route.ts`, `products/route.ts`, `products/import/route.ts`, `business-parameters/route.ts`, `lead-time-overrides/route.ts`, `sales-weeks/route.ts`, `profit-and-loss/route.ts`, `cash-flow/route.ts`, `system-forecast/route.ts`, `purchase-orders/route.ts`, `purchase-orders/batches/route.ts`, `purchase-orders/duplicate/route.ts`, `purchase-order-payments/route.ts`, `purchase-orders/talos/route.ts`, `purchase-orders/import-talos/route.ts`, `amazon/products/route.ts`, `amazon/orders/route.ts`, `workbook/export/route.ts`, `workbook/import/route.ts`.
- xPlan sellerboard auth routes: `apps/xplan/app/api/v1/xplan/sellerboard/us-actual-sales/route.ts`, `us-dashboard/route.ts`, `uk-actual-sales/route.ts`, `uk-dashboard/route.ts`, `us-sync/manual/route.ts`, `uk-sync/manual/route.ts`, `pnl-compare/route.ts`, `us-actual-sales/raw-week/route.ts`, `uk-actual-sales/raw-week/route.ts`, `us-actual-sales/debug/route.ts`, `uk-actual-sales/debug/route.ts`, `us-dashboard/debug/route.ts`, `uk-dashboard/debug/route.ts`, `us-actual-sales/compare/route.ts`, `uk-actual-sales/compare/route.ts`, `us-dashboard/compare/route.ts`, `uk-dashboard/compare/route.ts`.
- Shared auth and portal-side dependencies: `packages/auth/src/index.ts`, `packages/auth/src/server.ts`, `packages/auth/src/db.ts`, `apps/sso/lib/auth.ts`, `apps/sso/lib/apps.ts`, `apps/sso/app/auth/relay/page.tsx`, `apps/sso/app/login/page.tsx`, `apps/sso/app/page.tsx`, `apps/sso/tests/login.spec.ts`.
- Relevant test signal: `apps/xplan/tests/setup.ts`. No direct evidence yet of xPlan-specific auth tests beyond repo search and the portal login Playwright spec.

## Repro Routes
- Under the xPlan base path `/xplan`, `/` delegates straight to `/1-setup` via `apps/xplan/app/page.tsx:1-11`.
- `/xplan/1-strategies` is still the portal launch URL from `apps/sso/lib/apps.ts:123-125`, and xPlan accepts it only because `apps/xplan/lib/sheets.ts:85-101` remaps the legacy slug to `/1-setup`.
- `/xplan/1-setup` is the key repro route. The existing smoke spec already recorded a rendered Setup shell plus `GET /xplan/api/v1/xplan/assignees -> 401` and console `Error: Authentication required`, which matches `apps/xplan/components/sheets/strategy-table.tsx:145-156`.
- `/xplan/no-access` is intentionally public in `apps/xplan/middleware.ts:63-66,117` and renders the denial page from `apps/xplan/app/no-access/page.tsx`.
- Session-gated API families are the `withXPlanAuth` routes in `apps/xplan/app/api/v1/xplan/*`; strategy-scoped routes add `requireXPlanStrategyAccess` or `requireXPlanStrategiesAccess`.
- Sellerboard cron sync routes are the exception: `apps/xplan/app/api/v1/xplan/sellerboard/{us,uk}-{actual-sales,dashboard}/route.ts` bypass portal auth and require bearer token auth.

## Confirmed Issues
- xPlan can render the workbook shell without a usable xPlan session. `apps/xplan/app/[sheet]/page.tsx:2230-2277,2555` calls `auth()` but does not block on `null`; it builds an actor from the nullable session, resolves strategy access, and still renders `SetupWorkspace`. That matches the smoke finding in `plans/2026-04-11-cross-app-ci-smoke-spec.md` where Setup rendered while `/api/v1/xplan/assignees` returned `401`.
- Middleware auth and API auth do not use the same source of truth. `apps/xplan/middleware.ts:90-123` uses `requireAppEntry`, which flows through `packages/auth/src/index.ts:951-1126` and can authorize via shared cookie decode plus portal `/api/v1/authz/me` probe. But API routes use `apps/xplan/lib/api/auth.ts:18-30`, which only checks local `auth()` and returns `401` on a null app session. That is a direct code path for “page allowed, API 401.”
- xPlan’s local shared-auth config is drift-prone compared with the portal. `apps/xplan/lib/auth.ts:82-85` falls back to `process.env.COOKIE_DOMAIN || '.targonglobal.com'` and sets `appId: 'targon'`, while the portal hard-fails on missing `COOKIE_DOMAIN` and normalizes it from `NEXTAUTH_URL` in `apps/sso/lib/auth.ts:35-44,82-127`. This makes xPlan more tolerant of bad env state than the portal it depends on.
- Callback URL generation is env-origin-driven, not request-origin-driven. `apps/xplan/middleware.ts:11-33,123` derives callback origin from `NEXT_PUBLIC_APP_URL`, `BASE_URL`, or `NEXTAUTH_URL`. The committed bootstrap file `apps/xplan/.env.dev.ci:9-24` points those at `https://dev-os.targonglobal.com/xplan`, and `apps/xplan/README.md:26-29` tells developers to copy that file into `.env.local`. If those values are not corrected, app-initiated login redirects will target the wrong origin.
- Local dev topology is inconsistent across xPlan and the portal. `apps/xplan/package.json:6` runs on `3008`, but `dev.local.apps.json` maps xPlan to `3208`, `apps/sso/lib/apps.ts:123-125` publishes `http://localhost:3208`, and `apps/xplan/README.md:71-74` documents `3208`. The existing smoke spec already observed xPlan on `3008` while the portal map expected `3208`.

## Likely Root Causes
- The shared-auth design is split: middleware trusts portal-session/authz evaluation from `@targon/auth`, while xPlan APIs trust the app-local NextAuth session from `apps/xplan/lib/auth.ts`. Those are not equivalent in local drift scenarios.
- The sheet route treats missing session as “anonymous/no strategy” instead of an auth failure. That turns auth breakage into an empty workbook shell rather than a hard redirect.
- Local auth configuration is spread across `apps/xplan/.env.dev.ci`, `apps/xplan/README.md`, `apps/xplan/package.json`, `dev.local.apps.json`, and `apps/sso/lib/apps.ts`, with no single enforced canonical origin/port.
- Dev bypass logic is asymmetric. `packages/auth/src/index.ts:866-1031` can bypass through portal authz evaluation, and `apps/xplan/middleware.ts:75-86` can short-circuit entirely, but `apps/xplan/lib/api/auth.ts` still requires a real `auth()` session. No direct evidence yet that bypass envs were enabled in the failing smoke run, but the code path exists.

## Recommended Fixes
- Use one server-side auth gate for xPlan pages and APIs. The simplest direction is to stop relying on plain `auth()` for protected route families and instead reuse a shared helper built on `requireAppEntry` or `getCurrentAuthz` so middleware, page SSR, and API handlers all decide from the same portal-backed auth state.
- Make `apps/xplan/app/[sheet]/page.tsx` hard-block unauthenticated users before strategy resolution. Rendering `SetupWorkspace` with an empty strategy list should only happen for an authenticated user with no accessible strategies, not for a missing session.
- Remove silent local auth drift. `apps/xplan/lib/auth.ts` should not default `COOKIE_DOMAIN` to `.targonglobal.com`, and `apps/xplan/middleware.ts` should either build callback URLs from the incoming request origin or explicitly fail when request host and configured app origin disagree.
- Pick one canonical local xPlan URL and update all sources to match it: `apps/xplan/package.json`, `apps/xplan/README.md`, `dev.local.apps.json`, and `apps/sso/lib/apps.ts`. The repo currently says both `3008` and `3208`.
- Add an auth smoke that starts at the portal tile for xPlan, lands on `/xplan/1-strategies`, verifies redirect to `/xplan/1-setup`, and hard-fails on any `401`/`403` from required boot APIs or on any unexpected return to portal home.

## Verification Plan
- Unauthenticated browser check: hit `/xplan/` and `/xplan/1-setup`; both must redirect to portal `/login` with a callback URL that matches the actual xPlan origin and base path.
- Authenticated entitled user check: portal tile launch to `/xplan/1-strategies` must land on `/xplan/1-setup` and boot without console `Authentication required`; `GET /xplan/api/v1/xplan/assignees` and `GET /xplan/api/v1/xplan/strategies` must both return `200`.
- Authenticated non-entitled user check: browser route must land on `/xplan/no-access`; API routes must return `403` JSON, not `401`.
- Local topology check: the xPlan dev server port must match the portal’s published `resolveAppUrl` target and the docs. There should be one value only.
- Sellerboard check: bearer-token cron routes must keep returning `401` on bad/missing token and `200` on valid token, while manual/debug/compare routes must continue to require portal session and, where applicable, superadmin access.
- CI check: replace the current portal callback smoke expectation with an app-return assertion. `apps/sso/tests/login.spec.ts:23-29` is not sufficient.

## Cross-App Notes
- Portal launch still depends on the legacy xPlan slug `/xplan/1-strategies` in `apps/sso/lib/apps.ts:123-125`; xPlan currently normalizes that via `apps/xplan/lib/sheets.ts:85-101`. If that alias is removed, the portal tile must change at the same time.
- Portal redirect behavior for cross-origin app returns lives in `apps/sso/lib/auth.ts:312-351` and uses `/auth/relay` for localhost or allowed cookie-domain hosts, implemented in `apps/sso/app/auth/relay/page.tsx:32-77`.
- The only reviewed browser auth test, `apps/sso/tests/login.spec.ts:23-29`, treats “callback login lands on portal home” as success. That protects portal sign-in, not app handoff.
- No direct evidence yet of xPlan-specific auth regression tests under `apps/xplan/tests`; the repo search only surfaced generic test setup and non-auth unit tests.

## Open Questions
- What values are actually present in developers’ real `apps/xplan/.env.local` and portal env files? No direct evidence yet.
- Were `ALLOW_DEV_AUTH_SESSION_BYPASS` or `ALLOW_DEV_AUTH_DEFAULTS` enabled in the local run that produced the `/assignees` `401`? No direct evidence yet.
- Should xPlan keep exposing local `/api/auth/*` handlers and local `auth()` lookups at all, or should the app rely entirely on portal-issued session/authz evaluation?
- Which local URL is the intended source of truth for xPlan: `http://localhost:3008/xplan` or `http://localhost:3208/xplan`?
