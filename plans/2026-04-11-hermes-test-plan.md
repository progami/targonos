# 2026-04-11 Hermes Test Plan

## Purpose
Define the CI smoke suite for Hermes so customer ops views, campaigns, and messaging-adjacent surfaces fail in CI when the frontend stops booting.
Hermes is the customer/commercial ops app: insights, orders, reviews, messaging, campaigns, experiments, and templates are the main surface areas.

## Standard Gate
- Use the repo-standard Playwright smoke harness.
- Fail on page errors, console errors, and required API failures for the current route.

## P0 Flows

### 1. App Entry
Routes: `/`

Checks:
- Root redirects to `/insights`.
- App shell boots without client exceptions.

### 2. Insights
Routes: `/insights`

Checks:
- Insights client renders.
- Dashboard data requests complete without a crash.

### 3. Orders
Routes: `/orders`

Checks:
- Orders client renders.
- Table/list shell loads.

### 4. Campaigns
Routes: `/campaigns`, `/campaigns/new`, `/campaigns/[id]`

Checks:
- Campaign list loads.
- New campaign route opens.
- Existing campaign detail route opens.

## P1 Flows

### 5. Reviews and Messaging
Routes: `/reviews`, `/messaging`

Checks:
- Both routes render their main list or inbox shell.

### 6. Accounts and Settings
Routes: `/accounts`, `/settings`, `/logs`

Checks:
- Connection/account management page loads.
- Settings and logs routes render without runtime errors.

### 7. Experiments and Templates
Routes: `/experiments`, `/templates`

Checks:
- Both routes load successfully and show their primary empty or seeded state.

## Fixtures and Data
- One entitled Hermes user.
- Seeded campaign id for detail-route smoke.
- Seeded orders/insights data or deterministic empty-state fixtures.

## Known Issues From 2026-04-11
- Basic live smoke on `/hermes/insights` and `/hermes/orders` passed.
- Current coverage is effectively absent for campaigns, messaging, reviews, and settings in browser CI.
