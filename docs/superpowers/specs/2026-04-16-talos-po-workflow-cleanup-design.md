# Talos PO Workflow Cleanup Design

## Purpose

Clean up the Talos purchase-order workflow so it matches the actual operating model instead of carrying stale states and inconsistent behaviors.

This design covers four Talos-only outcomes:

- warehouse selection during PO receipt stays manual, but Amazon receipt warehouses must be selectable for the current tenant region
- a PO becomes fully read-only once inventory has been posted
- the active PO workflow is simplified to the real inbound lifecycle
- the financial ledger shows unfiltered results by default when the user has not applied filters

## Scope

In scope:

- Talos purchase-order workflow and status model
- Talos PO receipt warehouse selection
- Talos warehouse code normalization for Amazon US
- Talos financial-ledger default filter behavior
- Talos migration, review tooling, and regression coverage needed to support the cleanup

Out of scope:

- X Plan stock editing
- fulfillment-order redesign
- broad warehouse-management redesign outside what is required for PO receipt
- changing financial-ledger backend pagination or result limits

## Evidence

### Current PO Workflow Is Internally Inconsistent

The active PO stage bar already stops at `WAREHOUSE`:

- `apps/talos/src/components/purchase-orders/purchase-order-flow.tsx`

The backend also rejects transitions into `SHIPPED`:

- `apps/talos/src/lib/services/po-stage-service.ts`

The exact message is that purchase orders no longer ship inventory and fulfillment orders should be used instead.

At the same time, the UI and document rendering code still know how to display legacy `SHIPPED` data:

- `apps/talos/src/components/purchase-orders/purchase-order-flow.tsx`
- `apps/talos/src/app/api/purchase-orders/[id]/documents/route.ts`

This means `SHIPPED` is not part of the active workflow, but it still exists in display and legacy-data paths.

### PO Editability Is Too Permissive After Receipt

Inventory receipt already sets `postedAt` and writes the selected warehouse into the PO and inventory transactions:

- `apps/talos/src/lib/services/po-stage-service.ts`

But PO edits are currently blocked only for closed-like states, not for posted orders:

- `apps/talos/src/lib/services/purchase-order-service.ts`
- `apps/talos/src/components/purchase-orders/purchase-order-flow.tsx`

This leaves received inventory open to subsequent edits that should no longer be allowed.

### Amazon Warehouses Are Hidden From PO Receipt

The PO receipt screen loads warehouses from `/api/warehouses` without any Amazon-inclusive mode:

- `apps/talos/src/components/purchase-orders/purchase-order-flow.tsx`

The warehouse API hides Amazon warehouses unless `includeAmazon=true` is passed:

- `apps/talos/src/app/api/warehouses/route.ts`

Talos already uses an Amazon-inclusive warehouse list in the fulfillment-order flow:

- `apps/talos/src/app/operations/fulfillment-orders/new/page.tsx`

That makes the current PO bug concrete: the warehouse selected during receipt is the right source of truth, but the correct Amazon option is missing from the PO receipt dropdown.

### Financial Ledger Is Auto-Filtered In The Frontend

The financial-ledger API accepts optional filters and does not force a default date range:

- `apps/talos/src/app/api/finance/financial-ledger/route.ts`

The frontend initializes the screen with a last-30-days range and always sends those dates:

- `apps/talos/src/app/operations/financial-ledger/page.tsx`

That is why the ledger is effectively filtered before the user applies anything.

### Earlier Talos Migrations Went In The Opposite Direction

Talos already has a migration that unified terminal PO statuses into `CLOSED`:

- `apps/talos/prisma/migrations/20260214123000_unify_po_closed_status/migration.sql`

This new design intentionally reverses that direction.

## Decisions

- Purchase-order receipt warehouse selection remains manual.
- Inventory ledger and related ledger rows continue inheriting the warehouse selected during PO receipt.
- The active inbound PO workflow is `ISSUED -> MANUFACTURING -> OCEAN -> WAREHOUSE`.
- `CANCELLED` becomes the only non-posted terminal state.
- `CLOSED`, `REJECTED`, and `SHIPPED` are removed from the active PO workflow and active PO model.
- Once `postedAt` exists, the PO is fully immutable.
- The US Amazon warehouse code is renamed from `AMZN` to `AMZN-US`.
- The UK Amazon warehouse code remains `AMZN-UK`.
- Amazon warehouse visibility is tenant-region scoped.
- Financial ledger defaults to no applied filters.
- Legacy statuses that have ambiguous business meaning are not blindly remapped; they are reviewed before final migration.
- Legacy PO outbound shipment fields are removed from the active PO model and outbound shipment tracking lives only on fulfillment orders.

## Goals

- Make the PO workflow reflect the real inbound process and nothing else.
- Prevent any mutation of a PO after inventory has been posted.
- Make Amazon destination warehouses selectable during receipt in the correct tenant region.
- Remove stale terminal states from the active Talos PO experience.
- Stop the financial ledger from auto-filtering on initial load.
- Add regression coverage so this workflow does not drift back into mixed semantics.

## Non-Goals

- Rebuilding fulfillment-order workflows
- Redesigning inventory-ledger aggregation logic
- Loading the entire financial ledger without pagination
- Blindly rewriting ambiguous legacy PO records without review

## Approaches Considered

### 1. Minimal Bugfixes

Only fix the missing Amazon warehouse option, add a posted-order edit guard, and remove the financial-ledger default date range.

Why not:

- It leaves the active PO model inconsistent.
- `CLOSED`, `REJECTED`, and `SHIPPED` continue to leak into UI, API, and migration logic.

### 2. Active-Workflow Cleanup Without Legacy Data Cleanup

Clean up the active code paths, but leave legacy statuses and fields in the schema indefinitely.

Why not:

- It reduces immediate risk, but it preserves the exact source of repeated confusion.
- The app would still carry an active model and a shadow model at the same time.

### 3. Full Cleanup With Review-Gated Legacy Migration

Simplify the active workflow and clean up data, but split migration into deterministic updates and review-gated status cleanup.

Why this is the selected approach:

- It aligns the active Talos model with the actual process.
- It allows safe automation where the answer is deterministic.
- It respects the requirement to review ambiguous legacy records case by case.

## Target Design

## 1. Workflow And Data Model

The active purchase-order workflow becomes:

- `ISSUED`
- `MANUFACTURING`
- `OCEAN`
- `WAREHOUSE`
- `CANCELLED`

Behavioral rules:

- `WAREHOUSE` is the completed inbound state.
- `CANCELLED` is only valid before receipt/posting.
- Once `postedAt` exists, the order is read-only and cannot transition further.
- `SHIPPED`, `CLOSED`, and `REJECTED` are not valid active PO states.

Data-model consequences:

- legacy outbound fields on purchase orders are removed from the active PO model:
  - `shipToName`
  - `shipToAddress`
  - `shipToCity`
  - `shipToCountry`
  - `shipToPostalCode`
  - `shippingCarrier`
  - `shippingMethod`
  - `trackingNumber`
  - `shippedDate`
  - `proofOfDeliveryRef`
  - `deliveredDate`
  - legacy proof and shipped metadata fields
- outbound shipment data belongs only on fulfillment orders

## 2. Mutability Rules

Talos gets one shared PO mutability rule:

- if `postedAt` is not null, the PO is immutable

That guard must be enforced server-side first and mirrored in the UI second.

Affected write surfaces include:

- PO detail updates
- stage transitions
- stage in-place edits
- line edits
- line deletes
- warehouse changes
- forwarding and freight cost mutations
- any cancellation path

UI behavior after posting:

- edit actions disappear or disable
- transition controls disappear
- cancel action disappears
- the order remains readable, but not writable

## 3. Warehouse Selection And Region Scoping

The selected receipt warehouse remains the source of truth for:

- `purchase_orders.warehouse_code`
- `purchase_orders.warehouse_name`
- inventory transactions created during receipt
- ledger rows derived from those transactions

Amazon warehouse rules:

- rename US code `AMZN` to `AMZN-US`
- keep UK code `AMZN-UK`
- US tenants can see `AMZN-US`
- UK tenants can see `AMZN-UK`
- tenants never see the other region's Amazon warehouse in default receipt lists

This requires an explicit region-aware warehouse-resolution helper so Talos stops scattering region-specific Amazon logic across routes and screens.

The PO receipt dropdown must use a warehouse-list mode that includes the current tenant region's Amazon warehouse.

## 4. Financial Ledger Defaults

The financial-ledger screen defaults to an empty filter state.

Rules:

- no default date range
- no default warehouse filter
- no default category filter
- no date params sent until the user explicitly sets them
- backend limit and pagination behavior remain unchanged

The result is that the screen shows the first paginated slice of the full ledger by default instead of an implicit last-30-days window.

## Migration Strategy

## 1. Deterministic Migration

These changes can be applied automatically:

- rename warehouse code `AMZN` to `AMZN-US`
- update all Talos warehouse-code references that store `AMZN`
- change any Talos setup logic that creates the US Amazon warehouse so it now creates `AMZN-US`
- remove `CLOSED`, `REJECTED`, and `SHIPPED` from active create, edit, and transition paths
- keep temporary read compatibility for legacy rows until the review-gated cleanup is complete

Tables and references that need explicit review during implementation include at minimum:

- `warehouses`
- `purchase_orders`
- `inventory_transactions`
- `cost_ledger`
- `financial_ledger`
- any view, summary, or maintenance script that hardcodes `AMZN`

## 2. Review-Gated Legacy Status Migration

Ambiguous legacy PO statuses are not safe for blind remapping.

Those records must go through a review artifact first:

- generate a report of all POs currently in `SHIPPED`, `CLOSED`, or `REJECTED`
- include enough context for manual status resolution
- capture the chosen target for each reviewed PO before running the final cleanup

Only after review do we run the migration that removes those statuses from active Talos purchase-order data.

This keeps the active model clean without inventing history for old records.

## 3. Schema Cleanup

After deterministic migration and reviewed legacy resolution:

- remove PO enum/status usage for `CLOSED`, `REJECTED`, and `SHIPPED` from the active app model
- remove PO outbound shipment fields from the active schema and serialization paths
- update any dependent views or reports that still depend on those fields or statuses

Because Talos has prior migrations that intentionally unified statuses into `CLOSED`, this cleanup must explicitly reverse that assumption in both schema-adjacent code and data migrations.

## Testing Strategy

Talos currently uses Node test style in `apps/talos/tests/unit`, so the new coverage should follow that pattern.

Required regression coverage:

- PO mutability tests:
  - detail update fails when `postedAt` exists
  - line edit fails when `postedAt` exists
  - stage mutation fails when `postedAt` exists
  - cancel fails when `postedAt` exists
- workflow tests:
  - active next stages no longer expose `CLOSED`, `REJECTED`, or `SHIPPED`
  - `CANCELLED` is allowed only for non-posted orders
- warehouse tests:
  - US region resolves `AMZN-US`
  - UK region resolves `AMZN-UK`
  - PO receipt warehouse list includes the current region's Amazon warehouse
  - PO receipt warehouse list excludes the other region's Amazon warehouse
- financial-ledger tests:
  - default screen state sends no date params
  - unfiltered requests still use the existing backend limit/pagination behavior
- migration verification:
  - active US data no longer contains `AMZN`
  - legacy review report includes all `SHIPPED`, `CLOSED`, and `REJECTED` POs before final cleanup

Implementation verification later must include:

- `pnpm --filter @targon/talos type-check`
- `pnpm --filter @targon/talos lint`
- Talos unit tests covering the new status and warehouse rules
- migration dry-run or review artifact generation before any destructive cleanup is applied

## Rollout Notes

- deterministic warehouse-code migration can be applied first
- active code-path cleanup should land with regression tests
- review-gated legacy status cleanup should happen only after the review artifact is produced and decisions are captured
- schema-field removal for legacy shipped data should be sequenced after legacy record cleanup so history is not destroyed prematurely

## Risks

- previous migrations and reporting views may still assume `CLOSED` is the unified terminal state
- hidden scripts or one-off maintenance tooling may still reference `AMZN`
- removing legacy PO outbound fields too early could break old-record display unless migration sequencing is correct

These are rollout risks, not reasons to keep the old model. The mitigation is explicit migration sequencing plus regression coverage.
