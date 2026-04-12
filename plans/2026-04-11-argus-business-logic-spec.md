# 2026-04-11 Argus Business Logic Spec

## Goal
Document confirmed Argus workflow defects in WPR, monitoring, cases, listings, and tracking, using code evidence first and runtime evidence second. This spec ignores auth and shell/UI chrome unless they block the underlying workflow.

## Files Reviewed
- `app-manifest.json`
- `plans/2026-04-11-cross-app-ci-smoke-spec.md`
- `plans/2026-04-11-argus-test-plan.md`
- `apps/argus/app/page.tsx`
- `apps/argus/app/(app)/wpr/page.tsx`
- `apps/argus/app/(app)/wpr/layout.tsx`
- `apps/argus/app/(app)/wpr/compare/page.tsx`
- `apps/argus/app/(app)/wpr/competitor/page.tsx`
- `apps/argus/app/(app)/wpr/changelog/page.tsx`
- `apps/argus/app/(app)/wpr/sources/page.tsx`
- `apps/argus/app/(app)/monitoring/page.tsx`
- `apps/argus/app/(app)/monitoring/[id]/page.tsx`
- `apps/argus/app/(app)/cases/page.tsx`
- `apps/argus/app/(app)/cases/[market]/page.tsx`
- `apps/argus/app/(app)/cases/[market]/[reportDate]/page.tsx`
- `apps/argus/app/(app)/listings/page.tsx`
- `apps/argus/app/(app)/listings/[id]/page.tsx`
- `apps/argus/app/(app)/listings/[id]/listing-detail.tsx`
- `apps/argus/app/(app)/listings/[id]/use-listing-detail-data.ts`
- `apps/argus/app/(app)/listings/[id]/listing-detail-shared.ts`
- `apps/argus/app/(app)/tracking/page.tsx`
- `apps/argus/app/(app)/tracking/[id]/page.tsx`
- `apps/argus/hooks/use-wpr.ts`
- `apps/argus/stores/wpr-store.ts`
- `apps/argus/components/wpr/wpr-layout.tsx`
- `apps/argus/components/wpr/cluster-table.tsx`
- `apps/argus/components/wpr/compare-dashboard.tsx`
- `apps/argus/components/wpr/competitor-dashboard.tsx`
- `apps/argus/components/wpr/source-heatmap.tsx`
- `apps/argus/components/wpr/change-timeline.tsx`
- `apps/argus/components/monitoring/FeedRail.tsx`
- `apps/argus/components/monitoring/ChangeDetail.tsx`
- `apps/argus/components/monitoring/SourceHealthGrid.tsx`
- `apps/argus/components/monitoring/ui.tsx`
- `apps/argus/components/cases/report-page.tsx`
- `apps/argus/app/api/wpr/weeks/route.ts`
- `apps/argus/app/api/wpr/weeks/[week]/route.ts`
- `apps/argus/app/api/wpr/changelog/route.ts`
- `apps/argus/app/api/wpr/sources/route.ts`
- `apps/argus/app/api/monitoring/overview/route.ts`
- `apps/argus/app/api/monitoring/changes/route.ts`
- `apps/argus/app/api/monitoring/health/route.ts`
- `apps/argus/app/api/monitoring/asins/[asin]/route.ts`
- `apps/argus/app/api/listings/route.ts`
- `apps/argus/app/api/listings/ensure/route.ts`
- `apps/argus/app/api/listings/[id]/route.ts`
- `apps/argus/app/api/tracking/asins/[id]/route.ts`
- `apps/argus/app/api/tracking/asins/route.ts`
- `apps/argus/app/api/tracking/dashboard/route.ts`
- `apps/argus/app/api/tracking/fetch/route.ts`
- `apps/argus/lib/wpr/reader.ts`
- `apps/argus/lib/wpr/types.ts`
- `apps/argus/lib/monitoring/reader.ts`
- `apps/argus/lib/monitoring/types.ts`
- `apps/argus/lib/monitoring/labels.ts`
- `apps/argus/lib/cases/reader.ts`
- `apps/argus/lib/cases/reader-core.ts`
- `apps/argus/lib/cases/theme.ts`
- `apps/argus/lib/db.ts`
- `apps/argus/lib/base-path.ts`

## Repro Routes
- `/argus/wpr`, `/argus/wpr/compare`, `/argus/wpr/competitor`
  - Break or fail `GET /api/wpr/weeks`; the layout shows an alert, but the child pages never receive a selected week and stay in a spinner state.
- `/argus/monitoring?owner=UNKNOWN`
  - The server/API contract accepts `UNKNOWN`, but the page state and filter UI coerce it back to `ALL`, so unknown-owner events cannot be isolated from the actual workflow surface.
- `/argus/monitoring`
  - Select an event for an ASIN that still exists in change history but no longer exists in `latest_state.json`; click the detail link to `/argus/monitoring/:asin`; the detail API returns `404`.
- `/argus/tracking/:id`
  - Any legacy tracking detail path that still uses the old tracked-ASIN database id redirects to `/argus/monitoring/:id`, but monitoring detail expects an ASIN, not a DB id.
- `/argus/listings/:asin`
  - Enter a lowercase ASIN or create/navigate a variation without marketplace context; the ensure flow can create or resolve the wrong listing identity because it does not canonicalize ASIN case and silently defaults marketplace to `US`.
- `/argus/cases/us` and `/argus/monitoring`
  - Run on any machine or CI environment that does not have the exact hardcoded Google Drive mount points used in the readers; the workflow data cannot load.

## Confirmed Issues
- WPR root, compare, and competitor can deadlock in a permanent loading state when week-summary loading fails. `apps/argus/components/wpr/wpr-layout.tsx` only sets `selectedWeek` when `useWprWeeksQuery()` returns data, while `apps/argus/hooks/use-wpr.ts` disables `useWprWeekBundleQuery()` when `week === null`. The route pages in `apps/argus/app/(app)/wpr/page.tsx`, `apps/argus/app/(app)/wpr/compare/page.tsx`, and `apps/argus/app/(app)/wpr/competitor/page.tsx` all treat `data === undefined` as “still loading”, so an upstream weeks error leaves those routes spinning indefinitely instead of failing cleanly.
- Monitoring cannot filter `UNKNOWN` owners from the actual dashboard UI even though the backend supports them. `apps/argus/lib/monitoring/types.ts` defines `MonitoringOwner = 'OURS' | 'COMPETITOR' | 'UNKNOWN'`, and `apps/argus/app/api/monitoring/changes/route.ts` accepts `UNKNOWN`, but `apps/argus/app/(app)/monitoring/page.tsx` restricts `OwnerFilter`/`readOwnerParam()` to `ALL | OURS | COMPETITOR`, and `apps/argus/components/monitoring/FeedRail.tsx` only renders those three options.
- Monitoring change-feed detail can 404 for historical events that still have snapshots and change records. The dashboard in `apps/argus/app/(app)/monitoring/page.tsx` links from the selected event to `/monitoring/${selectedEvent.asin}`. `apps/argus/lib/monitoring/reader.ts` builds `MonitoringAsinDetail` with `changes` and `snapshots` even when `current` is `null`, but `apps/argus/app/api/monitoring/asins/[asin]/route.ts` returns `404` whenever `!detail.current`. That blocks investigation of ASINs that dropped out of the latest state but still matter in the history.
- Legacy tracking redirects do not preserve the old route contract. `apps/argus/app/(app)/tracking/[id]/page.tsx` forwards the raw `[id]` segment to `/monitoring/${id}`. The old tracking API in `apps/argus/app/api/tracking/asins/[id]/route.ts` clearly treats `[id]` as the tracked-ASIN database id, while the monitoring detail page/API in `apps/argus/app/(app)/monitoring/[id]/page.tsx` and `apps/argus/app/api/monitoring/asins/[asin]/route.ts` treat the segment as an ASIN. Legacy `/tracking/[id]` deep links therefore break if they still carry DB ids.
- Listings identity resolution is not canonicalized. `apps/argus/app/(app)/listings/[id]/listing-detail-shared.ts` accepts lowercase ASINs via `looksLikeAsin()`, `apps/argus/app/(app)/listings/[id]/use-listing-detail-data.ts` posts the raw route segment to `/api/listings/ensure`, and `apps/argus/app/api/listings/ensure/route.ts` stores `asin` exactly as provided. That means ASIN identity can diverge by case, which is a real data integrity problem for a PostgreSQL text unique key.
- Listings ensure logic silently forces missing marketplace context to `US`. Both direct ASIN resolution in `apps/argus/app/(app)/listings/[id]/use-listing-detail-data.ts` and variation navigation in `apps/argus/app/(app)/listings/[id]/listing-detail.tsx` call `/api/listings/ensure` without `marketplace`, while `apps/argus/app/api/listings/ensure/route.ts` defaults missing marketplace to `'US'`. Any non-US or future multi-market listing flow will resolve or create the wrong record.
- Cases and monitoring are tied to one developer’s local filesystem instead of a configurable data source. `apps/argus/lib/cases/reader-core.ts` hardcodes US and UK case roots under `/Users/jarraramjad/.../Shared drives/...`, and `apps/argus/lib/monitoring/reader.ts` hardcodes the monitoring root under the same user-specific Drive mount. Those workflows are not portable to CI or another workstation as written.

## Likely Root Causes
- Route contracts drifted during the tracking-to-monitoring migration. Tracking still thinks in tracked-ASIN ids, while monitoring detail is ASIN-based.
- WPR boot is split across two separate client-state dependencies: layout-level week selection and page-level bundle loading. The failure path for the first one is not treated as a terminal state for the second one.
- Monitoring’s server-side filter/model contract has evolved further than the dashboard controls. The API and types support states that the page and feed controls no longer expose.
- Listing identity is being created opportunistically from route input, but the ensure path does not enforce a canonical ASIN format or explicit marketplace.
- Cases and monitoring readers bypass environment configuration entirely and embed workstation-specific paths into the workflow layer.

## Recommended Fixes
- Resolve legacy tracking ids to ASINs before redirecting `/tracking/[id]`, or keep a compatibility detail route that performs that lookup server-side.
- Change the WPR bundle pages to treat “no selected week because weeks query failed” as an error state, not as an infinite loading state.
- Add `UNKNOWN` as a first-class monitoring owner filter in `apps/argus/app/(app)/monitoring/page.tsx` and `apps/argus/components/monitoring/FeedRail.tsx`, and preserve it in the URL state.
- Allow monitoring detail to return historical snapshots and change events even when the ASIN is absent from `latest_state.json`; the absence of `current` should not force a `404`.
- Canonicalize ASINs to uppercase at every listings boundary and require explicit marketplace on ensure flows instead of defaulting to `US`.
- Move case-report and monitoring data roots into environment configuration and hard-fail with explicit config errors when they are missing.

## Verification Plan
- WPR: force `/api/wpr/weeks` to fail and assert `/wpr`, `/wpr/compare`, and `/wpr/competitor` surface a terminal error instead of spinning forever.
- Monitoring: seed at least one `UNKNOWN` owner event and verify the dashboard can filter to it and preserve that filter in the query string.
- Monitoring: keep snapshots/change history for an ASIN while removing it from `latest_state.json`, then verify `/monitoring/:asin` still opens a useful historical detail view.
- Tracking: test `/tracking/[legacyTrackedAsinId]` and confirm it lands on the correct monitoring ASIN detail, not a broken `/monitoring/:dbId` path.
- Listings: navigate using lowercase ASINs and non-US marketplace variations, then verify no duplicate listing rows are created and the resolved listing record is in the correct marketplace.
- Cases and monitoring: run the workflows in an environment without the hardcoded Drive mount and verify the app fails with explicit configuration errors rather than silently depending on one workstation.
- Smoke coverage: extend the Argus suite described in `plans/2026-04-11-argus-test-plan.md` so WPR secondary views, cases, listings, and legacy tracking redirects are exercised, not just `/argus/wpr` and `/argus/monitoring`. `plans/2026-04-11-cross-app-ci-smoke-spec.md` already shows the current live smoke only covered those two happy-path routes.

## Open Questions
- Are production legacy tracking links known to use tracked-ASIN database ids, or were they already ASIN-based by the time `/tracking/[id]` became a redirect?
- Should monitoring detail intentionally support “historical-only” ASINs that are no longer in the latest state, or should the feed suppress those events instead?
- Is Argus listings meant to stay US-only despite the presence of a `marketplace` field, or is explicit multi-market support expected?
- Are the cases and monitoring readers intentionally workstation-local tools, or are they supposed to participate in the repo-standard CI and shared local-dev topology described in the existing smoke specs?
