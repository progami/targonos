# Talos Dashboard Redesign

Date: 2026-04-22
Branch: talos/stock-network-dashboard

## Goal

Replace the current Talos dashboard with a true operations dashboard that answers the most common stock questions immediately, without sounding like an internal design artifact or another inventory screen.

The dashboard should let a user answer, at a glance:
- How much stock is still in factory?
- How much stock is in transit?
- How much stock is sitting in each warehouse?
- How many cartons, pallets, and units are in each of those buckets?

The dashboard should not use internal design-language like `stock network`, `inventory network`, `nodes`, or `analytics`.

## Non-Goals

This redesign does not turn the dashboard into:
- an inventory ledger replacement
- a graph demo
- a deep reporting screen
- a flow editor

It is a fast operational overview, not a drill-heavy analysis surface.

## Recommended Approach

Use a hybrid dashboard layout.

Why this is the right approach:
- A stage-only dashboard is too abstract.
- A warehouse-only dashboard hides factory and transit, which are critical to supply-chain visibility.
- A hybrid layout gives one fast stage summary, then immediately answers the warehouse question in a practical way.

## Information Hierarchy

### 1. Page Header

The page title should be simply `Dashboard`.

No conceptual labels like:
- Stock Network
- Inventory Network
- Visual Flow
- Nodes
- Movement

The header should feel like a normal Talos home screen, not a feature demo.

### 2. Summary Strip

At the top of the dashboard, show three compact summary cards:
- In Factory
- In Transit
- In Warehouses

Each card shows the same three metrics:
- cartons
- pallets
- units

These cards are the first-answer layer. They tell the operator how stock is distributed across the three main operational buckets.

### 3. Main Body

Below the summary strip, the main body is split into three sections:

#### Warehouses

This is the primary section and should visually dominate the page.

It should show one row per warehouse, sorted by `cartons desc` by default.

Each row shows:
- warehouse name/code
- cartons
- pallets
- units
- SKU count

Reason for sorting by cartons:
- warehouse teams reason in cartons and pallets first
- cartons are more operationally meaningful than units in a mixed-SKU environment
- units are still important, but they are secondary for the first scan

#### Factory

A smaller support section showing the total stock still in manufacturing.

This section should show:
- cartons
- pallets
- units
- PO count

It should be compact, dense, and easy to scan.

#### Transit

A matching support section showing stock already in motion.

This section should show:
- cartons
- pallets
- units
- PO count

This section should visually match the Factory block so the two read as supporting supply-chain context around the warehouse view.

## Visual Design Direction

The dashboard should use the existing Talos dark theme and remain dense, quiet, and professional.

### Visual rules

- Keep the page dark and restrained.
- Use low-contrast slate surfaces and subtle borders.
- Avoid bright accent-color framing.
- Avoid oversized cards.
- Avoid graph-like decorative lines unless they materially improve comprehension.
- Avoid wording that describes the visualization itself.

### Tone of the UI

The page should feel like:
- a warehouse operations home screen
- a live stock overview
- a control panel for common questions

It should not feel like:
- a BI experiment
- a concept mockup
- a second inventory screen with extra decoration

## Data Model for the Dashboard

The redesign should keep the current dashboard data pipeline work, but change the presentation entirely.

### Factory totals

Source from purchase orders currently in the manufacturing stage.

Aggregate into:
- total cartons
- total pallets if available
- total units
- PO count

### Transit totals

Source from purchase orders currently in the transit / ocean stage.

Aggregate into:
- total cartons
- total pallets if available
- total units
- PO count

### Warehouse totals

Source from on-hand inventory balances grouped by warehouse.

Aggregate into:
- cartons
- pallets
- units
- SKU count

Sort by cartons descending.

## Interaction Model

The first version should stay simple.

### Required interactions

- View the three top-level stage summaries.
- Scan the warehouse list in descending carton order.
- Read factory and transit support totals.

### Explicitly not required in the first version

- graph navigation
- node selection
- edge interaction
- visualization labels
- complex drilldowns
- another dashboard-specific filtering system

If the user needs deeper detail, Talos already has downstream pages for ledger-style inspection.

## Copy Rules

All copy must be plain and operational.

Preferred labels:
- Dashboard
- In Factory
- In Transit
- In Warehouses
- Warehouses
- Factory
- Transit
- Cartons
- Pallets
- Units

Avoid:
- Stock Network
- Inventory Network
- Analytics
- Nodes
- Movement
- Flowboard
- Visual Flow

## Layout Summary

Final target layout:

1. `Dashboard` header
2. Three compact summary cards:
   - In Factory
   - In Transit
   - In Warehouses
3. Main warehouse section, sorted by cartons desc
4. Two compact support sections:
   - Factory
   - Transit

This makes the dashboard answer the real user questions immediately, while keeping Talos distinct from the inventory ledger.

## Success Criteria

The redesign is successful if a user can open the dashboard and answer, in under a few seconds:
- how much is in factory
- how much is in transit
- how much is in each warehouse
- how many cartons, pallets, and units are involved

The redesign fails if the page still reads like:
- a graph concept
- a renamed analytics view
- another inventory table with decorative framing

## Scope Boundaries

This spec covers only the dashboard redesign.

It does not include:
- inventory ledger redesign
- new warehouse drilldown pages
- reporting exports
- new backend data collection beyond what is already available for the current stage-based dashboard work
