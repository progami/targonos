# 2026-04-11 Kairos Navigation Spec
## Goal
Document the current Kairos navigation contract around `/kairos`: root entry, auth/callback handoff, entitlement gating, shell links, detail links, and no-access recovery. Identify confirmed failures and the minimum fixes/tests needed so Kairos has one reliable canonical entry path.

## Files Reviewed
- Runtime and repo routing context: `app-manifest.json`, `dev.local.apps.json`, `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`, `plans/2026-04-11-kairos-test-plan.md`
- Kairos config and auth surface: `apps/kairos/next.config.ts`, `apps/kairos/middleware.ts`, `apps/kairos/lib/auth.ts`, `apps/kairos/lib/access.ts`, `apps/kairos/lib/base-path.ts`
- App routing surface: `apps/kairos/app/layout.tsx`, `apps/kairos/app/page.tsx`, `apps/kairos/app/no-access/page.tsx`, `apps/kairos/app/(app)/layout.tsx`, `apps/kairos/app/(app)/forecasts/page.tsx`, `apps/kairos/app/(app)/forecasts/[forecastId]/page.tsx`, `apps/kairos/app/(app)/sources/page.tsx`, `apps/kairos/app/(app)/sources/[seriesId]/page.tsx`
- Shell and nav-producing UI: `apps/kairos/components/kairos-shell.tsx`
- Large UI files partially reviewed before finalization: `apps/kairos/app/(app)/models/page.tsx`, `apps/kairos/components/forecasts/forecasts-table.tsx`, `apps/kairos/components/sources/data-sources-panel.tsx`

## Repro Routes
- Standalone local route expected by app map: `http://localhost:3210/kairos`
- Standalone local route observed in smoke: `http://localhost:3010/kairos`
- Canonical app entry target in code: `/kairos/forecasts`
- Main shell routes: `/kairos/sources`, `/kairos/models`, `/kairos/forecasts`
- Detail routes under test plan: `/kairos/sources/[seriesId]`, `/kairos/forecasts/[forecastId]`
- Gate recovery route: `/kairos/no-access`
- Login handoff route built by middleware: `/login?callbackUrl=http://<kairos-origin>/kairos/...`

## Confirmed Issues
- Local root entry is currently blocked before the canonical workspace loads. The cross-app smoke spec records `http://localhost:3010/kairos` redirecting to `/kairos/no-access`, while `app/page.tsx` defines `/forecasts` as the canonical entry route.
- Kairos origin/port mapping is inconsistent. `dev.local.apps.json` maps Kairos to `3210`, while the discovery spec observed Kairos on `3010`. Since middleware constructs login callback URLs from app-origin env, this mismatch can break landing and deep-link return behavior.
- No-access recovery is coupled to auth URL env, not a dedicated portal-home URL. `app/no-access/page.tsx` labels the CTA “Back to Portal” but sends users to `NEXT_PUBLIC_PORTAL_AUTH_URL` or `PORTAL_AUTH_URL`, which may be auth infrastructure rather than the launcher/home surface.

## Likely Root Causes
- Kairos access is role-gated in middleware, and current local/CI smoke lacks a seeded user/session with Kairos `enter` capability.
- Authz is duplicated. `middleware.ts` distinguishes unauthenticated vs forbidden, but `app/(app)/layout.tsx` only checks `hasCapability()` and redirects to `/no-access`. Under any bypass/dev-auth path, unauthenticated users can be flattened into the forbidden route.
- Callback URL correctness depends on `NEXT_PUBLIC_APP_URL`/`BASE_URL`/`NEXTAUTH_URL` matching the real standalone Kairos origin and base path. Repo evidence already shows that topology drift exists.
- Internal navigation relies mostly on raw `'/forecasts'`, `'/sources'`, and `'/models'` strings instead of the explicit `withAppBasePath()` helper. That is probably fine while Next `basePath` is correct, but it makes route correctness depend on framework behavior rather than a single app-owned contract.

## Recommended Fixes
- Make the route contract explicit: entitled user `/kairos` -> `/kairos/forecasts`; unauthenticated user -> portal login with callback back to `/kairos/...`; forbidden user -> `/kairos/no-access`.
- Unify Kairos standalone origin across app map, local runtime, and auth env so callback URLs and deep links are generated against the same host/port.
- Remove the semantic mismatch between middleware and `app/(app)/layout.tsx`, or make the layout mirror middleware’s unauthenticated vs forbidden split.
- Change the no-access recovery CTA to use a real portal launcher/home URL, not the auth base URL by default.
- Standardize internal route building behind one helper or route constants layer, then verify list/detail links against `/kairos/...`.

## Verification Plan
- Entitled user: request `/kairos` and assert final URL is `/kairos/forecasts`.
- Unauthenticated user: request `/kairos`, `/kairos/forecasts`, `/kairos/sources/[seriesId]`, and `/kairos/forecasts/[forecastId]`; assert redirect to portal login preserves a `callbackUrl` that includes `/kairos/...`.
- Forbidden user: request the same routes and assert `/kairos/no-access` with a working recovery CTA.
- Shell nav: desktop and mobile menu clicks for Sources, Models, and Forecasts must stay under `/kairos/...`.
- Deep links: known source and forecast detail routes must render directly and after login round-trip.
- Guard path: `/kairos/kairos/forecasts` should collapse once to `/kairos/forecasts` with no loop.
- Fail on any bare `/forecasts`/`/sources`/`/models` navigation, any `ChunkLoadError`, or any app-origin `4xx/5xx` on first meaningful screen.

## Cross-App Notes
- `app-manifest.json` marks Kairos as an active app, so `/kairos` is not an optional/archived surface.
- The cross-app smoke spec already identified Kairos as “reachable but blocked by no-access,” not as a client crash. The navigation problem is therefore entry/auth topology first.
- The Kairos test plan already names the correct smoke surface: `/`, `/forecasts`, `/sources/[seriesId]`, `/forecasts/[forecastId]`, and `/no-access`.
- The repo-level smoke harness should test the same topology the portal uses. Right now the app-map topology and the observed local process topology do not match.

## Open Questions
- What is the authoritative standalone Kairos dev origin: `3210` from the app map or `3010` from the observed runtime?
- What do `PORTAL_AUTH_URL` and `NEXT_PUBLIC_PORTAL_AUTH_URL` point to in local, CI, and prod: launcher/home, auth root, or something else?
- Should `/no-access` recover to the portal launcher, the auth landing page, or a dedicated access-request flow?
- Do the unread portions of `forecasts-table.tsx` and `data-sources-panel.tsx` generate any detail links or imperative navigations that bypass `/kairos`?
- Is `app/(app)/layout.tsx` intended to be a second security gate, or should middleware be the sole authority for navigation outcomes?
