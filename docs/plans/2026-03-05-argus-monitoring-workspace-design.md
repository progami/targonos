# Argus Monitoring Workspace Design

Date: 2026-03-05
App: Argus

## Goal

Turn Argus tracking into a monitoring workspace that is driven by real change events from the Dust Sheets US shared-drive Monitoring dataset instead of raw hourly polling or the existing database snapshot table.

## Source Of Truth

For this phase, Argus reads directly from the shared-drive Monitoring files:

- `/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/04 Sales/Monitoring/Hourly/Listing Attributes (API)/latest_state.json`
- `/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/04 Sales/Monitoring/Hourly/Listing Attributes (API)/Listings-Changes-History.csv`
- `/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/04 Sales/Monitoring/Hourly/Listing Attributes (API)/Listings-Snapshot-History.csv`

Postgres ingestion is deferred until the UI proves the model.

## Product Shape

The user-facing concept is a change event, not an hourly poll.

The monitoring workspace is organized into:

1. Overview
2. Change feed
3. ASIN detail
4. Source health

The main flow is:

1. Open Overview
2. Scan the change feed
3. Filter by owner, category, severity, or search
4. Drill into an ASIN only when a change needs inspection

## UI Direction

- Material UI
- Dense analyst workspace, not a generic SaaS dashboard
- Warm neutral background with darker data surfaces
- Strong status color discipline
- Compact chips, segmented controls, and detail panes
- Responsive shell with a real mobile drawer

## Architecture

### File-backed monitoring layer

Add a small file-backed monitoring layer in `apps/argus/lib/monitoring/` that:

- reads and validates the Monitoring files
- parses CSV safely
- normalizes latest state, change events, and snapshot history
- computes severity and category metadata
- reports source freshness

### API layer

Add server routes under `apps/argus/app/api/monitoring/`:

- `GET /api/monitoring/overview`
- `GET /api/monitoring/changes`
- `GET /api/monitoring/asins/[asin]`
- `GET /api/monitoring/health`

These routes return UI-ready data. The client does not know anything about CSV columns or shared-drive paths.

## Normalization Model

Each `changed=yes` row becomes a normalized event with:

- timestamp
- ASIN
- owner type
- severity
- categories
- changed fields
- headline
- summary
- baseline timestamp
- current snapshot
- baseline snapshot

Snapshot history is indexed by ASIN so change events can show usable before/after context instead of raw column names only.

## Severity Rules

- Critical: our status/content issues, own-offer issues, multi-signal changes on our ASINs
- High: image/content changes, larger commercial shifts, repeated deterioration on our ASINs
- Medium: notable BSR, offer, or competitor content movement
- Low: minor churn, especially isolated rank moves

BSR-only churn is deliberately down-ranked so the feed stays useful.

## Error Handling

No fake fallbacks.

- Core source files missing: API returns a real error
- Stale datasets: UI shows explicit stale-source banners
- Optional datasets missing: source health marks them missing and explains what is affected

## Validation

Validation for this phase:

- lint
- type-check
- local Argus run on port `3216`
- headed Playwright verification using dev auth bypass from `apps/argus/.env.local`

## Follow-up

If the monitoring workspace proves useful, the next step is a Postgres-backed ingestion layer that preserves the same API contracts and UI model.
