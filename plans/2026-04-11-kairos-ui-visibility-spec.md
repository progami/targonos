# 2026-04-11 Kairos UI Visibility Spec

## Goal
Document the Kairos UI visibility issues evidenced in code and the existing smoke/test docs, limited to root, forecasts, sources, models, and no-access surfaces.

## Files Reviewed
- [app-manifest.json](/Users/jarraramjad/dev/targonos-main/app-manifest.json:1)
- [plans/2026-04-11-cross-app-ci-smoke-spec.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec.md:1)
- [plans/2026-04-11-kairos-test-plan.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-kairos-test-plan.md:1)
- [apps/kairos/app/layout.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/layout.tsx:1)
- [apps/kairos/app/globals.css](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/globals.css:1)
- [apps/kairos/app/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/page.tsx:1)
- [apps/kairos/app/no-access/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/no-access/page.tsx:1)
- [apps/kairos/app/(app)/layout.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/(app)/layout.tsx:1)
- [apps/kairos/app/(app)/forecasts/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/(app)/forecasts/page.tsx:1)
- [apps/kairos/app/(app)/forecasts/[forecastId]/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/(app)/forecasts/[forecastId]/page.tsx:1)
- [apps/kairos/app/(app)/sources/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/(app)/sources/page.tsx:1)
- [apps/kairos/app/(app)/sources/[seriesId]/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/(app)/sources/[seriesId]/page.tsx:1)
- [apps/kairos/app/(app)/models/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/(app)/models/page.tsx:1)
- [apps/kairos/components/kairos-shell.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/kairos-shell.tsx:1)
- [apps/kairos/components/forecasts/forecasts-table.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/forecasts/forecasts-table.tsx:1)
- [apps/kairos/components/sources/data-sources-panel.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/sources/data-sources-panel.tsx:1)
- Directly referenced UI-critical detail views: [apps/kairos/components/forecasts/forecast-detail.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/forecasts/forecast-detail.tsx:1), [apps/kairos/components/sources/data-source-detail.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/sources/data-source-detail.tsx:1)

## Repro Routes
- `/`: redirects to `/forecasts` in [apps/kairos/app/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/page.tsx:3), then capability-gated in [apps/kairos/app/(app)/layout.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/(app)/layout.tsx:10).
- `/forecasts`: heading plus `ForecastsTable` from [apps/kairos/app/(app)/forecasts/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/(app)/forecasts/page.tsx:5).
- `/forecasts/[forecastId]`: detail page delegates to `ForecastDetailView` in [apps/kairos/app/(app)/forecasts/[forecastId]/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/(app)/forecasts/[forecastId]/page.tsx:3).
- `/sources`: heading plus `DataSourcesPanel` from [apps/kairos/app/(app)/sources/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/(app)/sources/page.tsx:5).
- `/sources/[seriesId]`: detail page delegates to `DataSourceDetail` in [apps/kairos/app/(app)/sources/[seriesId]/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/(app)/sources/[seriesId]/page.tsx:3).
- `/models`: static models surface from [apps/kairos/app/(app)/models/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/(app)/models/page.tsx:27).
- `/no-access`: dedicated recovery card in [apps/kairos/app/no-access/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/no-access/page.tsx:7).

## Confirmed Issues
- Local root smoke does not visibly reach the forecasting workspace. The root route redirects to `/forecasts`, but the app layout immediately redirects users without `kairos.enter` to `/no-access` in [apps/kairos/app/(app)/layout.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/(app)/layout.tsx:10), and the recorded smoke pass only rendered `No Access to Kairos` at `http://localhost:3010/kairos` in [plans/2026-04-11-cross-app-ci-smoke-spec.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec.md:104). That is not a client crash, but it means the main UI is not visibly reachable in the current local smoke setup.
- The forecasts list masks fetch failures as empty UI. `forecastsQuery` and `seriesQuery` are created in [apps/kairos/components/forecasts/forecasts-table.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/forecasts/forecasts-table.tsx:30), but the main list data is defaulted to `[]` in [apps/kairos/components/forecasts/forecasts-table.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/forecasts/forecasts-table.tsx:386). The rendered outcomes are empty-state copy like `No forecasts found.` at [apps/kairos/components/forecasts/forecasts-table.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/forecasts/forecasts-table.tsx:782) and `No time series yet.` inside the create dialog at [apps/kairos/components/forecasts/forecasts-table.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/forecasts/forecasts-table.tsx:543), with no visible error branch or retry for failed list loads.
- Forecast detail masks fetch failures as `Forecast not found.` The detail query is created in [apps/kairos/components/forecasts/forecast-detail.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/forecasts/forecast-detail.tsx:110), but when no `forecast` is present it falls straight to the not-found UI in [apps/kairos/components/forecasts/forecast-detail.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/forecasts/forecast-detail.tsx:306). There is no visible `isError` state, so server or network failures degrade into a misleading absence message.
- Source detail masks fetch failures as `Data source not found.` The query is created in [apps/kairos/components/sources/data-source-detail.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/sources/data-source-detail.tsx:71), but if `series` is absent it renders the not-found UI in [apps/kairos/components/sources/data-source-detail.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/sources/data-source-detail.tsx:127). Like forecast detail, there is no visible error branch.
- Forecast detail’s output table can clip content instead of allowing horizontal scroll. Its table wrapper uses `overflow-hidden` in [apps/kairos/components/forecasts/forecast-detail.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/forecasts/forecast-detail.tsx:481), while the comparable models, sources, and source-detail tables use `overflow-x-auto` in [apps/kairos/app/(app)/models/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/(app)/models/page.tsx:355), [apps/kairos/components/sources/data-sources-panel.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/sources/data-sources-panel.tsx:1071), and [apps/kairos/components/sources/data-source-detail.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/components/sources/data-source-detail.tsx:267). On narrower viewports, that makes the forecast detail table the one surface most likely to hide columns instead of remaining scrollable.

## Likely Root Causes
- Kairos visibility in smoke is currently blocked by entitlement seeding, not by a shell crash. The capability gate in [apps/kairos/app/(app)/layout.tsx](/Users/jarraramjad/dev/targonos-main/apps/kairos/app/(app)/layout.tsx:10) is doing its job, but the current local smoke setup only exercises the denied state.
- The forecast list and both detail views treat missing query data as equivalent to empty or missing records. The list defaults to empty arrays, and the detail views only branch on loading vs. null record.
- The forecast detail route diverged from the other table surfaces on overflow handling, using `overflow-hidden` where the rest of Kairos uses horizontal scrolling.

## Recommended Fixes
- Seed an entitled Kairos user for smoke and route-launch coverage so `/` can visibly reach `/forecasts`, matching the expectation in [plans/2026-04-11-kairos-test-plan.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-kairos-test-plan.md:14).
- Add explicit error states and retry actions to `ForecastsTable`, `ForecastDetailView`, and `DataSourceDetail`, instead of collapsing failures into empty or not-found copy.
- Change the forecast detail table wrapper to horizontal scrolling, consistent with the other Kairos data surfaces.
- Keep `/no-access` as the explicit recovery route for entitlement tests; do not let it be the only surface CI ever proves visible.

## Verification Plan
- Verify `/` reaches `/forecasts` for an entitled user and `/no-access` for a non-entitled user, with no redirect loop, as required by [plans/2026-04-11-kairos-test-plan.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-kairos-test-plan.md:14).
- Verify `/forecasts` shows a visible error state when `/api/v1/forecasts` or `/api/v1/time-series` fails, instead of only `No forecasts found.` or `No time series yet.`
- Verify `/forecasts/[forecastId]` distinguishes fetch failure from missing record and keeps the page visibly recoverable.
- Verify `/sources/[seriesId]` distinguishes fetch failure from missing record and keeps the page visibly recoverable.
- Verify the forecast detail output table remains readable on narrower widths and does not clip columns.
- Verify `/sources`, `/models`, and `/no-access` continue to render their current headings and actions without runtime errors.

## Cross-App Notes
- `kairos` is active in [app-manifest.json](/Users/jarraramjad/dev/targonos-main/app-manifest.json:2).
- The smoke discovery already called out that Kairos coverage is blocked because local smoke only hits `/kairos/no-access`, in [plans/2026-04-11-cross-app-ci-smoke-spec.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec.md:104).
- The same smoke doc notes a local topology mismatch: the running app was on `3010` while the portal app map expects `3210`, in [plans/2026-04-11-cross-app-ci-smoke-spec.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec.md:55). That affects whether visibility gets tested through the real launcher path.

## Open Questions
- Should the forecasts list show a true error panel when either list query fails, or is the intended UX to tolerate partial data loss? No direct evidence yet.
- Should detail routes use a real not-found path for missing ids and a separate error path for failed fetches? No direct evidence yet.
- Is forecast detail expected to support narrower laptop widths, or is clipping acceptable because Kairos is desktop-first? No direct evidence yet.
- Are there additional UI-critical shell controls behind `ThemeToggle` or other shared components that affect visibility on these surfaces? No direct evidence yet.
