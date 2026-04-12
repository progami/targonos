# 2026-04-11 Argus Test Plan

## Purpose
Define the CI smoke suite for Argus so WPR, monitoring, cases, and listings flows fail quickly when the app regresses.
Argus is the monitoring and marketplace intelligence app: WPR analysis, monitoring feeds, cases, and listings make up the main navigation.

## Standard Gate
- Use the repo-standard Playwright smoke harness.
- Fail on page errors, console errors, and required API failures.

## P0 Flows

### 1. App Entry
Routes: `/`

Checks:
- Root redirects to `/wpr`.
- App shell renders without runtime errors.

### 2. WPR Root
Routes: `/wpr`

Checks:
- WPR hero and cluster table render.
- Default cluster selection resolves.
- Query bundle request succeeds.

### 3. WPR Secondary Views
Routes: `/wpr/compare`, `/wpr/competitor`, `/wpr/changelog`, `/wpr/sources`

Checks:
- Each route loads without crashing.
- Tab/sidebar navigation between WPR views works.

### 4. Monitoring
Routes: `/monitoring`, `/monitoring/[id]`

Checks:
- Monitoring dashboard loads overview and change feed.
- Source-health tab renders.
- A known monitoring detail route opens.

### 5. Cases
Routes: `/cases`, `/cases/[market]`, `/cases/[market]/[reportDate]`

Checks:
- `/cases` redirects to default market.
- Market page loads.
- Known report-date detail opens.

### 6. Listings
Routes: `/listings`, `/listings/[id]`

Checks:
- Listings index loads.
- Known listing detail route opens.

## P1 Flows

### 7. Tracking Redirects
Routes: `/tracking`, `/tracking/[id]`

Checks:
- Legacy tracking paths redirect to monitoring equivalents without looping.

### 8. Filter Persistence
Routes: `/wpr`, `/monitoring`

Checks:
- URL-backed filters and selected state survive reload.

## Fixtures and Data
- One entitled Argus user.
- Seeded WPR week bundle with at least one cluster.
- Seeded monitoring event id, case report date, and listing id for detail routes.

## Known Issues From 2026-04-11
- Basic live smoke on `/argus/wpr` and `/argus/monitoring` passed.
- There is no current browser CI covering WPR secondary views, case reports, listings, or legacy tracking redirects.
