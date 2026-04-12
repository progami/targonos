# 2026-04-11 xplan Test Plan

## Purpose
Define the CI smoke suite for xPlan so workbook boot, sheet routing, and planning views fail in CI when the app stops loading cleanly.
xPlan is a workbook-style planning app: setup, ops planning, sales planning, P&L, cash flow, and PO profitability all live inside the same routed sheet shell.

## Standard Gate
- Use the repo-standard Playwright smoke harness.
- Fail on page errors, console errors, required API `401`/`500`, and broken workbook navigation.
- Assert that `next build` for xPlan does not ignore TypeScript errors once CI is tightened.

## P0 Flows

### 1. App Entry and Auth Gate
Routes: `/`, `/1-setup`

Checks:
- Root redirects to `1-setup`.
- Authenticated user lands on the workbook shell.
- Unauthenticated or non-entitled user is redirected cleanly.

### 2. Workbook Shell
Routes: `/1-setup`

Checks:
- Sheet tabs render.
- Workbook header and strategy indicators render.
- Switching sheets updates the route and content without a full crash.

### 3. Setup Workspace
Routes: `/1-setup`

Checks:
- Setup workspace loads products, parameters, and purchase order inputs.
- Initial workbook fetch does not throw or hang.

### 4. Ops Planning
Routes: `/3-ops-planning`

Checks:
- Ops planning workspace renders.
- Timeline/grid sections load.
- Calculated rows appear for seeded data.

### 5. Sales Planning
Routes: `/4-sales-planning`

Checks:
- Sales planning grid renders.
- Visual/focus controls render.
- Sheet navigation remains stable after interactions.

### 6. Financial Planning
Routes: `/5-fin-planning-pl`, `/7-fin-planning-cash-flow`

Checks:
- Profit and loss grid renders.
- Cash flow grid renders.
- Header controls do not trigger runtime errors.

### 7. PO Profitability
Routes: `/6-po-profitability`

Checks:
- Profitability section renders for seeded orders.
- Filters/header controls work without a crash.

## P1 Flows

### 8. Invalid Sheet Handling
Routes: `/<bad-sheet>`

Checks:
- Invalid slug 404s or not-founds instead of white-screening.

### 9. Strategy/Region-Sensitive Data
Routes: workbook routes above

Checks:
- Region-dependent workbook state loads for the intended fixture.
- Missing strategy assignment fields fail visibly, not silently.

## Fixtures and Data
- One entitled xPlan user.
- Seeded workbook data for products, sales weeks, purchase orders, lead templates, and financial weeks.
- One stable strategy/region fixture so screenshots and totals are deterministic.

## Known Issues From 2026-04-11
- `/xplan/api/v1/xplan/assignees` returned `401` during local boot and the console logged `Error: Authentication required`.
- `apps/xplan/next.config.ts` currently allows `next build` to ignore TypeScript build errors, which weakens CI.
- Current automated coverage is mostly unit/UI tests around calculations and workbook layout; there is no browser CI guarding the real workbook boot path.
