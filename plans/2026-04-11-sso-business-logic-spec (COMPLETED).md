# 2026-04-11 SSO Business Logic Spec

## Goal
Document the SSO app’s business-logic defects around launcher behavior, callback/app handoff, and app-resolution rules so the portal fails on incorrect routing and entitlement behavior instead of quietly sending users to the wrong place.

## Files Reviewed
- `app-manifest.json`
- `dev.local.apps.json`
- `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`
- `plans/2026-04-11-sso-test-plan.md`
- `apps/sso/README.md`
- `apps/sso/lib/apps.ts`
- `apps/sso/lib/auth.ts`
- `apps/sso/app/page.tsx`
- `apps/sso/app/PortalClient.tsx`
- `apps/sso/app/login/page.tsx`
- `apps/sso/app/login/google/route.ts`
- `apps/sso/app/login/credentials/route.ts`
- `apps/sso/app/auth/relay/page.tsx`
- `apps/sso/app/xplan/page.tsx`
- `apps/sso/app/logout/logout-form.tsx`
- `apps/sso/tests/login.spec.ts`
- `apps/sso/tests/e2e.spec.ts`
- `packages/auth/src/index.ts`

## Repro Routes
- `/`: portal landing and launcher in `apps/sso/app/page.tsx`.
- `/login?callbackUrl=<target>`: callback-preserving login flow from `apps/sso/app/login/page.tsx`.
- `/login/google` and `/login/credentials`: auth entry routes in `apps/sso/app/login/google/route.ts` and `apps/sso/app/login/credentials/route.ts`.
- `/auth/relay?to=<target>`: relay handoff page in `apps/sso/app/auth/relay/page.tsx`.
- `/xplan`: dedicated app relay route in `apps/sso/app/xplan/page.tsx`.
- Launcher tile clicks from `apps/sso/app/PortalClient.tsx`.

## Confirmed Issues
- `/xplan` is wired as a redirect loop instead of an app relay. `apps/sso/app/xplan/page.tsx` calls `buildPortalUrl('/xplan')`, and `packages/auth/src/index.ts` shows `buildPortalUrl()` resolves against the portal auth origin. That means `/xplan` redirects straight back to the same portal-origin `/xplan` path instead of the xPlan app entrypoint.
- The launcher URL resolver silently falls back to production/app-origin URLs when local app mapping is missing. In `apps/sso/lib/apps.ts`, `resolveAppUrl()` tries env overrides, then `dev.local.apps.json`, then `app.devUrl`, and finally falls back to `app.url`. `apps/sso/README.md` explicitly documents that final production fallback. This means a misconfigured local launcher does not fail fast; it can quietly send the user to production or another non-local host.
- The portal renders visible role-gated cards with no launch URL. `apps/sso/app/page.tsx` passes the full active app catalog into `PortalClient`, not just the user’s assigned apps. In `apps/sso/app/PortalClient.tsx`, inaccessible cards render with `href={undefined}` and `aria-disabled`, but they are still visible as app tiles in the main catalog. That conflicts with the test plan’s launcher-tile health expectation that every visible app tile has a valid destination.
- Current automated login coverage encodes the wrong post-login behavior for callback flows. `apps/sso/tests/login.spec.ts` explicitly expects `portal login with callback still lands on portal home (tile page)`, while `plans/2026-04-11-sso-test-plan.md` requires callback preservation through login and return to the requested app path. The spec and the implemented test gate are directly contradictory.

## Likely Root Causes
- Portal-origin helpers are being used for app-origin relay routes. `apps/sso/app/xplan/page.tsx` uses `buildPortalUrl()` even though that helper intentionally points back at the portal auth origin.
- The launcher resolution path is designed around fallback tolerance instead of hard failure. `apps/sso/lib/apps.ts` and `apps/sso/README.md` both normalize missing local config into a production fallback instead of surfacing misconfiguration.
- Portal home mixes two distinct concepts: the visible product catalog and the user’s actual launchable set. `apps/sso/app/page.tsx` computes both `apps` and `assignedApps`, but the main tile grid is built from `apps`, not from the launchable list.
- The existing Playwright tests were written to stabilize portal-home rendering, not to protect the callback-preservation contract the current test plan requires.

## Recommended Fixes
- Replace the `/xplan` relay implementation with a real app target, using the same resolved app URL logic as the launcher instead of `buildPortalUrl('/xplan')`.
- Remove the production fallback from local app resolution. If the local launcher cannot resolve a dev target from env or `dev.local.apps.json`, it should fail loudly instead of escaping to production.
- Make the visible launcher catalog reflect launchable state. Either hide inaccessible role-gated apps from the main tile grid or render them in a separate non-launch surface that is not treated as a clickable app tile.
- Align automated coverage with the actual portal contract: callback login should prove redirect preservation, and any test that normalizes back to portal home should be removed or re-scoped to a different behavior.

## Verification Plan
- Visit `/xplan` and confirm it forwards once to the actual xPlan entry route instead of redirecting back to portal-origin `/xplan`.
- Start the portal with one app mapping intentionally missing and confirm the launcher hard-fails configuration instead of routing to a production URL.
- Verify the main launcher surface contains only launchable tiles, or explicitly distinguish non-launchable cards so tile-health tests do not treat them as valid destinations.
- Run callback-preservation tests for both credentials and Google sign-in flows and confirm the user lands on the requested app path after login.
- Verify `/auth/relay` still accepts only safe same-origin/local-dev or cookie-domain targets after the routing fixes.

## Open Questions
- Should inaccessible apps be hidden completely, or should the portal keep a visible “catalog” section separate from launchable apps?
- Is `/xplan` intended to remain a human-friendly short route, or can it be removed entirely in favor of launcher-driven deep links?
- Should local launcher resolution depend only on `dev.local.apps.json`, or is there still a valid use case for per-app `devUrl` hardcoding?
