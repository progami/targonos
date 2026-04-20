# 2026-04-11 Plutus Auth Spec
## Goal
Document the Plutus auth and connection-gating behavior that is actually implemented today, isolate confirmed auth defects from plain QBO-disconnected behavior, and define the minimum fixes and verification needed for `/settlements`, `/setup`, `/no-access`, and auth-sensitive APIs.

## Files Reviewed
- Repo/runtime config: `app-manifest.json`, `dev.local.apps.json`, `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`, `plans/2026-04-11-plutus-test-plan.md`, `apps/plutus/.env.local`, `apps/plutus/.env.dev.ci`, `apps/plutus/package.json`, `apps/plutus/next.config.ts`, `apps/plutus/README.md`.
- Plutus entry/auth/UI: `apps/plutus/middleware.ts`, `apps/plutus/app/layout.tsx`, `apps/plutus/app/page.tsx`, `apps/plutus/app/no-access/page.tsx`, `apps/plutus/components/not-connected-screen.tsx`, `apps/plutus/components/qbo-status-indicator.tsx`, `apps/plutus/components/app-header.tsx`.
- Plutus route pages: `apps/plutus/app/settlements/page.tsx`, `apps/plutus/app/setup/page.tsx`, `apps/plutus/app/settings/page.tsx`, `apps/plutus/app/settlements/[region]/page.tsx`, `apps/plutus/app/settlements/journal-entry/[id]/page.tsx`, `apps/plutus/app/settlements/[region]/[settlementId]/page.tsx`.
- Plutus auth/session/QBO helpers: `apps/plutus/lib/portal-session.ts`, `apps/plutus/lib/current-user.ts`, `apps/plutus/lib/qbo/connection-store.ts`, `apps/plutus/lib/qbo/client.ts`, `apps/plutus/lib/qbo/api.ts`, `apps/plutus/lib/qbo/types.ts`, `apps/plutus/lib/plutus/legacy-settlement-routes.ts`.
- Plutus auth-sensitive APIs: `apps/plutus/app/api/qbo/status/route.ts`, `apps/plutus/app/api/qbo/connect/route.ts`, `apps/plutus/app/api/qbo/callback/route.ts`, `apps/plutus/app/api/qbo/disconnect/route.ts`, `apps/plutus/app/api/qbo/accounts/route.ts`, `apps/plutus/app/api/qbo/accounts/create-plutus-qbo-plan/route.ts`, `apps/plutus/app/api/qbo/tax-codes/route.ts`, `apps/plutus/app/api/setup/route.ts`, `apps/plutus/app/api/setup/accounts/route.ts`, `apps/plutus/app/api/setup/brands/route.ts`, `apps/plutus/app/api/setup/skus/route.ts`, `apps/plutus/app/api/setup/settlement-mapping/route.ts`, `apps/plutus/app/api/setup/settlement-mapping/import/us/route.ts`, `apps/plutus/app/api/setup/settlement-mapping/import/uk/route.ts`, `apps/plutus/app/api/plutus/notifications/route.ts`, `apps/plutus/app/api/plutus/settlements/route.ts`, `apps/plutus/app/api/plutus/settlements/[region]/[settlementId]/route.ts`, `apps/plutus/app/api/plutus/settlements/[region]/[settlementId]/process/route.ts`, `apps/plutus/app/api/plutus/settlements/journal-entry/[id]/route.ts`, `apps/plutus/app/api/plutus/settlements/journal-entry/[id]/process/route.ts`, `apps/plutus/app/api/plutus/users/route.ts`.
- Shared auth and portal launch code: `packages/auth/src/index.ts`, `apps/sso/lib/apps.ts`, `apps/sso/lib/auth.ts`, `apps/sso/app/api/v1/authz/me/route.ts`.
- Relevant tests: `apps/sso/tests/e2e.spec.ts`, `apps/sso/tests/login.spec.ts`, `apps/plutus/tests/run.ts`.

## Repro Routes
- Portal launch drift: launch Plutus from the local portal while `apps/sso/.env.local` points `PORTAL_APPS_CONFIG=dev.local.apps.json`; the portal resolves Plutus to `http://localhost:3212/plutus` via `dev.local.apps.json` and `apps/sso/lib/apps.ts`, while Plutus itself is configured for `3012` in `apps/plutus/.env.local` and `apps/plutus/package.json`.
- Login callback drift: hit `/plutus/settlements` locally while unauthenticated; `apps/plutus/middleware.ts` builds the login `callbackUrl` from env-derived origin, and `apps/plutus/.env.local` points that origin at `https://os.targonglobal.com`, not localhost.
- QBO connect drift: hit `/plutus/api/qbo/connect` locally as a platform admin; `apps/plutus/app/api/qbo/connect/route.ts` and `apps/plutus/app/api/qbo/callback/route.ts` use `BASE_URL`/`QBO_REDIRECT_URI` from `apps/plutus/.env.local`, which are production-host values.
- Misclassified denial: hit `/plutus/api/qbo/connect` as an authenticated Plutus user who is not `platform_admin`; the route redirects to `/plutus/no-access`, and `apps/plutus/app/no-access/page.tsx` says the user lacks Plutus access rather than QBO-admin capability.
- Route/API split-brain: under any secret/cookie setup where `packages/auth/src/index.ts` can fetch authz from the portal but local decode fails, `/plutus` entry can succeed while `/plutus/api/qbo/status` reports `canConnect: false`, `/plutus/api/plutus/notifications` returns `401`, and write routes log `system`.

## Confirmed Issues
- Middleware auth and route-level auth are different contracts. `apps/plutus/middleware.ts` uses `requireAppEntry()` from `packages/auth/src/index.ts`, and that path can fall back to the portal authz API (`apps/sso/app/api/v1/authz/me/route.ts`) when local cookie decode fails. `apps/plutus/app/api/qbo/status/route.ts`, `apps/plutus/app/api/qbo/connect/route.ts`, `apps/plutus/app/api/qbo/callback/route.ts`, `apps/plutus/app/api/qbo/disconnect/route.ts`, and `apps/plutus/lib/current-user.ts` do not use that fallback. Result: the app can admit a user that its route handlers cannot fully identify.
- `apps/plutus/lib/portal-session.ts` hard-requires `PORTAL_AUTH_SECRET`, but `apps/plutus/lib/current-user.ts` and `packages/auth/src/index.ts` both support `PORTAL_AUTH_SECRET ?? NEXTAUTH_SECRET`. That makes the QBO-management routes stricter than the rest of the app and creates real divergence if only one shared secret is present.
- Local Plutus launch config is split and inconsistent. `dev.local.apps.json` and `apps/sso/lib/apps.ts` say local Plutus is `3212`; `apps/plutus/.env.local` and `apps/plutus/package.json` say `3012`; the cross-app smoke spec already observed Plutus listening on `3012`.
- Local Plutus auth/QBO URLs drift to portal production. `apps/plutus/.env.local` pins `NEXTAUTH_URL`, `PORTAL_AUTH_URL`, `NEXT_PUBLIC_PORTAL_AUTH_URL`, `BASE_URL`, and `QBO_REDIRECT_URI` to `os.targonglobal.com`; `apps/plutus/middleware.ts` and the QBO connect/callback routes prefer those env values over the actual request origin.
- QBO-admin denial is incorrectly routed through app-entitlement denial. `apps/plutus/app/api/qbo/connect/route.ts` and `apps/plutus/app/api/qbo/callback/route.ts` send non-admins to `/no-access`, but `apps/plutus/app/no-access/page.tsx` says “it does not have Plutus access.” That message is wrong for a valid Plutus user who just lacks `platform_admin`.
- User-attribution on write routes is lossy and inconsistent. `apps/plutus/app/api/setup/accounts/route.ts`, `apps/plutus/app/api/setup/brands/route.ts`, `apps/plutus/app/api/setup/skus/route.ts`, `apps/plutus/app/api/setup/settlement-mapping/route.ts`, both settlement-mapping import routes, `apps/plutus/app/api/qbo/accounts/create-plutus-qbo-plan/route.ts`, and the settlement process/rollback routes all fall back to `user?.id ?? 'system'`. If middleware admits the request but `getCurrentUser()` cannot decode it, the mutation still proceeds with fake audit identity.
- The callback success/error signal is currently dropped at the app root. `apps/plutus/app/api/qbo/callback/route.ts` redirects to `${basePath}?connected=true` or `${basePath}?error=...`, but `apps/plutus/app/page.tsx` immediately redirects to `/settlements` without preserving the query string, so `apps/plutus/components/qbo-status-indicator.tsx` cannot reliably surface callback outcomes.
- Current auth tests would not catch callback-preservation regressions. `apps/sso/tests/login.spec.ts` explicitly expects login with a `callbackUrl` to land on the portal home instead of asserting that the callback is honored. Plutus itself has no auth/QBO gate tests; `apps/plutus/tests/run.ts` only covers legacy settlement route rewrites.

## Likely Root Causes
- Shared auth was centralized for entry gating in `packages/auth/src/index.ts`, but Plutus kept separate local session-decode helpers for user identity and QBO capability checks.
- Child-app URL generation is env-first instead of request-first. That is survivable in production, but it is brittle in local runs where `.env.local` points at a different host than the active browser request.
- Local portal launch topology is configured in more than one place: `dev.local.apps.json`, `apps/sso/lib/apps.ts`, per-app `.env.local`, and app runtime scripts.
- The codebase mixes three different concepts under “auth”: app entitlement, platform-admin capability, and QBO connection state. `/no-access`, `canConnect`, and Not Connected UI do not consistently separate them.
- Browser-level tests are not asserting the auth handoff that the code actually depends on. The existing cross-app smoke spec already calls this out, and the current SSO login test still normalizes callback behavior away.

## Recommended Fixes
- Replace Plutus-local session parsing with one shared request-auth helper in `@targon/auth` that returns both resolved authz and resolved user identity. `middleware`, `getCurrentUser()`, `qbo/status`, `qbo/connect`, `qbo/callback`, `qbo/disconnect`, and `notifications` should all consume the same result.
- Make the Plutus session wrapper accept the same secret contract as the rest of the stack. If `NEXTAUTH_SECRET` is a valid shared secret elsewhere, `apps/plutus/lib/portal-session.ts` should not reject it.
- Unify local Plutus origin/port in one source of truth. `dev.local.apps.json`, `apps/sso/lib/apps.ts`, `apps/plutus/.env.local`, and the Plutus dev/start scripts need one agreed local URL.
- Stop generating local login and QBO callback URLs from production-host env values. For localhost requests, prefer the current request origin; for non-local environments, keep the explicit env-based origin.
- Split “no Plutus entitlement” from “cannot manage the shared QBO connection.” A dedicated QBO-permission 403 page or message is cleaner than reusing `/no-access`.
- Fail write routes when a human-triggered request has already passed middleware auth but `getCurrentUser()` is still null. Do not silently attribute user-driven config/process changes to `system`.
- Redirect QBO callback success/error to a route that preserves query params, or preserve them through the root redirect.
- Update auth smoke coverage so callback behavior is a hard assertion, not a skipped or normalized path.

## Verification Plan
- Verify portal launch uses one local Plutus URL by opening Plutus from the local portal and checking that the resolved app URL matches the actual Plutus listener.
- Verify unauthenticated `/plutus/settlements` sends the browser to the local portal login and preserves a local `callbackUrl`.
- Verify `/plutus/setup` is reachable for an entitled user with QBO disconnected, while `/plutus/settlements` renders the Not Connected gate from `apps/plutus/components/not-connected-screen.tsx`.
- Verify an entitled non-admin user never reaches `/plutus/no-access` just by attempting QBO connect/disconnect; they should get a QBO-capability denial, not an app-entitlement denial.
- Verify a platform admin can start QBO connect locally and that the callback returns to a Plutus route with visible success/error feedback.
- Force a secret-mismatch scenario in local dev and confirm that middleware, `qbo/status`, `notifications`, and audit-log identity all stay consistent instead of splitting.
- Add smoke coverage for the exact routes in `plans/2026-04-11-plutus-test-plan.md`: disconnected `/setup`, disconnected `/settlements`, connected `/settlements`, legacy journal-entry redirect, and at least one auth-sensitive API assertion.

## Cross-App Notes
- `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` already proved the local shared-auth topology is drifting away from browser reality. Plutus uses the same env-first pattern that caused SSO callback drift there.
- `plans/2026-04-11-plutus-test-plan.md` already sets the right boundary for Plutus: connected users should see the app; disconnected users should see the explicit QBO gate. That boundary is valid and should stay.
- `apps/sso/lib/apps.ts` plus `dev.local.apps.json` are part of Plutus auth behavior in practice, because that is how local portal launches construct the entry URL.
- `apps/sso/tests/login.spec.ts` is currently enforcing the wrong callback expectation for the portal. Until that changes, shared-auth regressions can still look “green.”
- `apps/plutus/tests/run.ts` gives coverage for legacy settlement path remapping, which matters because `apps/plutus/middleware.ts` rewrites those paths before/after auth gating, but it does not cover auth or connection gating.

## Open Questions
- Which local Plutus URL is the intended truth: `3012` from `apps/plutus/.env.local` / `apps/plutus/package.json`, or `3212` from `dev.local.apps.json` / `apps/sso/lib/apps.ts`?
- Should QBO connection management remain `platform_admin`-only, or should it be its own capability separate from global platform admin? No direct evidence yet.
- Should a user who passes middleware auth but fails local cookie decode be blocked entirely, or should user identity be fetched from the portal the same way authz already is?
- Is `/setup` intentionally designed to remain partially usable while QBO is disconnected? Current code says yes in `apps/plutus/app/setup/page.tsx`.
- Should `/plutus/no-access` ever be used for QBO-admin denial, or only for missing Plutus entitlement? Current code mixes both.
