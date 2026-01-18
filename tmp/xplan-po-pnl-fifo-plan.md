# X-Plan: Refactor “7 PO Profitability” into FIFO-driven “PO P&L” (Projected vs Real)

## Context / problem
Sheet **7 (PO Profitability)** currently computes profit from **PO/batch input unit economics** (quantity × price/cost) and is not downstream of the same engine that drives:

**Ops (POs) → Sales Plan (weekly) → Weekly P&L**

This causes:
- PO profitability numbers that **don’t reconcile** to Weekly P&L (sheet 5).
- Missing/omitted figures (notably **fixed costs / OPEX**).
- Confusing overlap between “Weekly P&L” and “PO Profitability”.
- Filtering/visibility inconsistencies (e.g., POs spanning years).

The desired end-state is **PO P&L** that is **derived from FIFO allocation**, with **two views**:
- **Projected**: what we expected (planner/system driven)
- **Real**: what actually happened (actual-sales driven)

## Current code reality (source of truth)
### FIFO allocation exists and is already used by Weekly P&L
- FIFO + sales planning: `apps/xplan/lib/calculations/sales.ts`
  - `allocateSalesFIFO`
  - `computeSalesPlan` → emits `SalesWeekDerived.batchAllocations[]`
- Weekly P&L consumes FIFO allocations: `apps/xplan/lib/calculations/finance.ts`
  - `computeProfitAndLoss` (“Use batch allocations if available (FIFO costing)”)

### “PO Profitability” is currently PO/batch unit-econ (not FIFO sold units)
- View builder: `apps/xplan/app/[sheet]/page.tsx`
  - `getPOProfitabilityView` computes per-batch profit using full batch quantities.
- UI: `apps/xplan/components/sheets/po-profitability-section.tsx`
  - Aggregates per-batch rows to per-PO when “All SKUs” selected.

## Goals
1. Replace “PO Profitability” math with **FIFO-sold-unit derived P&L**.
2. Add **Projected vs Real** switching for PO P&L.
3. Ensure **reconciliation**: aggregating PO P&L over the same scope should match Weekly P&L.
4. Handle year/segment scoping without hiding relevant POs (e.g., “sold in 2026” even if PO date is 2025).
5. Keep UI consistent with other sheets (table + viz, filters, typography).

## Non-goals (for this phase)
- Perfect “real” fee/COGS accounting (returns, reimbursements, multi-marketplace, FX, etc.). We’ll design for it, but can ship a first “Real” mode using **actual units** + **current unit-econ assumptions**.
- Full dissolution of sheet 7 into sheet 5 (we can decide later; the plan supports either).

## Proposed architecture (data lineage)

### Step 1: Build an “allocation ledger” from sales plan
Create a single canonical transformation that converts the sales plan into “finance lines”.

**Input**
- `SalesWeekDerived[]` (from `computeSalesPlan`)
- `products: Map<string, ProductCostSummary>` (from operations context)

**Output (new type)**
`AllocationLine[]`, one line per (weekNumber, productId, orderCode, batchCode):
- `weekNumber`, `weekDate`
- `productId`
- `orderCode`, `batchCode`
- `units`
- `revenue`
- `cogs` (landed cost)
- `amazonFees` (referral + fba + storage)
- `ppcSpend` (tacos% × revenue)

**Why**
- Weekly P&L becomes a pure aggregation of these lines by `weekNumber`.
- PO P&L becomes a pure aggregation by `orderCode` (and optionally `batchCode`).
- This guarantees both views share identical math and stay reconciled.

### Step 2: Weekly P&L uses ledger aggregation (+ overrides)
Refactor (or wrap) `computeProfitAndLoss` to:
1. Generate `AllocationLine[]`
2. Aggregate to weekly totals
3. Apply existing `ProfitAndLossWeek` overrides (optional but recommended)

This keeps sheet 5 behavior consistent and reduces drift.

### Step 3: PO P&L is ledger aggregation (+ fixed cost allocation)
Compute PO-level metrics by aggregating `AllocationLine[]` over a time scope:
- Group key: `orderCode` (PO)
- Optional sub-group: `batchCode` when SKU is focused (mirrors current UI behavior)

#### Fixed costs / OPEX
Fixed costs are weekly, not PO-native. We need an explicit attribution rule so totals reconcile:
- For each `weekNumber`, allocate that week’s fixed costs across POs **proportional to that week’s revenue** (preferred), or units if revenue is 0.
- Store `allocatedFixedCosts` per PO in the PO P&L result.

This makes:
`sum(PO.allocatedFixedCosts) == weekly.fixedCosts` (per week) and therefore PO net profit totals reconcile.

### Step 4: “Projected vs Real” is two separate sales plans
We compute **two** sales plans (and therefore two ledgers):

#### Projected mode (expected)
Sales source precedence (explicit; no “weird fallbacks”):
1. Planner forecast (`forecastSales`)
2. System forecast (`systemForecastSales`)
3. Else 0

#### Real mode (actual)
Sales source precedence:
1. Actual sales (`actualSales`)
2. Else “unknown/0” depending on how we define “Real” (see below)

Then:
- Build `AllocationLine[]` for each mode
- Compute PO P&L for each mode
- Show deltas per PO (Real − Projected)

#### Defining “Real” for weeks without actual data
Two valid interpretations:
1. **Actual-to-date** (recommended): only include weeks where we have `actualSales` and treat others as “not included”.
2. **Hybrid** (not recommended if we want strictness): use actual for past weeks and projected for future weeks.

Recommendation: ship **Actual-to-date** first with clear UI copy (“Realized to date: through Wxx / <date>”), and add hybrid later only if needed.

## Scope / filtering rules (fix year-related issues by design)
Instead of filtering POs by PO date or arrival year, scope PO P&L by **sales weeks in scope**:
- When user selects `year=2026`, we include `AllocationLine[]` where `weekNumber` is in that year segment.
- A PO appears if it has **any allocated units** in the scoped weeks.

Optional: add “All years” that includes all week numbers (no segment filter).

This fixes cases like “Batch 1 PO exists but isn’t visible because its PO date is outside the selected year”.

## UI changes (sheet 7)

### Naming
- Rename nav label from “PO Profitability” → **“PO P&L”**
- Keep slug for now (`7-po-profitability`) and decide later on renaming/redirects.

### Controls
Add a compact control group (match other sheets’ toolbar style):
- **Mode**: Projected | Real
- Existing: **Status** filter (if still meaningful; otherwise align to Talos states later)
- Existing: **SKU** filter (focus SKU)
- Existing: **Year** (plus optional “All years”)

### Table (Tabular view)
When SKU = All:
- Show one row per PO
When SKU is focused:
- Show rows per PO batch (or per PO+SKU) with FIFO-sold units

Columns (minimum viable):
- PO Code
- Status
- Units Sold (scoped)
- Revenue
- COGS
- Amazon Fees
- PPC
- Fixed Costs (allocated)
- Net Profit
- GP % (gross margin)
- NP % (net margin)
- ROI % (net profit / supplier cost, or clarify denominator)

Optional columns:
- Arrival date (availableDate), lead time, etc. (secondary; don’t crowd)

### Visual view
Move trend chart to visual mode (align with other sheets):
- Time-series: margin / profit by week (scoped)
- Distribution: profitability by PO (bar/area)
- In “Projected vs Real”, allow toggling which series is shown and/or show delta.

### Reconciliation affordance
Add a small “Totals” area:
- Sum revenue/net profit for visible POs
- Show “Matches Weekly P&L totals for this scope: ✅/⚠️” (warning if overrides make it non-exact)

## Handling Weekly P&L overrides (important)
Weekly P&L supports overrides (`ProfitAndLossWeek`).

Options:
1. **Ignore overrides** in PO P&L (fastest, but totals won’t match when overrides exist).
2. **Allocate override deltas** proportionally across PO contributions by week (recommended):
   - For each week, compute base totals from ledger.
   - If overrides exist for revenue/cogs/fees/ppc/fixed, compute delta and distribute to POs by that week’s revenue share.
   - This preserves reconciliation even when overrides are used.

Recommendation: implement option 2 so PO P&L remains trustworthy.

## Known edge cases (must be addressed for correctness)
### Sales > inventory (oversold demand)
Current `computeSalesPlan` can create `row.finalSales` that exceeds available inventory; FIFO allocations then cover only part, and Weekly P&L falls back to product defaults for the remainder.

For PO P&L, “unallocated sales” breaks attribution.

Plan:
- Split “demand” vs “fulfilled” internally:
  - `demandUnits` = chosen sales source (Actual/Planner/System)
  - `fulfilledUnits` = min(demandUnits, stockStart + arrivals + any allowed negative policy)
- FIFO + P&L use `fulfilledUnits`
- Keep demand visible for planning (and add lost sales later if we want it)

If we avoid adding new columns in UI now, we can keep UI unchanged but ensure finance/PO P&L uses the fulfillable series.

### Multi-SKU POs / batches
FIFO attribution must respect `BatchTableRow` splits (already supported by `computeSalesPlan`’s `order.batches` usage).

### Currency/region
Today everything formats USD in PO profitability UI; if UK needs GBP, ensure formatter is region-aware (or keep consistent as a later task).

## Implementation steps (after the in-flight PR lands)
1. **Rebase/merge dependency PR** (the UI overhaul PR) and ensure `dev` is green.
2. Add new calculation module:
   - `apps/xplan/lib/calculations/allocation-ledger.ts` (or similar)
   - Unit test the ledger and aggregations.
3. Refactor `computeProfitAndLoss` to use ledger (or add parallel path).
4. Implement `computePoPnL({ ledger, weeklyFixedCosts, scope, mode })`.
5. Wire sheet 7:
   - Replace `getPOProfitabilityView` with PO P&L derived result.
   - Update `POProfitabilityData` type to reflect “sold units + allocated opex”, not “purchased qty”.
6. UI updates:
   - Rename labels, move chart to viz mode, improve reconciliation UX.
7. Validation:
   - For a strategy + year, confirm totals match Weekly P&L for Projected and Real (within rounding).
   - Ensure POs spanning years appear correctly.

## Validation checklist (must pass before shipping)
- For a given `strategyId` + year scope:
  - `sum(PO revenue) == Weekly P&L revenue` (after overrides, if enabled)
  - `sum(PO net profit) == Weekly P&L net profit` (after fixed cost allocation)
- “Real” mode only includes weeks with actuals (or clearly labeled if hybrid).
- No PO rows are computed from “full batch qty” anymore; it’s all FIFO-sold units.

## Open questions (need your call)
1. “Real” mode: **Actual-to-date** only, or hybrid (actual past + projected future)?
2. ROI denominator:
   - supplier cost only (COGS) vs (COGS + allocated opex) vs cash-based ROI
3. Should we keep sheet 7 as “PO P&L” or merge into sheet 5 as a sub-tab after we stabilize?
4. When sellerboard “real fees/COGS” is available, what becomes authoritative:
   - use sellerboard per-SKU profit lines, or keep our unit-econ model and only use sellerboard units?

