# 2026-04-11 Talos UI Visibility Spec
## Goal
Document the Talos landing, dashboard, and navigation surfaces that are not reliably visible or renderable today, using only the requested code surface plus directly referenced UI-critical dependencies and the existing smoke/test plans.

## Files Reviewed
- `app-manifest.json`
- `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`
- `plans/2026-04-11-talos-test-plan.md`
- `apps/talos/src/app/layout.tsx`
- `apps/talos/src/app/globals.css`
- `apps/talos/src/app/page.tsx`
- `apps/talos/src/app/dashboard/page.tsx`
- `apps/talos/src/components/layout/app-shell.tsx`
- `apps/talos/src/components/layout/dashboard-layout.tsx`
- `apps/talos/src/components/layout/main-nav.tsx`
- `apps/talos/src/components/tenant/WorldMap.tsx`
- `apps/talos/src/components/tenant/TenantIndicator.tsx`
- `apps/talos/src/components/ui/page-header.tsx`
- `apps/talos/src/components/ui/quick-start-guide.tsx`
- `apps/talos/src/components/error-boundary.tsx`
- Directly referenced UI-critical dependencies: `apps/talos/src/lib/navigation/main-nav.ts`, `apps/talos/src/lib/utils/base-path.ts`, `apps/talos/src/hooks/usePortalSession.ts`, `apps/talos/.env.local`, `apps/talos/package.json`

## Repro Routes
- `/talos` on the local dev server. `apps/talos/src/app/page.tsx` renders `WorldMap`.
- Select `US` or `UK` on `/talos`. `apps/talos/src/components/tenant/WorldMap.tsx` posts to `/api/tenant/select` and then attempts `router.push('/dashboard')`.
- `/talos/dashboard` as the intended post-selection dashboard surface from `apps/talos/src/app/dashboard/page.tsx`.
- Any dashboard surface where the quick-start component is rendered, because `apps/talos/src/components/ui/quick-start-guide.tsx` links to `/config/*`, `/operations/*`, `/reports`, and `/docs/quick-start`.

## Confirmed Issues
- Tenant selection does not reliably make the dashboard visible. `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` recorded `401` responses from `/talos/api/tenant/select`, `/talos/api/portal/session`, and `/talos/api/tenant/current`, followed by `Uncaught Error: Minified React error #418`, after choosing `US` from the landing screen. In `apps/talos/src/components/tenant/WorldMap.tsx`, the dashboard transition only happens after a successful tenant-selection request.
- The dashboard shell can reserve sidebar space while showing no sidebar at all. `apps/talos/src/components/layout/main-nav.tsx` returns `null` when `useSession()` has no session, but `apps/talos/src/components/layout/dashboard-layout.tsx` always applies `md:pl-16 lg:pl-64`, so content can render shifted right with no visible navigation.
- The dashboard unauthenticated state is a visible dead-end placeholder. In `apps/talos/src/app/dashboard/page.tsx`, the unauthenticated branch renders `"Redirecting to login..."`, but the direct client redirect is commented out. The only explicit redirect in the read surface is tied to later stats-fetch error handling.
- Entry and dashboard surfaces are not visibly protected by the local error boundary. `apps/talos/src/components/error-boundary.tsx` exists, but there is no direct usage in `apps/talos/src/app/layout.tsx`, `apps/talos/src/app/page.tsx`, `apps/talos/src/app/dashboard/page.tsx`, `apps/talos/src/components/layout/app-shell.tsx`, or `apps/talos/src/components/layout/dashboard-layout.tsx`. That matches the smoke-captured runtime crash being user-visible.
- The quick-start surface is base-path-unsafe. `apps/talos/src/components/ui/quick-start-guide.tsx` uses raw root-relative anchors such as `/config/warehouses` and `/operations/inventory`, while `apps/talos/src/lib/utils/base-path.ts` exists specifically to keep Talos working when mounted under `/talos`. Those links can drop the Talos mount path when rendered under `/talos/*`.

## Likely Root Causes
- Talos visibility depends on a successful client-side auth and tenant bootstrap sequence. When `/api/portal/session` or `/api/tenant/current` returns `401`, the app is left between the landing screen and the dashboard instead of recovering to a stable visible state.
- Shell visibility is tied to the client session hook in `apps/talos/src/hooks/usePortalSession.ts`, not just route-level access control. That allows the dashboard layout to mount before navigation is actually renderable.
- Base-path handling is implemented for fetches through `withBasePath()` in `apps/talos/src/lib/utils/base-path.ts`, but not uniformly across user-facing controls such as the quick-start anchors.
- Local topology is inconsistent. `apps/talos/package.json` serves Talos on port `3001`, while `apps/talos/.env.local` advertises `http://localhost:3201`, and the smoke spec already observed Talos on `3001`.

## Recommended Fixes
- Make tenant bootstrap failures recover to a visible auth or access state instead of leaving the user on the landing map with request failures and a React crash.
- Keep the dashboard shell internally consistent: either render a visible nav placeholder while session state resolves, or remove sidebar padding when `MainNav` returns `null`.
- Replace the dashboard unauthenticated placeholder with a deterministic redirect or explicit no-access screen in `apps/talos/src/app/dashboard/page.tsx`.
- Mount an error boundary around the landing and dashboard entry surfaces so runtime failures degrade to a visible fallback instead of a broken screen.
- Replace raw quick-start anchors in `apps/talos/src/components/ui/quick-start-guide.tsx` with base-path-safe navigation.
- Align Talos local runtime and env topology so the visible app, session endpoints, and portal callbacks agree on the same origin and port.

## Verification Plan
- Open `/talos`, select `US` and `UK`, and confirm the app reaches a visible dashboard without `401` tenant/session calls or React error `#418`.
- Load `/talos/dashboard` without a valid session and confirm the screen recovers immediately to login or an access screen, not a persistent `"Redirecting to login..."` placeholder.
- Force a no-session state and confirm the dashboard does not show an empty left gutter where the sidebar should be.
- Render the quick-start surface and confirm every control keeps navigation under `/talos/*`.
- Force a runtime failure in the landing or dashboard surface and confirm the user sees an error fallback rather than a crashed UI.
- Check desktop and mobile navigation visibility, since `apps/talos/src/components/layout/main-nav.tsx` has separate desktop and mobile render paths.

## Cross-App Notes
- `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` already isolates Talos as a visible region-picker flow that breaks during client bootstrap rather than failing before any UI appears.
- `app-manifest.json` and the smoke spec both treat Talos as a mounted app surface under `/talos`, which is why base-path-safe UI controls matter here more than in a root-mounted app.
- The Talos local port mismatch in `apps/talos/package.json` versus `apps/talos/.env.local` follows the same topology-drift pattern called out elsewhere in the smoke spec.

## Open Questions
- Which local Talos origin is intended to be canonical: `http://localhost:3001` from `apps/talos/package.json` or `http://localhost:3201` from `apps/talos/.env.local`?
- Is the quick-start component currently mounted in the default dashboard composition on `apps/talos/src/app/dashboard/page.tsx`? No direct evidence yet.
- Are `/reports` and `/docs/quick-start` valid Talos routes today? No direct evidence yet.
- Is the `usePortalSession()` null state after initial dashboard render expected behavior, or a race between client session fetch and server-side auth? No direct evidence yet.
