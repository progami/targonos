# 2026-04-11 Talos Test Plan

## Purpose
Define the minimum CI suite for Talos so tenant selection, warehouse operations, config pages, and Amazon tooling fail loudly when the app stops booting cleanly.
Talos is the warehouse and supply-chain operations app: tenant entry, purchase orders, fulfillment, inventory, ledgers, and Amazon fee/shipment tooling are its main workflows.

## Standard Gate
- Use the repo-standard Playwright smoke harness.
- Fail on runtime exceptions, React hydration errors, console errors, and required route request failures.
- Fail on unexpected auth redirects after tenant selection.

## P0 Flows

### 1. Tenant Entry
Routes: `/`

Checks:
- World map renders.
- Selecting `US` or `UK` starts Talos session bootstrap.
- User lands on dashboard instead of remaining stuck on tenant selection.

### 2. Dashboard
Routes: `/dashboard`

Checks:
- Dashboard shell renders title and navigation.
- Stats request completes without runtime crash.
- Time-range switch updates the view without throwing.

### 3. Purchase Orders
Routes: `/operations/purchase-orders`, `/operations/purchase-orders/new`, `/operations/purchase-orders/[id]`

Checks:
- PO list loads with stage tabs.
- `New Purchase Order` opens the create flow.
- A draft PO can be created with fixture data and reopened by id.
- Stage-specific views do not throw when switching tabs or searching.

### 4. Inventory and Transactions
Routes: `/operations/inventory`, `/operations/inventory/incomplete`, `/operations/transactions/[id]`

Checks:
- Inventory ledger loads.
- Incomplete inventory page renders.
- Opening a transaction detail page shows tabs/details without crashing.

### 5. Fulfillment Orders
Routes: `/operations/fulfillment-orders`, `/operations/fulfillment-orders/new`, `/operations/fulfillment-orders/[id]`

Checks:
- Fulfillment order list loads.
- New fulfillment flow opens.
- Existing fulfillment order detail renders.

### 6. Configuration
Routes: `/config`, `/config/products`, `/config/suppliers`, `/config/warehouses`

Checks:
- Config hub loads.
- Product, supplier, and warehouse pages load without auth regressions.
- Warehouse create/edit/rate screens render for a fixture warehouse.

### 7. Amazon Workspace
Routes: `/amazon/fba-fee-discrepancies`, `/amazon/fba-fee-tables`, `/market/shipment-planning`

Checks:
- All live Amazon tool routes render.
- Workspace switcher navigation works.
- Fee discrepancy page loads data shell and pagination controls.

## P1 Flows

### 8. Finance Views
Routes: `/finance/storage-ledger`, `/finance/cost-ledger`, `/operations/storage-ledger`, `/operations/financial-ledger`

Checks:
- Ledger pages render and export controls are present.
- Filters can be toggled without a client crash.

### 9. Super Admin Gating
Routes: `/config/permissions`

Checks:
- Super admin can load permissions page.
- Non-super-admin is rejected instead of silently rendering broken state.

### 10. Upload Surface
Routes: `/test/s3-upload`

Checks:
- Presign/upload flow works with a small test file in non-prod CI environments.

## Fixtures and Data
- One entitled Talos user.
- Seeded `US` and `UK` tenants.
- At least one purchase order, one fulfillment order, one warehouse, and one inventory transaction in seed data.
- One deterministic fixture PO create payload for smoke create/delete.

## Known Issues From 2026-04-11
- Selecting `US` from the entry map triggered `401` responses on portal/session and tenant endpoints.
- Browser console recorded `Minified React error #418` during the Talos bootstrap path.
- Current automated coverage is limited to unit tests and navigation shape checks; there is no end-to-end CI coverage for tenant bootstrap or operations routes.
