# 2026-04-11 Kairos Test Plan

## Purpose
Define the CI smoke suite for Kairos so capability gating, data-source management, models, and forecast flows fail when the app stops being usable.
Kairos is the forecasting app: users manage source series, models, and forecast runs behind a capability-gated shell.

## Standard Gate
- Use the repo-standard Playwright smoke harness.
- Fail on page errors, console errors, and route request failures.
- Treat `/no-access` as a valid result only in explicit entitlement tests.

## P0 Flows

### 1. Capability Gate
Routes: `/`, `/forecasts`, `/no-access`

Checks:
- Entitled user entering `/` reaches `/forecasts`.
- Non-entitled user reaches `/no-access`.
- Gate does not loop between routes.

### 2. Sources
Routes: `/sources`, `/sources/[seriesId]`

Checks:
- Sources page loads.
- Data source panel renders.
- A known source detail route opens successfully.

### 3. Models
Routes: `/models`

Checks:
- Models page renders.
- Model list shell loads without runtime errors.

### 4. Forecasts
Routes: `/forecasts`, `/forecasts/[forecastId]`

Checks:
- Forecasts list loads.
- Known forecast detail route opens.
- List-to-detail navigation works.

## P1 Flows

### 5. Empty and Seeded States
Routes: `/sources`, `/models`, `/forecasts`

Checks:
- Empty-state rendering does not crash when no records exist.
- Seeded-state rendering behaves with at least one record present.

### 6. Forecast Creation or Refresh
Routes: `/forecasts`

Checks:
- If forecast creation exists in UI, the modal/form opens and validates.
- If forecast refresh exists, triggering it does not white-screen the page.

## Fixtures and Data
- One entitled Kairos user.
- One non-entitled user.
- Seeded source, model, and forecast ids for detail-route smoke.

## Known Issues From 2026-04-11
- Local smoke only reached `/kairos/no-access`, so meaningful app coverage is currently blocked without seeded entitlements.
- Current automated coverage is limited to a unit test around regressor alignment; no browser smoke exists for the app shell or forecast workflows.
