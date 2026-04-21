# 2026-04-11 Kairos Auth Spec
## Goal
Document the current Kairos auth behavior for `/`, `/forecasts`, and `/no-access`, isolate code-evidenced failures in entitlement gating, shared session config, callback/login URL generation, cookie/session handling, and local/CI drift, and anchor follow-up smoke coverage to `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` and `plans/2026-04-11-kairos-test-plan.md`.

## Files Reviewed
- Required discovery inputs: `app-manifest.json`, `dev.local.apps.json`, `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`, `plans/2026-04-11-kairos-test-plan.md`.
- Kairos auth entrypoints: `apps/kairos/lib/auth.ts`, `apps/kairos/middleware.ts`, `apps/kairos/app/layout.tsx`, `apps/kairos/app/api/auth/[...nextauth]/route.ts`.
- Kairos routed surfaces: `apps/kairos/app/page.tsx`, `apps/kairos/app/(app)/layout.tsx`, `apps/kairos/app/(app)/forecasts/page.tsx`, `apps/kairos/app/no-access/page.tsx`, `apps/kairos/components/forecasts/forecasts-table.tsx`.
- Kairos provider/base-path/client helpers: `apps/kairos/components/providers.tsx`, `apps/kairos/components/kairos-shell.tsx`, `apps/kairos/lib/base-path.ts`, `apps/kairos/lib/api/client.ts`.
- Kairos entitlement/access helpers: `apps/kairos/lib/api/auth.ts`, `apps/kairos/lib/access.ts`.
- Kairos protected API boundaries: `apps/kairos/app/api/v1/forecasts/route.ts`, `apps/kairos/app/api/v1/forecasts/[forecastId]/route.ts`, `apps/kairos/app/api/v1/forecasts/[forecastId]/run/route.ts`, `apps/kairos/app/api/v1/forecasts/[forecastId]/cancel/route.ts`, `apps/kairos/app/api/v1/forecasts/[forecastId]/export/route.ts`, `apps/kairos/app/api/v1/time-series/route.ts`, `apps/kairos/app/api/v1/time-series/[seriesId]/route.ts`, `apps/kairos/app/api/v1/time-series/[seriesId]/export/route.ts`, `apps/kairos/app/api/v1/time-series/csv/route.ts`, `apps/kairos/app/api/v1/time-series/google-trends/route.ts`.
- Shared auth and portal topology: `packages/auth/src/index.ts`, `apps/sso/lib/apps.ts`, `apps/sso/lib/auth.ts`, `apps/sso/.env.local`, `apps/sso/.env.dev.ci`, `apps/xplan/lib/auth.ts`, `apps/xplan/middleware.ts`.
- Kairos env/topology files: `apps/kairos/package.json`, `apps/kairos/next.config.ts`, `apps/kairos/.env.local`, `apps/kairos/.env.dev.ci`.
- Relevant test files: `apps/kairos/vitest.config.ts`, `apps/kairos/tests/setup.ts`, `apps/kairos/lib/forecasts/regressor-alignment.test.ts`. No auth-focused Kairos or `packages/auth` tests were found.

## Repro Routes
- `/`: `apps/kairos/middleware.ts` runs before `apps/kairos/app/page.tsx`. If access is allowed, `apps/kairos/app/page.tsx` redirects to `/forecasts`; if forbidden, middleware redirects to `/no-access`; if unauthenticated, middleware redirects to portal `/login?callbackUrl=...`. `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` recorded `http://localhost:3010/kairos -> /kairos/no-access`.
- `/forecasts`: `apps/kairos/app/(app)/layout.tsx` re-checks `hasCapability({ appId: 'kairos', capability: 'enter' })` before rendering `apps/kairos/app/(app)/forecasts/page.tsx`. The page immediately mounts `apps/kairos/components/forecasts/forecasts-table.tsx`, which calls `/api/v1/time-series` and `/api/v1/forecasts`; those routes are protected through `apps/kairos/lib/api/auth.ts`.
- `/no-access`: public in `apps/kairos/middleware.ts`; `apps/kairos/app/no-access/page.tsx` renders the denial UI and builds its portal return link from `NEXT_PUBLIC_PORTAL_AUTH_URL` or `PORTAL_AUTH_URL`.

## Confirmed Issues
- Local auth origin drift is real. `apps/kairos/.env.local` points `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `PORTAL_AUTH_URL`, and `NEXT_PUBLIC_PORTAL_AUTH_URL` at `https://os.targonglobal.com`, while `apps/kairos/middleware.ts` `resolveAppOrigin()` and `packages/auth/src/index.ts` `resolvePortalAuthOrigin()` prefer env values over the request origin. On localhost, unauthenticated Kairos login/callback flow will be built against production URLs, and `apps/kairos/app/no-access/page.tsx` will send users back to production too.
- Local portal launch topology is inconsistent. `dev.local.apps.json` and `apps/sso/lib/apps.ts` map Kairos to `http://localhost:3210`, while `apps/kairos/package.json` runs `next dev -p 3010` and `apps/kairos/.env.local`/`apps/kairos/.env.dev.ci` set `PORT=3010`. The repo smoke spec also exercised Kairos at `http://localhost:3010/kairos`, so local portal launch and local Kairos runtime currently disagree before auth logic even starts.
- Kairos auth bootstrap hard-requires `NEXT_PUBLIC_APP_URL`, but Kairos CI config does not provide it. `apps/kairos/lib/auth.ts` calls `requireEnv('NEXT_PUBLIC_APP_URL')`, yet `apps/kairos/.env.dev.ci` does not define that key and the workflow search did not show a CI injection. Any entitled route or protected API path that reaches `auth()` through `apps/kairos/app/(app)/layout.tsx` or `apps/kairos/lib/api/auth.ts` can fail on auth initialization even if middleware already passed.
- Kairos “capability” checks are only entitlement-presence checks. `packages/auth/src/index.ts` defines `AuthzAppGrant` with `departments` only, `requireAppEntry()` allows access when `authz.apps.kairos` exists, and `hasCapability()` explicitly ignores `options.capability` via `void options.capability; return true;`. The checks in `apps/kairos/app/(app)/layout.tsx` and `apps/kairos/lib/api/auth.ts` therefore enforce “has Kairos grant” rather than a real `enter` capability.
- Current smoke only proves the forbidden path, not a usable Kairos workspace. `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` observed `/kairos/no-access`, and `app-manifest.json` marks Kairos as `active`, so the failure is auth/entitlement-related rather than lifecycle-related.

## Likely Root Causes
- Kairos local env was left on production auth values in `apps/kairos/.env.local`, while the portal-side local auth stack in `apps/sso/.env.local` is already wired to `http://localhost:3200`.
- The shared auth helpers in `packages/auth/src/index.ts` are designed around canonical env inputs; once those envs drift, the same bad origin bleeds into login redirects, callback URLs, session probing, and portal return links.
- Kairos and portal launch config drifted independently: `apps/sso/lib/apps.ts` and `dev.local.apps.json` say `3210`, while Kairos runtime files say `3010`.
- The shared auth API exposes capability-shaped functions (`hasCapability`) without a capability-shaped data model. The current `PortalAuthz` shape only models per-app entitlement plus departments.
- Auth regressions were not covered by automated tests. Kairos has one non-auth unit test in `apps/kairos/lib/forecasts/regressor-alignment.test.ts`, and no auth tests were found in `packages/auth`.

## Recommended Fixes
- Normalize Kairos local auth envs in `apps/kairos/.env.local` to the actual local topology: Kairos app URL on localhost with `/kairos`, portal auth URL on local SSO, and localhost-compatible cookie scoping. The current production values should not be the local default.
- Pick one canonical local Kairos port and use it everywhere. Based on `apps/kairos/package.json`, `apps/kairos/.env.local`, `apps/kairos/.env.dev.ci`, and the existing smoke spec, `3010` is the currently evidenced port; if that is correct, update `dev.local.apps.json` and `apps/sso/lib/apps.ts`.
- Add `NEXT_PUBLIC_APP_URL=https://dev-os.targonglobal.com/kairos` to `apps/kairos/.env.dev.ci`, or remove the hard requirement from `apps/kairos/lib/auth.ts` if `NEXTAUTH_URL`/`BASE_URL` is the intended canonical source for server-side auth init.
- Decide whether Kairos auth is entitlement-only or capability-based. If entitlement-only, rename the checks so the code stops implying capability semantics. If capability-based, extend `packages/auth/src/index.ts` so `PortalAuthz` and `hasCapability()` actually model and enforce capabilities.
- Add explicit auth smoke coverage from `plans/2026-04-11-kairos-test-plan.md`: entitled `/ -> /forecasts`, non-entitled `/ -> /no-access`, and protected API checks for `/api/v1/time-series` and `/api/v1/forecasts`.
- If `ALLOW_DEV_AUTH_DEFAULTS` or `ALLOW_DEV_AUTH_SESSION_BYPASS` is intended to be used for Kairos, move bypass evaluation into one shared helper. Today `apps/kairos/middleware.ts`, `apps/kairos/lib/api/auth.ts`, and `packages/auth/src/index.ts` do not evaluate bypass context the same way.

## Verification Plan
- Local unauthenticated check: clear localhost auth cookies, hit `http://localhost:3010/kairos`, and verify redirect stays on local SSO with a localhost `callbackUrl`, not `os.targonglobal.com`.
- Local non-entitled check: sign in through local SSO as a user without `authz.apps.kairos`, hit `/kairos`, and verify `/kairos/no-access` renders once with a localhost portal return link.
- Local entitled check: sign in as a user with `authz.apps.kairos`, hit `/kairos` and `/kairos/forecasts`, and verify `/api/v1/time-series` and `/api/v1/forecasts` return `200` without redirecting back to `/no-access`.
- CI entitled check: run the repo smoke suite after fixing the Kairos env contract and hard-fail on any Kairos auth init crash, unexpected 401/403 from protected APIs, or landing on `/no-access` for the entitled fixture user.
- Add targeted tests around `apps/kairos/middleware.ts` callback URL generation and the shared `packages/auth/src/index.ts` entitlement/capability helpers so future env drift fails before browser smoke.

## Cross-App Notes
- Kairos intentionally shares the portal session cookie: `apps/kairos/lib/auth.ts` passes `appId: 'targon'` into `withSharedAuth`, matching `apps/xplan/lib/auth.ts`. Any fix must preserve portal-cookie compatibility.
- Kairos middleware is structurally the same as `apps/xplan/middleware.ts`, including callback URL generation and dual cookie-name probing. If the origin/callback bug is fixed in one app, it should likely be fixed in shared code or mirrored in both.
- `apps/sso/.env.local` already defines a localhost portal (`http://localhost:3200`), while `apps/kairos/.env.local` points at production. Kairos is the auth-topology outlier, not the portal.
- `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` already sets the repo expectation: role-gated app smokes should hard-fail on `no-access`, login config errors, or broken callback handling.

## Open Questions
- Which exact `decision.reason` produced the observed `/kairos/no-access` path in `apps/kairos/middleware.ts`: `no_app_access` or `missing_authz`? No direct evidence yet.
- Which local port is meant to be canonical for Kairos, `3010` or `3210`? The portal map and Kairos runtime files currently disagree.
- Should `NEXT_PUBLIC_APP_URL` remain mandatory in `apps/kairos/lib/auth.ts`, or is `NEXTAUTH_URL`/`BASE_URL` supposed to be sufficient for server-side auth init? No direct evidence yet.
- Is Kairos supposed to support capability-level auth beyond app entitlement, or is `enter` just a label for “has Kairos access”? No direct evidence yet.
- Will Kairos local smoke rely on `ALLOW_DEV_AUTH_DEFAULTS` or `ALLOW_DEV_AUTH_SESSION_BYPASS` at all? No direct evidence yet.
