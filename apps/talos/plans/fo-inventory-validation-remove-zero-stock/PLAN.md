# Talos: FO inventory validation + remove “Show zero stock”

## Context / Current Behavior

### 1) Fulfillment Orders can be created with zero inventory

**Reason (today):** FO creation (`POST /api/fulfillment-orders`) calls `createFulfillmentOrder()` which validates:
- warehouse exists
- SKUs exist
- batch configs exist
- quantities are positive

It **does not** validate inventory availability at creation time. Inventory availability is enforced later during `transitionFulfillmentOrderStage(... → SHIPPED)` where it queries `inventoryTransaction` rows and blocks shipment if on-hand cartons are insufficient. The FO “New” UI also loads SKU options from `/api/skus`, so it will show SKUs/batches even when there is no inventory for them.

Files:
- Create FO API: `apps/talos/src/app/api/fulfillment-orders/route.ts`
- Create FO service: `apps/talos/src/lib/services/fulfillment-order-service.ts`
- Inventory check happens at ship stage: `apps/talos/src/lib/services/fulfillment-order-service.ts` (`transitionFulfillmentOrderStage`)

### 2) Inventory page “Show zero stock”

**Today:** Inventory UI toggles `showZeroStock` and sends `showZeroStock=true|false` to `GET /api/inventory/balances`. Backend forwards it into `aggregateInventoryTransactions(..., { includeZeroStock })`.

Files:
- UI: `apps/talos/src/app/operations/inventory/page.tsx`
- API: `apps/talos/src/app/api/inventory/balances/route.ts`

## Goals

1) Decide + enforce the intended behavior for FO creation:
   - If the product has **no inventory ledger presence**, FO creation should be blocked (or at minimum prevent adding such lines).
   - Keep ship-stage validation regardless (still required).

2) Make the FO “New” dropdowns consistent with the rest of the app:
   - SKU/batch dropdowns should only show options that are valid for the workflow.
   - For FO, that means: **only show SKUs/batches that have on-hand inventory** in the selected warehouse. If no inventory exists, dropdowns should be empty.

3) Remove the “Show zero stock” feature entirely (frontend + backend), defaulting Inventory view to **on-hand only**.

## Plan

### A) FO creation inventory validation

1) Confirm desired rule precisely
   - Option A (strict): Block FO creation if any line has `availableCartons < requestedCartons`.
   - Option B (minimal): Block FO creation only when `availableCartons === 0` (matches “no inventory in the ledger” complaint), but allow partial shortages (still blocked at ship stage).

2) Implement server-side enforcement (non-optional)
   - Update `createFulfillmentOrder()` to compute on-hand cartons **for the selected warehouse + skuCode + batchLot** at “now”.
   - Fail with `ValidationError` that identifies which SKU/batch is unavailable and shows available cartons.
   - Keep this as a single query + in-memory grouping (avoid N+1 per line).

3) UI: inventory-driven dropdown options
   - On `/operations/fulfillment-orders/new`, stop using `/api/skus` as the source of selectable SKU/batch options.
   - Instead, for the selected warehouse, fetch on-hand inventory balances and build dropdown options from those balances:
     - SKU dropdown: only SKUs with `currentCartons > 0`
     - Batch dropdown: only batches for the selected SKU with `currentCartons > 0`
   - If the selected warehouse has no on-hand inventory, dropdowns should show no options (consistent with other “invalid workflow” dropdowns).
   - Still keep server-side enforcement (step 2) so the rule cannot be bypassed.

4) UX guardrails
   - Show “Available cartons” per line.
   - Disable submit if any line fails the rule (selected SKU/batch has no stock / insufficient stock depending on rule).

5) Validation
   - Browser test on `https://dev-os.targonglobal.com/talos/operations/fulfillment-orders/new`:
     - Creating FO with zero-inventory SKU/batch blocks with a clear message
     - Creating FO with in-stock SKU/batch succeeds
   - Run `pnpm -C apps/talos lint` and `pnpm -C apps/talos type-check`

### B) Remove “Show zero stock” (frontend + backend)

1) Frontend removal
   - Remove `showZeroStock` state, persistence, and checkbox from `apps/talos/src/app/operations/inventory/page.tsx`
   - Update the empty-state copy to not reference “Show zero stock”

2) Backend removal
   - Remove `showZeroStock` query parsing from `apps/talos/src/app/api/inventory/balances/route.ts`
   - Call `aggregateInventoryTransactions` without `includeZeroStock` (or hardcode `false`)
   - Ensure pagination/summary still behaves as expected

3) Validation
   - Browser test on `https://dev-os.targonglobal.com/talos/operations/inventory`:
     - toggle is gone
     - inventory loads and filters still work
   - Run `pnpm -C apps/talos lint` and `pnpm -C apps/talos type-check`

## PR Workflow

1) Branch: `talos/<short-name>`
2) PR title: `fix(talos): <summary> [gpt]`
3) PR → `dev`, wait CI green, merge
4) PR `dev` → `main`, wait CI green, merge
5) Delete feature branch
