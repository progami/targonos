# 2026-04-11 Argus UI Visibility Spec
## Goal
Assess Argus UI visibility on the root, WPR, monitoring, cases, listings, tracking, and no-access surfaces, with emphasis on renderability, shell controls, section labels, layout behavior, and redirect-only entry screens that can appear blank.

## Files Reviewed
- `app-manifest.json`
- `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`
- `plans/2026-04-11-argus-test-plan.md`
- `apps/argus/app/layout.tsx`
- `apps/argus/app/globals.css`
- `apps/argus/app/page.tsx`
- `apps/argus/app/no-access/page.tsx`
- `apps/argus/app/(app)/layout.tsx`
- `apps/argus/app/(app)/wpr/page.tsx`
- `apps/argus/app/(app)/wpr/layout.tsx`
- `apps/argus/app/(app)/monitoring/page.tsx`
- `apps/argus/app/(app)/cases/page.tsx`
- `apps/argus/app/(app)/listings/page.tsx`
- `apps/argus/app/(app)/tracking/page.tsx`
- `apps/argus/components/layout/app-shell.tsx`
- `apps/argus/components/layout/theme-toggle.tsx`
- `apps/argus/components/wpr/wpr-layout.tsx`
- `apps/argus/components/wpr/cluster-table.tsx`

## Repro Routes
- `/argus` immediately redirects to `/argus/wpr` via `apps/argus/app/page.tsx`.
- `/argus/wpr` renders inside `apps/argus/app/(app)/layout.tsx`, `apps/argus/components/layout/app-shell.tsx`, and `apps/argus/app/(app)/wpr/layout.tsx` / `apps/argus/components/wpr/wpr-layout.tsx`.
- `/argus/monitoring` renders the client-side dashboard in `apps/argus/app/(app)/monitoring/page.tsx`.
- `/argus/cases` immediately redirects to `/argus/cases/us` via `apps/argus/app/(app)/cases/page.tsx`.
- `/argus/listings` server-renders the listing index in `apps/argus/app/(app)/listings/page.tsx`.
- `/argus/tracking` immediately redirects to `/argus/monitoring` via `apps/argus/app/(app)/tracking/page.tsx`.
- `/argus/no-access` renders the centered no-access surface from `apps/argus/app/no-access/page.tsx`.

## Confirmed Issues
- The shell’s descriptive copy is authored but not visible. In `apps/argus/components/layout/app-shell.tsx`, each `NAV_ITEMS` entry includes a `description`, and `resolveSectionCopy()` returns a `subtitle`, but the rendered UI only shows `item.label`, `sectionCopy.eyebrow`, and `sectionCopy.title`. WPR, monitoring, cases, and listings therefore lose their section descriptions even though the copy already exists.
- Several entry routes are redirect-only and have no renderable UI of their own. `apps/argus/app/page.tsx`, `apps/argus/app/(app)/cases/page.tsx`, and `apps/argus/app/(app)/tracking/page.tsx` return redirects immediately. If those redirects stall or fail, those routes present as blank transitions rather than visible screens.
- The WPR control bar is a single fixed horizontal row with no responsive overflow strategy. `apps/argus/components/wpr/wpr-layout.tsx` renders five tab pills plus the week selector in one `Stack direction="row"` / `justifyContent="space-between"` layout, with no `flexWrap`, no horizontal scroll affordance, and no compact fallback. On narrower widths, some controls will be compressed or pushed out of view.
- `/monitoring` is client-only and its visible server output is just a minimal fallback card. `apps/argus/app/(app)/monitoring/page.tsx` uses `dynamic(..., { ssr: false, loading: TrackingDashboardFallback })`, so the real monitoring controls are not renderable until client hydration completes.

## Likely Root Causes
- App-shell content was partially wired. `apps/argus/components/layout/app-shell.tsx` defines richer navigation and section copy than it actually renders.
- Redirects are being used as route surfaces instead of transitions. `apps/argus/app/page.tsx`, `apps/argus/app/(app)/cases/page.tsx`, and `apps/argus/app/(app)/tracking/page.tsx` provide no intermediate UI.
- WPR layout was built for desktop-only density without a narrow-width degradation path. `apps/argus/components/wpr/wpr-layout.tsx` assumes the full tab strip and week selector can coexist in one row.
- Monitoring boot depends on client hydration. `apps/argus/app/(app)/monitoring/page.tsx` avoids SSR for the dashboard body, so visibility depends on JS becoming ready rather than on the route document alone.
- Coverage is incomplete. `plans/2026-04-11-argus-test-plan.md` explicitly notes there is no browser CI for case reports, listings, or legacy tracking redirects.

## Recommended Fixes
- Render the existing `description` and `subtitle` copy from `apps/argus/components/layout/app-shell.tsx` so each section has visible explanatory context.
- Replace redirect-only entry routes with visible transition states, or ensure browser smoke treats any redirect delay/failure on `/argus`, `/cases`, and `/tracking` as a hard failure.
- Make `apps/argus/components/wpr/wpr-layout.tsx` responsive: wrap, horizontally scroll, or collapse secondary controls so tabs and the week selector remain visible.
- Give `/monitoring` a more meaningful SSR-safe shell state so the route still shows its primary labels and controls before hydration finishes.
- Add browser assertions for `/argus/no-access`, `/argus/cases`, `/argus/listings`, and `/argus/tracking`, not just `/argus/wpr` and `/argus/monitoring`.

## Verification Plan
- Smoke `/argus` and assert the redirect lands on `/argus/wpr` without a blank intermediate state.
- Smoke `/argus/wpr` and verify the WPR tab bar, week selector, and cluster table all remain visible at the supported desktop widths.
- Smoke `/argus/monitoring` and fail on any route that never progresses beyond `TrackingDashboardFallback` from `apps/argus/app/(app)/monitoring/page.tsx`.
- Smoke `/argus/cases`, `/argus/listings`, `/argus/tracking`, and `/argus/no-access` with heading-level assertions so each surface proves it is actually renderable.
- Add targeted UI tests for `apps/argus/components/layout/app-shell.tsx` to verify section subtitle and nav descriptive copy are either intentionally absent or explicitly rendered.

## Cross-App Notes
- `app-manifest.json` marks `argus` as active.
- `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` says `/argus` redirected to `/argus/wpr` and rendered successfully, and `/argus/monitoring` also rendered successfully with no console errors during that pass.
- The same cross-app smoke spec notes a local port mismatch for Argus: package script `3216`, `.env.local` `3016`, observed listener `3016`. That is not a confirmed UI defect, but it matters for reliable smoke coverage.
- `plans/2026-04-11-argus-test-plan.md` already identifies missing browser CI for WPR secondary views, case reports, listings, and tracking redirects.

## Open Questions
- Is the missing shell copy in `apps/argus/components/layout/app-shell.tsx` intentional, or did the header and nav simply stop rendering fields that were already authored?
- Are `/argus`, `/cases`, and `/tracking` intended to remain redirect-only forever, or should they show a visible transition/loading state?
- Is Argus expected to support narrower widths for WPR, or is the single-row control bar in `apps/argus/components/wpr/wpr-layout.tsx` intentionally desktop-only?
- No direct evidence yet that `/argus/no-access` is visually broken; the current gap is missing browser coverage rather than a confirmed render failure.
- No direct evidence yet of a live render failure on `/argus/listings`; current evidence only shows that it lacks browser smoke coverage outside code inspection.
