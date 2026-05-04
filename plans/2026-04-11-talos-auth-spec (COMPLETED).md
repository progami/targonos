# 2026-04-11 Talos Auth Spec

## Goal
Document the evidenced Talos auth and tenant-bootstrap failures around portal session dependency, tenant gating, `401/403` behavior, redirects, and cookie/session handling for `/`, `/dashboard`, `/api/tenant/select`, `/api/portal/session`, and `/api/tenant/current`.

## Files Reviewed
- Required context: `app-manifest.json`, `dev.local.apps.json`, `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`, `plans/2026-04-11-talos-test-plan.md`, `apps/talos/src/middleware.ts`, `apps/talos/next.config.js`, `apps/talos/src/app/page.tsx`.
- Talos entry and shell flow: `apps/talos/src/app/layout.tsx`, `apps/talos/src/components/layout/app-shell.tsx`, `apps/talos/src/components/layout/dashboard-layout.tsx`, `apps/talos/src/components/layout/main-nav.tsx`, `apps/talos/src/components/ui/breadcrumb.tsx`, `apps/talos/src/app/dashboard/page.tsx`, `apps/talos/src/app/auth/login/page.tsx`, `apps/talos/src/app/auth/error/page.tsx`, `apps/talos/src/app/no-access/page.tsx`, `apps/talos/src/components/landing-page.tsx`, `apps/talos/src/app/market/orders/page.tsx`, `apps/talos/src/app/market/reorder/page.tsx`.
- Talos tenant/session/auth helpers and APIs: `apps/talos/src/components/tenant/WorldMap.tsx`, `apps/talos/src/components/tenant/TenantIndicator.tsx`, `apps/talos/src/hooks/usePortalSession.ts`, `apps/talos/src/lib/auth.ts`, `apps/talos/src/lib/portal.ts`, `apps/talos/src/lib/fetch-with-csrf.ts`, `apps/talos/src/lib/utils/base-path.ts`, `apps/talos/src/lib/utils/patch-fetch.ts`, `apps/talos/src/lib/tenant/constants.ts`, `apps/talos/src/lib/tenant/server.ts`, `apps/talos/src/lib/tenant/access.ts`, `apps/talos/src/lib/tenant/context.tsx`, `apps/talos/src/lib/tenant/guard.ts`, `apps/talos/src/lib/api/auth-wrapper.ts`, `apps/talos/src/lib/api/responses.ts`, `apps/talos/src/app/api/auth/[...nextauth]/route.ts`, `apps/talos/src/app/api/auth/providers/route.ts`, `apps/talos/src/app/api/auth/session-check/route.ts`, `apps/talos/src/app/api/portal/session/route.ts`, `apps/talos/src/app/api/tenant/current/route.ts`, `apps/talos/src/app/api/tenant/select/route.ts`, `apps/talos/src/types/next-auth.d.ts`, `apps/talos/src/components/providers.tsx`, `apps/talos/src/components/fetch-patch.tsx`.
- Shared auth and portal-side callback logic: `packages/auth/src/index.ts`, `apps/sso/lib/apps.ts`, `apps/sso/lib/auth.ts`, `apps/sso/app/login/page.tsx`, `apps/sso/app/login/credentials/route.ts`, `apps/sso/app/auth/relay/page.tsx`, `apps/sso/README.md`.
- Runtime/config and auth test evidence: `apps/talos/.env.local`, `apps/talos/.env.dev.ci`, `apps/talos/package.json`, `apps/sso/package.json`, `apps/sso/tests/login.spec.ts`, `apps/sso/tests/e2e.spec.ts`.

## Repro Routes
- `/` for Talos is `apps/talos/src/app/page.tsx`, which renders `WorldMap` from `apps/talos/src/components/tenant/WorldMap.tsx`. On mount it calls `GET /api/tenant/current`; if that fails, the catch is swallowed and both regions remain clickable.
- Selecting `US` or `UK` on `/` calls `POST /api/tenant/select` through `fetchWithCSRF()` in `apps/talos/src/components/tenant/WorldMap.tsx`, then only pushes `/dashboard` if the response is `ok`.
- The existing smoke evidence in `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` already recorded `POST /talos/api/tenant/select -> 401`, `GET /talos/api/portal/session -> 401`, and `GET /talos/api/tenant/current -> 401` during the Talos landing flow.
- `/dashboard` uses `usePortalSession()` from `apps/talos/src/hooks/usePortalSession.ts` and is also wrapped by the shared shell from `apps/talos/src/components/layout/app-shell.tsx`.
- `/api/portal/session` in `apps/talos/src/app/api/portal/session/route.ts` returns `401` when `auth()` is null.
- `/api/tenant/current` in `apps/talos/src/app/api/tenant/current/route.ts` returns `401` without a session; with a session it derives tenant availability by scanning tenant DBs, not portal app authz.
- `/api/tenant/select` in `apps/talos/src/app/api/tenant/select/route.ts` returns `401` without a session and `403` when `ensureActiveUserInTenant()` returns false. No direct evidence yet of a live `403` repro.

## Confirmed Issues
- Public tenant bootstrap is not auth-safe. `apps/talos/src/components/tenant/WorldMap.tsx` explicitly treats failed `/api/tenant/current` loads as “show all regions and let select fail later,” and the smoke spec in `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` confirms the resulting raw `401` failures on `/api/tenant/current`, `/api/tenant/select`, and `/api/portal/session`.
- Talos app entitlement is not enforced on `/api/tenant/current` or `/api/tenant/select`. `apps/talos/src/middleware.ts` exempts `/api/tenant/` from `requireAppEntry()`, and both handlers in `apps/talos/src/app/api/tenant/current/route.ts` and `apps/talos/src/app/api/tenant/select/route.ts` only check `auth()`, not Talos app access.
- Tenant selection also provisions tenant users. `apps/talos/src/app/api/tenant/select/route.ts` calls `ensureActiveUserInTenant()`, which can create a new tenant `user` row with default `staff` role; selecting a region is therefore a write-side bootstrap step, not a pure selector.
- `/api/portal/session` is tenant-coupled before tenant selection. `apps/talos/src/app/api/portal/session/route.ts` returns `auth()`, and `apps/talos/src/lib/auth.ts` says it should skip tenant enrichment when no tenant is selected, but `apps/talos/src/lib/tenant/server.ts` always falls back to `DEFAULT_TENANT` (`US`), so that skip path never actually happens.
- `/api/tenant/current` can fabricate a current tenant for users with zero tenant memberships. In `apps/talos/src/app/api/tenant/current/route.ts`, `accessibleCodes.length === 0` still resolves `current` to the cookie tenant or `DEFAULT_TENANT`, and can set the `talos-tenant` cookie while `available` stays empty.
- `/dashboard` does not actually redirect on client-side unauthenticated state. The redirect effect is commented out in `apps/talos/src/app/dashboard/page.tsx`, so the page shows a static “Redirecting to login...” state instead of navigating.

## Likely Root Causes
- Base-path handling is inconsistent across the shell. `apps/talos/src/components/layout/app-shell.tsx` disables the shell only for raw `'/'`, while `apps/talos/src/components/ui/breadcrumb.tsx` strips the base path with `withoutBasePath()`. That mismatch is the strongest reviewed code explanation for why the smoke pass saw `/api/portal/session` during the public landing flow and then hit React error `#418`. No direct evidence yet of the exact runtime pathname values.
- Talos is mixing two auth models: portal app access in `apps/talos/src/middleware.ts` and `packages/auth/src/index.ts`, and tenant access via tenant DB membership/provisioning in `apps/talos/src/app/api/tenant/current/route.ts`, `apps/talos/src/app/api/tenant/select/route.ts`, and `apps/talos/src/lib/tenant/access.ts`.
- Local dev origin sources disagree. `apps/talos/package.json` and `apps/sso/package.json` start on `3001`/`3000`, while `dev.local.apps.json`, `apps/talos/.env.local`, and the documented portal-side flow expect `3201`/`3200`. `resolvePortalAuthOrigin()` in `packages/auth/src/index.ts` prefers env origins over request origin, so redirects and portal probes can target the wrong local host/port.
- Existing auth tests do not cover the real Talos handoff. `apps/sso/tests/login.spec.ts` sets a `callbackUrl` but then manually goes back to portal home and only asserts `TargonOS Portal`; it does not prove a Talos callback, tenant selection, or dashboard boot.

## Recommended Fixes
- Normalize `usePathname()` with `withoutBasePath()` in `apps/talos/src/components/layout/app-shell.tsx` so the Talos root route stays outside the authenticated shell in base-path mode.
- Stop swallowing auth failure on `/`. In `apps/talos/src/components/tenant/WorldMap.tsx`, treat `401` from `/api/tenant/current` and `/api/tenant/select` as a portal login handoff, not as “leave all regions clickable.”
- Apply Talos app-entry checks to `/api/tenant/current` and `/api/tenant/select`, either by removing `/api/tenant/` from the public middleware prefix in `apps/talos/src/middleware.ts` or by calling `requireAppEntry()` inside those handlers.
- Split tenant provisioning from tenant selection. `apps/talos/src/app/api/tenant/select/route.ts` should not create tenant users as a side effect of selecting a region.
- Make `auth()` enrichment truly tenant-aware. In `apps/talos/src/lib/auth.ts`, do not default to `US` when `/api/portal/session` is queried before a tenant has been chosen.
- Change `/api/tenant/current` to return an explicit denial state when `accessibleCodes` is empty instead of manufacturing `current=DEFAULT_TENANT`.
- Restore a real redirect from `/dashboard` when the client session becomes unauthenticated, or remove the dead “Redirecting to login...” branch if middleware is the only supported gate.
- Unify local Talos/portal ports so package scripts, `dev.local.apps.json`, and auth env vars all describe the same topology.

## Verification Plan
- Unauthenticated `/talos` or `/` should render the tenant entry route without `MainNav`, without `GET /api/portal/session`, and with an explicit portal-login handoff before region selection requires auth.
- Authenticated user with Talos app entitlement and no tenant cookie should get `200` from `/api/tenant/current`, a non-empty `available` list, a `talos-tenant` cookie after `POST /api/tenant/select`, and a clean transition into `/dashboard`.
- Authenticated user without Talos app entitlement should get consistent denial on `/dashboard`, `/api/portal/session`, `/api/tenant/current`, and `/api/tenant/select`, with no tenant DB writes.
- Authenticated user with zero tenant memberships should not receive a fabricated `current` tenant from `/api/tenant/current`.
- Direct unauthenticated `/dashboard` should redirect to the actual portal login origin and return to the actual Talos origin configured for that environment.
- Browser smoke should assert no `401/403` during tenant bootstrap, no React hydration/runtime error, and no wrong-origin redirect in the Talos launch path described in `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`.

## Cross-App Notes
- `apps/sso/lib/apps.ts` resolves Talos from `dev.local.apps.json`, which maps Talos to `3201`, but `apps/talos/package.json` still starts Talos on `3001`; the smoke spec in `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` already observed the repo running on `3001`/`3000` instead of the `3201`/`3200` expected by `apps/talos/.env.local`.
- Portal-side callback support exists in `apps/sso/lib/auth.ts`, `apps/sso/app/login/credentials/route.ts`, and `apps/sso/app/auth/relay/page.tsx`, but the reviewed auth test in `apps/sso/tests/login.spec.ts` does not verify the Talos callback path.
- No direct evidence yet of Talos auth-specific automated tests under `apps/talos/tests/`; the reviewed Talos test inventory did not include auth or tenant-bootstrap coverage.

## Open Questions
- Does `usePathname()` resolve to `/talos` or `/` inside `apps/talos/src/components/layout/app-shell.tsx` under the current Next 16 base-path setup? No direct evidence yet.
- Should tenant entitlement come from portal authz, tenant DB membership, or explicit provisioning, and which source is supposed to win when they disagree?
- Is the auto-provision-on-select behavior in `apps/talos/src/app/api/tenant/select/route.ts` intentional product policy or accidental bootstrap leakage?
- Should `/api/tenant/current` return `403` or a dedicated no-access payload when `accessibleCodes` is empty instead of defaulting to `US`?
- Is the supported local auth topology `3000`/`3001` or `3200`/`3201`? The reviewed repo sources disagree.
