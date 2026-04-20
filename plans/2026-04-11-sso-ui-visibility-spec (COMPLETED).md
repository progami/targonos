# 2026-04-11 SSO UI Visibility Spec

## Goal
Document the SSO portal/login/relay UI visibility issues that are already evidenced by code or the existing smoke/test docs, with focus on what does not visibly render, does not recover, or visibly exits the intended SSO surface.

## Files Reviewed
- [app-manifest.json](/Users/jarraramjad/dev/targonos-main/app-manifest.json:1)
- [plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md:1)
- [plans/2026-04-11-sso-test-plan.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-sso-test-plan.md:1)
- [apps/sso/app/layout.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/layout.tsx:1)
- [apps/sso/app/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/page.tsx:1)
- [apps/sso/app/PortalClient.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/PortalClient.tsx:1)
- [apps/sso/app/portal.module.css](/Users/jarraramjad/dev/targonos-main/apps/sso/app/portal.module.css:1)
- [apps/sso/components/app-icons.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/components/app-icons.tsx:1)
- Requested but not reviewed before the interrupted pass: `apps/sso/app/login/page.tsx`, `apps/sso/app/login/login.css`, `apps/sso/app/auth/relay/page.tsx`, `apps/sso/app/auth/relay/RelayClient.tsx`. No direct evidence yet from those files in this pass.

## Repro Routes
- `/`: signed-out users are sent to the login surface by rendering `<LoginPage />` directly in [apps/sso/app/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/page.tsx:8); signed-in users render the portal shell from [apps/sso/app/PortalClient.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/PortalClient.tsx:36).
- `/`: the smoke pass already proved the signed-out portal surface rendered locally at `http://localhost:3000/` with no console errors before auth handoff, in [plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md:71).
- `Google sign-in from / or /login`: the smoke pass showed this leaves localhost and lands on `https://os.targonglobal.com/login?error=Configuration` instead of visibly returning to local SSO, in [plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md:73) and [plans/2026-04-11-sso-test-plan.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-sso-test-plan.md:77).
- `/login`, `/login?callbackUrl=...`, and `/auth/relay`: no direct code evidence yet from this pass because the login and relay files were not reviewed before the interruption.

## Confirmed Issues
- Local Google sign-in does not visibly recover to the local SSO UI. The smoke run showed `http://localhost:3000/` rendering correctly, but clicking `Sign in with Google` used a production callback and ended on `https://os.targonglobal.com/login?error=Configuration` instead of returning to local SSO, per [plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md:73) and [plans/2026-04-11-sso-test-plan.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-sso-test-plan.md:77).
- The portal’s explicit “No applications assigned” recovery state is wired to the full app catalog, not the user’s assigned-app list. [apps/sso/app/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/page.tsx:55) passes both the full `apps` catalog and `accessApps`, but [apps/sso/app/PortalClient.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/PortalClient.tsx:38) renders the empty state only when `apps.length === 0`, not when the user has zero assigned apps. That makes the intended no-entitlement recovery screen effectively non-renderable for the ordinary “catalog exists, user has no access” case.
- The current no-access portal state is visibly weak even when `error=no_access` is present. [apps/sso/app/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/page.tsx:18) computes a user-facing access error, but [apps/sso/app/PortalClient.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/PortalClient.tsx:127) renders only a top alert plus the normal grid. Because the dedicated empty state is gated incorrectly, there is no stronger recovery UI on that surface.

## Likely Root Causes
- The Google auth callback/domain configuration for local SSO is pointed at production, not the localhost smoke origin, as evidenced by the production `redirect_uri` in [plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md:74).
- Portal visibility logic is split between a full app catalog and an entitlement-derived access list, but the empty/recovery UI is keyed off the wrong collection in [apps/sso/app/PortalClient.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/PortalClient.tsx:38).
- No direct evidence yet for relay-specific layout or CSS causes because the relay files were not reviewed in this pass.

## Recommended Fixes
- Keep Google sign-in on the configured local SSO origin and hard-fail if the callback or error handling leaves localhost during local smoke coverage.
- Change the no-entitlement portal state to key off `accessApps` or the entitlement-derived list, not the full launcher catalog from [apps/sso/app/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/page.tsx:60).
- Give the no-access portal state a deliberate recovery action instead of only a top alert. The current surface in [apps/sso/app/PortalClient.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/PortalClient.tsx:127) communicates the error, but it does not visibly transition the user into a dedicated recovery state.
- Add smoke assertions for signed-out portal, local Google login integrity, zero-entitlement portal state, and relay rendering so these visibility failures stop escaping CI, as already called for in [plans/2026-04-11-sso-test-plan.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-sso-test-plan.md:14).

## Verification Plan
- Verify `/` shows the signed-out login entrypoint when no session exists and the launcher shell when a session exists, matching [apps/sso/app/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/page.tsx:8).
- Verify starting Google sign-in from local SSO does not navigate to `https://os.targonglobal.com/...` and that any auth error stays on a local, user-visible SSO surface.
- Verify a zero-entitlement user gets a dedicated visible empty/recovery state instead of only a disabled launcher grid.
- Verify `?error=no_access&app=<id>` produces a visibly distinct recovery state, not only the alert bar from [apps/sso/app/PortalClient.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/PortalClient.tsx:127).
- Verify `/login?callbackUrl=...` and `/auth/relay` render visible error/recovery states without white-screening or redirect looping. No direct evidence yet from this pass; this remains required follow-up coverage per [plans/2026-04-11-sso-test-plan.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-sso-test-plan.md:31).

## Cross-App Notes
- `sso` is marked active in [app-manifest.json](/Users/jarraramjad/dev/targonos-main/app-manifest.json:2), and the smoke spec treats it as the entrypoint for shared auth and launcher behavior in [plans/2026-04-11-sso-test-plan.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-sso-test-plan.md:3).
- The cross-app smoke spec already identifies SSO auth integrity as the blocker for deterministic shared-auth coverage across the suite in [plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md:77).
- The fixed version badge in [apps/sso/app/layout.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/layout.tsx:43) provides a visible deployment marker on every SSO surface, which is useful for smoke verification but is not itself a render blocker.

## Open Questions
- Does `apps/sso/app/login/page.tsx` or `apps/sso/app/login/login.css` already contain a local error UI for `/login?error=...`, or is the current visible recovery path still just the production configuration error redirect? No direct evidence yet.
- Does `apps/sso/app/auth/relay/page.tsx` or `apps/sso/app/auth/relay/RelayClient.tsx` visibly recover from bad callback targets or relay failures, or can it still white-screen or loop? No direct evidence yet.
- Is the product intent to show all launcher tiles disabled for non-entitled users, or should the portal switch to a dedicated no-access state once `accessApps` is empty? Current code in [apps/sso/app/PortalClient.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/app/PortalClient.tsx:39) suggests both patterns exist, but only one is actually reachable.
- Should every launched app have a dedicated icon instead of falling back to the generic glyph in [apps/sso/components/app-icons.tsx](/Users/jarraramjad/dev/targonos-main/apps/sso/components/app-icons.tsx:223)? No direct evidence yet that this blocks visibility, but it affects launcher clarity if additional apps are present.
