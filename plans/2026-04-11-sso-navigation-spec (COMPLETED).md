# 2026-04-11 SSO Navigation Spec
## Goal
Document the `sso` navigation behavior that is actually implemented today, with emphasis on launcher href resolution, local-vs-hosted app topology, callback/relay transitions, login/logout routing, and dead or looping routes. This spec is discovery only and is grounded in code plus `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` and `plans/2026-04-11-sso-test-plan.md`.

## Files Reviewed
- Inputs and existing specs: `app-manifest.json`, `dev.local.apps.json`, `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`, `plans/2026-04-11-sso-test-plan.md`, `plans/2026-04-11-sso-auth-spec (COMPLETED).md`, `plans/2026-04-11-plutus-auth-spec (COMPLETED).md`.
- SSO config and launcher mapping: `apps/sso/.env.local`, `apps/sso/package.json`, `apps/sso/next.config.js`, `apps/sso/lib/apps.ts`, `apps/sso/lib/auth.ts`, `apps/sso/lib/safe-session.ts`, `apps/sso/dev.local.apps.json`, `apps/sso/dev.apps.json`, `apps/sso/prod.apps.json`, `apps/sso/worktree.apps.json`.
- SSO routes and UI: `apps/sso/app/page.tsx`, `apps/sso/app/PortalClient.tsx`, `apps/sso/app/login/page.tsx`, `apps/sso/app/login/google/route.ts`, `apps/sso/app/login/credentials/route.ts`, `apps/sso/app/auth/relay/page.tsx`, `apps/sso/app/auth/relay/RelayClient.tsx`, `apps/sso/app/logout/page.tsx`, `apps/sso/app/logout/logout-form.tsx`, `apps/sso/app/xplan/page.tsx`, `apps/sso/app/api/auth/[...nextauth]/route.ts`, `apps/sso/app/api/auth/reset/route.ts`, `apps/sso/app/api/auth/error/route.ts`.
- SSO tests: `apps/sso/tests/e2e.spec.ts`, `apps/sso/tests/login.spec.ts`.
- Shared auth and child-app handoff code: `packages/auth/src/index.ts`, `apps/atlas/middleware.ts`, `apps/atlas/lib/portal.ts`, `apps/atlas/lib/request-origin.ts`, `apps/atlas/tests/e2e/smoke.spec.ts`, `apps/atlas/tests/fixtures/auth.ts`, `apps/xplan/middleware.ts`, `apps/xplan/.env.local`, `apps/xplan/package.json`, `apps/xplan/next.config.ts`, `apps/kairos/middleware.ts`, `apps/kairos/.env.local`, `apps/kairos/package.json`, `apps/kairos/next.config.ts`, `apps/plutus/middleware.ts`, `apps/plutus/.env.local`, `apps/plutus/package.json`, `apps/plutus/next.config.ts`, `apps/hermes/src/middleware.ts`, `apps/hermes/.env.local`, `apps/hermes/package.json`, `apps/hermes/next.config.mjs`, `apps/argus/middleware.ts`, `apps/argus/.env.local`, `apps/argus/package.json`, `apps/argus/next.config.js`, `apps/talos/src/middleware.ts`, `apps/talos/src/lib/portal.ts`, `apps/talos/.env.local`, `apps/talos/package.json`, `apps/talos/next.config.js`.
- Repo helpers relevant to topology drift: `scripts/run-dev-with-logs.js`, `scripts/verify-dev-env.sh`.

## Repro Routes
- `/` on the SSO dev server. `apps/sso/app/page.tsx` renders `LoginPage` when signed out and `PortalClient` when signed in.
- `/login` and `/login?callbackUrl=<absolute-app-url>`. `apps/sso/app/login/page.tsx` preserves the requested callback in hidden inputs.
- `/login/google?callbackUrl=http://localhost:3208/xplan/1-strategies`. This exercises the real local login surface from `apps/sso/app/login/google/route.ts`.
- `/auth/relay?to=http://localhost:3208/xplan/1-strategies`. This exercises the same-origin relay in `apps/sso/app/auth/relay/page.tsx`.
- `/xplan` on the SSO server. `apps/sso/app/xplan/page.tsx` is the only dedicated outbound app route inside `apps/sso/app`.
- Launcher clicks from `/` when signed in. Current local hrefs resolve through `apps/sso/lib/apps.ts` and `apps/sso/dev.local.apps.json` to `http://localhost:3201`, `http://localhost:3206/atlas`, `http://localhost:3208`, `http://localhost:3210`, `http://localhost:3212/plutus`, `http://localhost:3214/hermes`, and `http://localhost:3216/argus`.
- Signed-out child-app entry routes to inspect portal handoff and callback construction: `http://localhost:3006/atlas/tasks`, `http://localhost:3008/xplan/1-strategies`, `http://localhost:3010/kairos`, `http://localhost:3012/plutus/settlements`, `http://localhost:3014/hermes/insights`, `http://localhost:3016/argus/wpr`.
- `/logout` and `/api/auth/signout?callbackUrl=http://localhost:3000/login` to compare the custom logout page with the direct sign-out path used by `apps/sso/app/PortalClient.tsx`.

## Confirmed Issues
- Local SSO origin is split between `3000` and `3200`. `apps/sso/package.json` starts `next dev -p 3000`, but `apps/sso/.env.local` sets `NEXTAUTH_URL`, `PORTAL_AUTH_URL`, and `NEXT_PUBLIC_PORTAL_AUTH_URL` to `http://localhost:3200`, and `apps/sso/lib/auth.ts` and `packages/auth/src/index.ts` trust those env values for auth origin and callback generation. `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` already captured a localhost Google flow leaving local SSO and failing on hosted SSO.
- Local signed-out handoffs from most child apps drift to hosted origins instead of the active localhost origin. `apps/atlas/middleware.ts`, `apps/xplan/middleware.ts`, `apps/kairos/middleware.ts`, `apps/plutus/middleware.ts`, `apps/hermes/src/middleware.ts`, and `apps/argus/middleware.ts` build portal login URLs through `packages/auth/src/index.ts`, which prefers `NEXT_PUBLIC_PORTAL_AUTH_URL` and `PORTAL_AUTH_URL`; their `.env.local` files point those vars, plus app origin vars, at `https://os.targonglobal.com`.
- The launcher’s local target map does not match the checked-in local app listeners. `apps/sso/lib/apps.ts` resolves local app URLs from `apps/sso/dev.local.apps.json` and `dev.local.apps.json` as `3201/3206/3208/3210/3212/3214/3216`, while the app configs disagree: `apps/talos/package.json` uses `3001`, `apps/atlas/package.json` uses `3006`, `apps/xplan/package.json` uses `3008`, `apps/kairos/package.json` uses `3010`, `apps/plutus/.env.local` uses `3012`, `apps/hermes/package.json` uses `3014`, and `apps/argus/.env.local` uses `3016`.
- XPlan and Kairos local launcher hrefs lose their required base paths. In `apps/sso/lib/apps.ts`, `xplan` and `kairos` have `devUrl` but no `devPath`, so local resolution becomes bare `http://localhost:3208` and `http://localhost:3210`. Their own configs require base paths through `apps/xplan/.env.local` and `apps/xplan/next.config.ts` (`/xplan`) plus `apps/kairos/.env.local` and `apps/kairos/next.config.ts` (`/kairos`).
- The dedicated SSO route `/xplan` is a dead/self-looping launch route. `apps/sso/app/xplan/page.tsx` redirects to `buildPortalUrl('/xplan')`; on standalone SSO that resolves back to the SSO origin through `packages/auth/src/index.ts`, not to the xPlan app.
- Callback preservation is not fully protected. `apps/sso/app/api/auth/[...nextauth]/route.ts` clears bad cookies and redirects to bare `/login` without preserving `callbackUrl`, and `apps/sso/tests/login.spec.ts` explicitly masks callback behavior by reloading `/` and asserting portal home instead of asserting the requested target. That contradicts `plans/2026-04-11-sso-test-plan.md`.

## Likely Root Causes
- Navigation topology is defined in too many places: `apps/sso/package.json`, `apps/sso/.env.local`, `apps/sso/dev.local.apps.json`, `dev.local.apps.json`, `apps/sso/dev.apps.json`, per-app `.env.local` files, per-app `package.json` files, and `scripts/verify-dev-env.sh` do not agree.
- Shared auth URL helpers in `packages/auth/src/index.ts` are env-first, not loopback-request-first, so stale hosted env values override the actual local browser origin.
- `apps/sso/lib/apps.ts` models some local apps as bare origins even though those apps are pathful Next.js apps with `basePath`.
- `apps/sso/app/xplan/page.tsx` bypasses the launcher resolution path entirely, so it cannot benefit from `resolveAppUrl()`.
- Existing browser tests still encode the old “portal home is good enough” behavior and do not hard-fail on callback/relay drift.

## Recommended Fixes
- Choose one canonical local SSO origin and align `apps/sso/package.json`, `apps/sso/.env.local`, the smoke harness, and Google callback configuration to that single host and port.
- Make one app-map source authoritative for local launcher targets, then align each app’s `package.json` and `.env.local` listener/base-path config to it.
- Add local `devPath` support for at least `xplan` and `kairos` in `apps/sso/lib/apps.ts`, or derive the local entry path from the child app’s configured `basePath`.
- Replace or remove `apps/sso/app/xplan/page.tsx`. If the route remains, it should resolve through the same app-map logic as launcher tiles and target the real xPlan entry route.
- For loopback requests, make child-app login/callback construction prefer the request origin over hosted env values, or update local `.env.local` files so those env values are localhost-safe.
- Preserve `callbackUrl` in the generic auth recovery path in `apps/sso/app/api/auth/[...nextauth]/route.ts` and rewrite the SSO login tests to assert callback landing, relay behavior, and host/path correctness.

## Verification Plan
- Verify `/` and `/login` stay on the same chosen local SSO origin and that Google sign-in does not leave that origin unexpectedly.
- Verify each signed-out child-app route redirects to the local SSO login page with a local `callbackUrl`, not a hosted portal/app URL.
- Verify each signed-in launcher tile opens the actual live local app URL, including required base paths for pathful apps.
- Verify `/auth/relay?to=<absolute-app-url>` performs exactly one relay hop and lands on the requested target.
- Verify `/xplan` no longer redirects to itself. If the route is kept, it must land on xPlan’s real entry path.
- Force the stale-cookie auth recovery path and confirm `callbackUrl` survives it.
- Verify both logout flows: the header sign-out path from `apps/sso/app/PortalClient.tsx` and the explicit `/logout` route, including back-navigation after sign-out.

## Cross-App Notes
- `packages/auth/src/index.ts` is the shared portal-origin and callback builder for Atlas, xPlan, Kairos, Plutus, Hermes, and Argus, so SSO origin drift is suite-wide rather than app-local.
- Talos is the main exception: `apps/talos/.env.local` points portal auth back to `http://localhost:3200`, and `apps/talos/next.config.js` can serve `/talos/*` through rewrite mode. Its primary drift is port mismatch, not hosted-origin mismatch.
- Hosted app-map files `apps/sso/dev.apps.json`, `apps/sso/prod.apps.json`, and `apps/sso/worktree.apps.json` encode pathful launch targets such as `/xplan/1-strategies` and `/kairos/forecasts`; the local numeric override file does not preserve that shape.
- `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` already observed runtime symptoms consistent with this code: localhost Google auth drift, per-app port divergence, and app entry paths that do not line up with the portal’s launch map.

## Open Questions
- Which local SSO origin is intended to be canonical: `http://localhost:3000` or `http://localhost:3200`? No direct evidence yet.
- Should local SSO use `apps/sso/dev.apps.json` or `apps/sso/dev.local.apps.json` as the supported launcher map? `scripts/verify-dev-env.sh` and `apps/sso/.env.local` disagree. No direct evidence yet.
- Is `/logout` still intended as a supported user-facing route? `apps/sso/lib/auth.ts` registers it, but `apps/sso/app/PortalClient.tsx` bypasses it. No direct evidence yet.
- Should `/xplan` exist as a portal route at all, or should xPlan only be launched through resolved app URLs? No direct evidence yet.
- Should Kairos launch at `/kairos` or `/kairos/forecasts`? `apps/sso/lib/apps.ts` and `apps/sso/dev.apps.json`/`apps/sso/prod.apps.json` disagree. No direct evidence yet.
- Which runtime env source produced the hosted Google `redirect_uri` seen in `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` despite the checked-in localhost values in `apps/sso/.env.local`? No direct evidence yet.
