# 2026-04-11 Argus Auth Spec
## Goal
Document the current Argus auth boundary and the concrete auth risks around `/`, `/wpr`, `/monitoring`, `/no-access`, callback generation, app-origin resolution, shared session handling, dev bypass, and API auth behavior, using code evidence from `apps/argus` and shared auth code rather than guesses.

## Files Reviewed
- `app-manifest.json`
- `dev.local.apps.json`
- `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`
- `plans/2026-04-11-argus-test-plan.md`
- `apps/argus/middleware.ts`
- `apps/argus/app/layout.tsx`
- `apps/argus/next.config.js`
- `apps/argus/.env.local`
- `apps/argus/.env.dev.ci`
- `apps/argus/package.json`
- `apps/argus/app/page.tsx`
- `apps/argus/app/no-access/page.tsx`
- `apps/argus/app/(app)/layout.tsx`
- `apps/argus/components/layout/app-shell.tsx`
- `apps/argus/lib/base-path.ts`
- `apps/argus/hooks/use-wpr.ts`
- `apps/argus/app/(app)/wpr/page.tsx`
- `apps/argus/app/(app)/monitoring/page.tsx`
- `apps/argus/app/(app)/tracking/page.tsx`
- `apps/argus/app/(app)/tracking/[id]/page.tsx`
- `apps/argus/app/api/wpr/weeks/route.ts`
- `apps/argus/app/api/wpr/weeks/[week]/route.ts`
- `apps/argus/app/api/monitoring/overview/route.ts`
- `apps/argus/app/api/monitoring/changes/route.ts`
- `apps/argus/app/api/monitoring/health/route.ts`
- `apps/argus/app/api/monitoring/asins/[asin]/route.ts`
- `apps/argus/app/api/alerts/preview/route.ts`
- `apps/argus/app/api/alerts/send/route.ts`
- `apps/argus/app/api/tracking/fetch/route.ts`
- `apps/argus/app/api/tracking/dashboard/route.ts`
- `apps/argus/app/api/tracking/asins/route.ts`
- `apps/argus/app/api/listings/route.ts`
- `apps/argus/app/api/fixture/seed/route.ts`
- `apps/argus/app/api/fixture/[...path]/route.ts`
- `apps/sso/lib/apps.ts`
- `apps/sso/dev.local.apps.json`
- `apps/sso/.env.dev.ci`
- `packages/auth/src/index.ts`
- `packages/auth/src/server.ts`

## Repro Routes
- `/` is a server redirect to `/wpr` in `apps/argus/app/page.tsx`; the real auth gate is `apps/argus/middleware.ts` before the redirect.
- `/wpr` is behind middleware, then fetches `/api/wpr/weeks` and `/api/wpr/weeks/[week]` through `apps/argus/hooks/use-wpr.ts` and `apps/argus/app/(app)/wpr/page.tsx`.
- `/monitoring` is behind middleware, then fetches `/api/monitoring/overview`, `/api/monitoring/changes`, and `/api/monitoring/health` from `apps/argus/app/(app)/monitoring/page.tsx`.
- `/tracking` and `/tracking/[id]` just redirect to monitoring in `apps/argus/app/(app)/tracking/page.tsx` and `apps/argus/app/(app)/tracking/[id]/page.tsx`; auth still comes from middleware.
- `/no-access` is explicitly public in `apps/argus/middleware.ts` and renders the deny screen from `apps/argus/app/no-access/page.tsx`.
- Public APIs today are `/api/tracking/fetch` and `/api/alerts/preview` per `apps/argus/middleware.ts`; `/api/tracking/fetch` has its own bearer-token check in `apps/argus/app/api/tracking/fetch/route.ts`, while `/api/alerts/preview` does not.

## Confirmed Issues
- Argus is configured as authenticated-public, not role-gated. `apps/sso/lib/apps.ts` marks Argus `entryPolicy: 'public'`, `apps/sso/lib/apps.ts` returns all public apps from `filterAppsForUser()`, and `apps/argus/middleware.ts` passes `entryPolicy: 'public'` into `requireAppEntry()`. In `packages/auth/src/index.ts`, public entry still requires a portal session/authz but skips the app grant check. That means a signed-in portal user without an Argus grant still gets in. This conflicts with the deny-route existence in `apps/argus/app/no-access/page.tsx` and with the “One entitled Argus user” prerequisite in `plans/2026-04-11-argus-test-plan.md`.
- Login callback generation is pinned to env origin, not request origin. `apps/argus/middleware.ts` builds `callbackUrl` from `NEXT_PUBLIC_APP_URL`, `BASE_URL`, or `NEXTAUTH_URL` only. `apps/argus/.env.local` points those at `https://os.targonglobal.com/argus`, and `apps/argus/.env.dev.ci` points them at `https://dev-os.targonglobal.com/argus`. A local unauthenticated request can therefore be sent to portal login with a non-local callback target.
- Argus dev origin is not single-sourced. `apps/argus/package.json`, `dev.local.apps.json`, and `apps/sso/lib/apps.ts` expect `3216`, but `apps/argus/.env.local` and `apps/argus/.env.dev.ci` set `PORT=3016`. The cross-app smoke spec already recorded this mismatch in `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`.
- Argus middleware’s dev bypass is broader than shared auth’s bypass rules. `apps/argus/middleware.ts` skips auth whenever `NODE_ENV !== 'production'` and either bypass flag is set. `packages/auth/src/index.ts` only enables bypass when those flags are set and the request/env context is localhost. Argus can therefore bypass auth in non-production remote hosts that shared auth itself would not trust.
- `/api/alerts/preview` is publicly reachable and attempts to load real monitoring data before falling back to a sample. The public allowlist is in `apps/argus/middleware.ts`; the handler in `apps/argus/app/api/alerts/preview/route.ts` calls `getMonitoringChanges()` first. That is an auth boundary leak if real monitoring content exists.
- `/no-access` sends users to `NEXT_PUBLIC_PORTAL_AUTH_URL` directly from `apps/argus/app/no-access/page.tsx`. In local and CI env files that value is not request-derived, so deny flows can leave the current runtime origin and jump to production or `dev-os`.

## Likely Root Causes
- Argus boundary policy is duplicated in two places, `apps/sso/lib/apps.ts` and `apps/argus/middleware.ts`, and both currently encode `public`.
- App origin, portal origin, and callback origin are driven by checked-in env values plus local fallbacks in `apps/argus/next.config.js` and `packages/auth/src/index.ts`, not by one canonical runtime source.
- Dev port mapping is duplicated across `apps/argus/package.json`, `dev.local.apps.json`, `apps/sso/lib/apps.ts`, and Argus env files.
- Argus middleware re-implements bypass policy instead of delegating to the localhost-aware logic in `packages/auth/src/index.ts`.
- Public API exceptions are maintained as string allowlists in `apps/argus/middleware.ts`; drift is already visible because `/api/health` is allowlisted but `apps/argus/app/api/health/route.ts` is missing.

## Recommended Fixes
- Decide the Argus boundary explicitly. If Argus should be role-gated, change both `apps/sso/lib/apps.ts` and `apps/argus/middleware.ts` away from `public`. If it should remain authenticated-public, remove the misleading deny-path expectation and update `plans/2026-04-11-argus-test-plan.md`.
- Build post-login callback URLs from the current request origin and base path, not from `NEXT_PUBLIC_APP_URL`/`NEXTAUTH_URL`. Keep forwarded-host/proto support if reverse proxies are expected.
- Single-source the Argus dev origin. Align `apps/argus/package.json`, `apps/argus/.env.local`, `apps/argus/.env.dev.ci`, `dev.local.apps.json`, and `apps/sso/lib/apps.ts` to one canonical Argus dev port and URL.
- Remove the local bypass duplication in `apps/argus/middleware.ts` and rely on the localhost-aware shared logic from `packages/auth/src/index.ts`, or copy that exact guard if middleware must stay standalone.
- Reclassify public APIs. Keep `/api/tracking/fetch` public at middleware only if bearer-token cron access is required. Either gate `/api/alerts/preview` or make it sample-only so unauthenticated callers cannot see real monitoring data.
- Remove the dead `/api/health` allowlist entry or add the route intentionally.
- Make `/no-access` use the same portal URL resolution strategy as login redirects so local and CI deny flows return to the correct portal origin.

## Verification Plan
- Unauthenticated request to local Argus should redirect to portal login with a `callbackUrl` on the same local origin and `/argus` base path.
- Authenticated user without Argus entitlement should either load Argus or land on `/argus/no-access`, depending on the chosen policy; portal tile visibility in `apps/sso/lib/apps.ts` must match that outcome.
- Authenticated entitled user should load `/`, `/wpr`, and `/monitoring`, with `/api/wpr/weeks`, `/api/wpr/weeks/[week]`, `/api/monitoring/overview`, `/api/monitoring/changes`, and `/api/monitoring/health` returning `200`.
- Unauthenticated calls to protected APIs like `apps/argus/app/api/listings/route.ts`, `apps/argus/app/api/tracking/asins/route.ts`, and `apps/argus/app/api/alerts/send/route.ts` should return middleware `401` JSON, not HTML or silent redirects.
- Forbidden-role case should return middleware `403` JSON for APIs and redirect to `/argus/no-access` for pages if Argus becomes role-gated.
- `/api/tracking/fetch` should stay `401` without bearer token and succeed or fail only on non-auth logic with a valid token.
- `/api/alerts/preview` should behave according to the chosen policy: either require auth/token or prove it never surfaces real monitoring data.
- `/no-access` “Back to Portal” should return to the intended local, CI, or prod portal origin, not a hardcoded different environment.

## Cross-App Notes
- The cross-app smoke spec already calls out that CI needs deterministic auth plus stable base URL and port mapping across SSO and child apps in `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`. Argus currently violates the stable-port part.
- Portal-side app launch resolution comes from `apps/sso/lib/apps.ts`, root `dev.local.apps.json`, and optional `PORTAL_APPS_CONFIG`; Argus auth fixes that depend on origin or callback behavior need to stay aligned with that topology.
- Shared session probing, authz fetches, portal URL resolution, and localhost-only bypass live in `packages/auth/src/index.ts`. If Argus needs different semantics, that should be a conscious shared-vs-app-specific decision, not accidental drift.

## Open Questions
- Is Argus supposed to be authenticated-public or truly role-gated? Current runtime says public, but the Argus test plan still assumes an entitled user.
- Which dev port is canonical for Argus: `3016` or `3216`?
- Should `/api/alerts/preview` ever expose real monitoring data to unauthenticated callers, or was it intended to be sample-only?
- Should `/api/health` exist, or should it be removed from the public allowlist? No direct evidence yet.
- Are there any non-production remote Argus environments where bypass flags are intentionally used off-localhost? No direct evidence yet.
- Should `/no-access` send users back to the portal root, to login, or to an app launcher page? Current code only goes to the portal base URL.
