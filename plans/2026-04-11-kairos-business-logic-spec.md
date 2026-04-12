# 2026-04-11 Kairos Business Logic Spec

## Goal
Document the Kairos business-logic defects in source import, forecast creation, and forecast execution so the forecasting workflows fail on real contract problems instead of silently leaving bad state behind.

## Files Reviewed
- `app-manifest.json`
- `plans/2026-04-11-cross-app-ci-smoke-spec.md`
- `plans/2026-04-11-kairos-test-plan.md`
- `apps/kairos/app/page.tsx`
- `apps/kairos/app/(app)/forecasts/page.tsx`
- `apps/kairos/app/(app)/sources/page.tsx`
- `apps/kairos/app/(app)/models/page.tsx`
- `apps/kairos/components/forecasts/forecasts-table.tsx`
- `apps/kairos/components/forecasts/forecast-detail.tsx`
- `apps/kairos/components/sources/data-sources-panel.tsx`
- `apps/kairos/components/sources/data-source-detail.tsx`
- `apps/kairos/app/api/v1/forecasts/route.ts`
- `apps/kairos/app/api/v1/time-series/google-trends/route.ts`
- `apps/kairos/app/api/v1/time-series/csv/route.ts`
- `apps/kairos/lib/forecasts/run.ts`
- `apps/kairos/lib/api/client.ts`

## Repro Routes
- `/forecasts`: forecast list and create/run modal in `apps/kairos/components/forecasts/forecasts-table.tsx`.
- `/forecasts/[forecastId]`: detail route and rerun/cancel/export workflow in `apps/kairos/components/forecasts/forecast-detail.tsx`.
- `/sources`: source import and CSV / Google Trends workflows in `apps/kairos/components/sources/data-sources-panel.tsx`.
- `/sources/[seriesId]`: time-series detail and “Create Forecast” handoff in `apps/kairos/components/sources/data-source-detail.tsx`.

## Confirmed Issues
- The create-and-run flow can persist a forecast even when the overall operation fails. In `apps/kairos/app/api/v1/forecasts/route.ts`, the handler creates the `forecast` record first with status `DRAFT`, then calls `runForecastNow()` when `runNow` is true. If `runForecastNow()` throws, the outer catch returns an error response, but the already-created forecast is not rolled back. The UI will show `Create failed` even though a new draft forecast has been saved.
- The forecast UI offers a regressor future-mode that the backend explicitly does not support. In `apps/kairos/components/forecasts/forecasts-table.tsx`, the regressor selector exposes both `FORECAST` and `USER_INPUT`. In `apps/kairos/lib/forecasts/run.ts`, any regressor with `futureMode === 'USER_INPUT'` throws `requires user-provided future values, which is not supported yet.` The create form therefore allows users to configure a path that the runner is guaranteed to reject.
- CSV import is create-only and duplicates source series instead of updating them. `apps/kairos/app/api/v1/time-series/csv/route.ts` always creates new `timeSeries` rows with `import.mode: 'CREATE'`; it never looks up an existing series to merge, replace, or refresh. Re-importing the same CSV or the same logical series creates more source rows rather than updating the existing one.

## Likely Root Causes
- Forecast creation and forecast execution are treated as one UI action but not as one transactional unit. The database write for forecast creation is committed before the run pipeline is validated or started successfully.
- The regressor-mode UI got ahead of the actual forecast-runner contract. The form supports `USER_INPUT`, but the server-side Prophet path only supports auto-forecasted regressors.
- Google Trends imports have merge/cache semantics, but CSV imports were implemented as first-pass ingestion only. The sources workflow therefore has inconsistent update rules depending on source type.

## Recommended Fixes
- Make create-and-run atomic. If `runNow` is true, either wrap creation and run startup in one transaction-safe workflow or delete the just-created forecast when run initialization fails.
- Remove `USER_INPUT` from the forecast-create UI until the backend supports it, or implement the missing user-supplied regressor future-value path in the runner and API.
- Add an update contract for CSV imports similar to the Google Trends import path: detect an existing owned series, then support merge/replace instead of unconditional create.

## Verification Plan
- Create a forecast with an intentionally invalid run path and confirm the request leaves no orphan draft forecast behind.
- Select a regressor in the forecast-create modal and verify the UI only offers modes the backend can actually execute.
- Import the same CSV twice and confirm the second import updates or replaces the existing series instead of creating a duplicate row.
- Re-run a valid forecast and verify the list/detail invalidation still refreshes correctly after the create/run workflow changes.
- Verify `/sources/[seriesId] -> Create Forecast` continues to prefill the target series and produce a working forecast for supported models.

## Open Questions
- Should failed `runNow` requests leave a draft forecast intentionally for later manual correction, or is the intended contract truly atomic “Create & Run” behavior?
- When CSV imports become update-capable, should identity be based on series name, product key, file metadata, or an explicit selected target series?
- Is `USER_INPUT` meant to be the long-term product direction for regressors, or was it only added to reserve UI space for a later feature?
