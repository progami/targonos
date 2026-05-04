# 2026-04-11 SSO Auth Spec
## Goal
Document the evidenced `sso` auth behavior and breakpoints for `/`, `/login`, `/logout`, `/auth/relay`, Google and credentials callbacks, session cookie handling, entitlement resolution, launcher handoff, and localhost-vs-hosted config drift, using `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` and `plans/2026-04-11-sso-test-plan.md` as the smoke baseline.

## Files Reviewed
- Root/spec inputs: `app-manifest.json`, `dev.local.apps.json`, `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`, `plans/2026-04-11-sso-test-plan.md`.
- SSO core and launcher: `apps/sso/lib/auth.ts`, `apps/sso/lib/safe-session.ts`, `apps/sso/lib/apps.ts`, `apps/sso/lib/platform-admin.ts`, `apps/sso/app/page.tsx`, `apps/sso/app/layout.tsx`, `apps/sso/app/PortalClient.tsx`, `apps/sso/package.json`, `apps/sso/next.config.js`.
- SSO auth routes and pages: `apps/sso/app/login/page.tsx`, `apps/sso/app/login/google/route.ts`, `apps/sso/app/login/credentials/route.ts`, `apps/sso/app/logout/page.tsx`, `apps/sso/app/logout/logout-form.tsx`, `apps/sso/app/auth/relay/page.tsx`, `apps/sso/app/auth/relay/RelayClient.tsx`, `apps/sso/app/api/auth/[...nextauth]/route.ts`, `apps/sso/app/api/auth/error/route.ts`, `apps/sso/app/api/auth/reset/route.ts`, `apps/sso/app/api/v1/authz/me/route.ts`.
- SSO env/docs/tests/config maps: `apps/sso/.env.local`, `apps/sso/.env.dev.ci`, `apps/sso/README.md`, `apps/sso/tests/e2e.spec.ts`, `apps/sso/tests/login.spec.ts`, `apps/sso/dev.local.apps.json`, `apps/sso/dev.apps.json`, `apps/sso/prod.apps.json`.
- Shared auth and cross-app handoff evidence: `packages/auth/src/index.ts`, `packages/auth/src/server.ts`, `packages/auth/src/user-service.ts`, `apps/atlas/middleware.ts`, `apps/xplan/middleware.ts`, `apps/talos/src/components/layout/main-nav.tsx`, `scripts/run-dev-with-logs.js`.

## Repro Routes
- `/` on the local smoke origin `http://localhost:3000/`; signed-out rendering is `LoginPage` via `apps/sso/app/page.tsx:8-12`.
- `/login`.
- `/login?callbackUrl=http://localhost:3208/xplan/1-strategies`.
- `/login/google?callbackUrl=http://localhost:3208/xplan/1-strategies`.
- `/login/credentials?callbackUrl=/&emailOrUsername=<user>&password=<pass>`; this is the current dev credentials transport in `apps/sso/app/login/page.tsx:76-119` and `apps/sso/app/login/credentials/route.ts:92-105`.
- `/api/auth/callback/google`.
- `/auth/relay?to=http://localhost:3208/xplan/1-strategies`.
- `/logout`.
- `/api/auth/signout?callbackUrl=http://<app-origin>/<app-base>/auth/login`; Talos uses this directly in `apps/talos/src/components/layout/main-nav.tsx:227-229,348-350`.

## Confirmed Issues
1. Local Google auth origin is drifting and is currently broken. `apps/sso/package.json:6,9` hardcodes `3000`, while `apps/sso/.env.local:11,13,20` and `apps/sso/README.md:42-45` describe `3200`, and the smoke spec observed `http://localhost:3000/` sending Google to `https://os.targonglobal.com/api/auth/callback/google` and landing on `https://os.targonglobal.com/login?error=Configuration` (`plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md:73-77`, `plans/2026-04-11-sso-test-plan.md:77-79`).

2. Dev credential login leaks secrets into the URL. The credential form submits with `method="get"` in `apps/sso/app/login/page.tsx:76-119`, and the route reads `emailOrUsername` and `password` from query params in `apps/sso/app/login/credentials/route.ts:92-105`.

3. Callback preservation is not actually guarded by the current tests, and one recovery path drops it. The desired behavior in `plans/2026-04-11-sso-test-plan.md:31-46` is “land on the requested app path,” but `apps/sso/tests/login.spec.ts:23-31` reloads `/` and asserts portal home instead; separately, `apps/sso/app/api/auth/[...nextauth]/route.ts:54-60` clears cookies and redirects to bare `/login` without restoring `callbackUrl`.

4. Google user provisioning differs by hostname instead of explicit environment policy. `apps/sso/lib/auth.ts:130-131` sets `AUTO_PROVISION_PORTAL_USERS` from the portal hostname; `localhost` uses `getOrCreatePortalUserByEmail()` while `dev-os.*` uses `getUserByEmail()` and blocks missing users (`apps/sso/lib/auth.ts:229-239`, `packages/auth/src/user-service.ts:739-825`).

5. The launcher’s local target map is not aligned with actual local app listeners. `apps/sso/lib/apps.ts:311-348` prefers `PORTAL_APPS_CONFIG` and `dev.local.apps.json`, which map apps to `3208/3210/3212/3214/3216` (`dev.local.apps.json:2-12`, `apps/sso/dev.local.apps.json:2-12`), while the smoke spec observed several of those apps on `3008/3010/3012/3014/3016` (`plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md:50-59`).

6. The checked-in SSO login tests do not match the default local login surface. The credential form only renders when `ALLOW_DEV_AUTH_SESSION_BYPASS` or `ALLOW_DEV_AUTH_DEFAULTS` is true or Google OAuth is absent (`apps/sso/app/login/page.tsx:30-35,71-122`), but `apps/sso/.env.local:5-20` defines Google OAuth and no bypass flags, and there is no source test harness under `apps/sso` that sets those flags.

## Likely Root Causes
- Auth origin and port are duplicated across `apps/sso/package.json`, `apps/sso/.env.local`, `apps/sso/.env.dev.ci`, `apps/sso/README.md`, `dev.local.apps.json`, and `apps/sso/dev.local.apps.json`.
- Environment policy is encoded as hostname heuristics in `apps/sso/lib/auth.ts:130-131` instead of explicit flags for provisioning mode.
- Callback success and callback recovery are split between `apps/sso/lib/auth.ts:312-357` and `apps/sso/app/api/auth/[...nextauth]/route.ts:36-60`; the generic recovery wrapper is callback-unaware.
- The dev credentials bypass was implemented as a convenience flow, not a safe transport, in `apps/sso/app/login/page.tsx:76-119` and `apps/sso/app/login/credentials/route.ts:92-105`.
- Test coverage still encodes the older “land on portal home” behavior instead of the callback-preserving behavior required by `plans/2026-04-11-sso-test-plan.md:31-46`.
- Which runtime env source produced the production `redirect_uri` during the smoke run: No direct evidence yet.

## Recommended Fixes
1. Pick one canonical local SSO origin and make `apps/sso/package.json`, `apps/sso/.env.local`, `apps/sso/README.md`, `dev.local.apps.json`, and the smoke harness agree on it.
2. Convert the dev credentials flow to `POST`; remove passwords from query strings; update `apps/sso/tests/login.spec.ts` accordingly.
3. Preserve `callbackUrl` in the generic auth recovery wrapper in `apps/sso/app/api/auth/[...nextauth]/route.ts`, not just in `/login/google` and `/login/credentials`.
4. Replace `AUTO_PROVISION_PORTAL_USERS = !portalHostname.startsWith('dev-os.')` with an explicit env-controlled policy so localhost, hosted dev, and production are intentionally configured rather than inferred.
5. Make the launcher use one source of truth for local app targets; either derive from actual app port config or make the shared JSON map authoritative and keep app scripts aligned to it.
6. Rewrite SSO smoke coverage so it asserts real outcomes: callback landing, relay behavior, Google auth origin, logout/session clearing, and signed-in launcher health. Remove the current manual `page.goto('/')` masking in `apps/sso/tests/login.spec.ts:17-20,29-31`.

## Verification Plan
- Verify `/` renders `TargonOS Portal` signed out and launcher tiles signed in, per `apps/sso/app/page.tsx:8-12,76-85`.
- Verify `/login?callbackUrl=<absolute-app-url>` preserves the requested target through login and lands on the app path, not portal home, matching `plans/2026-04-11-sso-test-plan.md:31-46`.
- Verify starting Google sign-in from the canonical local origin does not redirect to `https://os.targonglobal.com` or `https://dev-os.targonglobal.com` unless that is the chosen canonical smoke origin.
- Verify `/auth/relay?to=<absolute-app-url>` forwards once and does not bounce, matching `apps/sso/app/auth/relay/page.tsx:28-80`.
- Verify `/logout` and direct `/api/auth/signout?callbackUrl=<app-login>` both clear the session and back navigation does not restore the launcher.
- Verify dev credential login, if kept, never places the password in the URL and still returns a session with entitlements from `apps/sso/lib/auth.ts:251-310`.
- Verify launcher tiles resolve to live local app ports from the same topology the smoke harness uses.

## Cross-App Notes
- Child app middleware depends on absolute callback preservation into the portal login route; see `apps/atlas/middleware.ts:85-97` and `apps/xplan/middleware.ts:122-124`.
- Child app sign-out is not limited to the portal `/logout` page. Talos sends users straight to `portalUrl('/api/auth/signout')` with an absolute callback URL in `apps/talos/src/components/layout/main-nav.tsx:227-229,348-350`.
- Shared cookie behavior comes from `packages/auth/src/index.ts:22-78`; localhost cookies are host-only and non-secure by design, so cleanup and probe logic must continue to handle both secure and non-secure names.
- Shared child-app session/authz probing comes from `packages/auth/src/index.ts:518-675,951-1072` and `apps/sso/app/api/v1/authz/me/route.ts`; SSO regressions propagate directly into app boot and entitlement checks.
- `app-manifest.json:2-14` marks `sso`, `talos`, `atlas`, `xplan`, `kairos`, `plutus`, `hermes`, `argus`, and `website` as active, so portal launcher/auth drift has suite-wide impact.

## Open Questions
- Which runtime env source produced `redirect_uri=https://os.targonglobal.com/api/auth/callback/google` during the localhost smoke run despite `apps/sso/.env.local:11,13,20` pointing at localhost? No direct evidence yet.
- Is the intended canonical local portal origin `http://localhost:3000` or `http://localhost:3200`? Current checked-in sources disagree.
- Should hosted dev auto-provision Google users like localhost, or should localhost stop auto-provisioning and require pre-provisioned portal users? Current code intentionally diverges.
- Is `apps/sso/app/api/auth/reset/route.ts` still part of a supported recovery flow? No direct evidence yet.
- Is any current consumer relying on `/logout?callbackUrl=<absolute-app-url>` rather than direct `/api/auth/signout`? No direct evidence yet outside the direct signout pattern seen in Talos.
