# Plutus Flow (LMB + QBO)

Goal: **brand-level P&L** where everything adds up to the total, with **inventory accounting** (Asset → COGS when sold) and minimal manual work.

## Responsibility Split

- **LMB**
  - Posts the settlement “Sales & Fees” into QBO.
  - Product Groups split **sales/refunds** by brand (Product Group).
  - Product Groups do **not** reliably split **fees** by brand.
- **Plutus**
  - Creates the **brand account structure** in QBO (sub-accounts).
  - Reads **QBO Bills** to build SKU **cost basis** (cost history).
  - Processes **LMB Audit Data CSV** to:
    - post **COGS JEs** (Inventory Asset → COGS) by brand + component
    - post **P&L reclass JEs** so all P&L becomes brand-level (fees/ads/promos/reimbursements/etc)
  - Tracks which LMB settlements have been processed (LMB-like settlement list).

## One-Time Setup (recommended order)

1. **Plutus → Setup → Brands**
   - Define Brands and their marketplace (brand-level foundation).
2. **Plutus → Setup → SKUs**
   - Map every SKU to a Brand.
3. **LMB → Accounts & Taxes Wizard (per connection)**
   - Run the LMB wizard so the base Amazon parent accounts exist in QBO.
4. **Plutus → Setup → Accounts**
   - Map the correct QBO **parent accounts by ID** and create brand sub-accounts under them.
5. **LMB → Product Groups**
   - Map SKUs → Product Groups (Brands).
   - Ensure Sales/Refunds land in the brand sub-accounts.
   - Fees stay on the parent fee accounts (then Plutus reclasses after the fact).
   - Set **UNASSIGNED** as the default Product Group.
   - Post 1 test settlement and confirm QBO lands where expected.

## Ongoing: Bills (cost basis source)

Preferred v1 workflow: create or map bills in **Plutus → Bills** so the memo + line descriptions are consistent.

1. Create (or map) supplier bills:
   - Bill memo must link the PO: `PO: PO-YYYY-NNN`
   - Manufacturing lines must include `SKU x <qty> units` so Plutus can establish on-hand units per PO/SKU.
   - Freight/Duty/Accessories can be SKU-specific or PO-level (allocated across PO units).
2. Plutus reads mapped QBO Bills and builds SKU cost basis via **ledger replay**:
   - Costing method: **moving average** (v1)
   - Late freight/duty uses “apply to remaining on-hand only” behavior (v1)

## Ongoing: Audit Data (bulk upload)

LMB exports Audit Data as a single CSV covering a date range (e.g. `audit-data-Targon US-2025-10-2026-02.csv`). One file contains **all settlements** in that range — rows are grouped by the `Invoice` column, where each unique Invoice ID maps to one LMB settlement.

1. In LMB:
   - Download the **Audit Data CSV** for the desired date range.
2. In Plutus → **Cost Management → Audit Data**:
   - Upload the CSV (or ZIP containing a CSV).
   - Plutus parses the file and splits rows by `Invoice`.
   - Matches each Invoice to a known LMB settlement (via QBO journal entry lookup).
   - Shows upload summary: how many settlements matched, how many rows, any unmatched invoices.
   - Stores the parsed data — settlements can now be processed from the Settlements page.

Re-uploading a file with overlapping Invoices is safe (idempotent via processing hash).

## Ongoing: Settlements (the main workflow)

This is the "posting unit": **one LMB `Invoice` group** from Audit Data.

1. In Plutus (LMB-like UX):
   - Open the Settlements list.
   - Plutus polls **QBO** to find LMB-posted settlements (LMB has no API).
   - Each row shows:
     - **LMB Posted** (inferred from QBO)
     - **Audit Data**: whether audit data has been uploaded for this settlement
     - **Plutus Processed / Pending / Blocked**
2. To process a settlement, audit data must already be uploaded (via Inventory → Audit Data).
3. Plutus uses the stored audit data for the settlement's Invoice:
     - **Processed** (already posted by Plutus)
     - **Pending** (ready to post — audit data available)
     - **Blocked** (missing cost basis, negative inventory risk, missing SKU mapping, etc.)
     - **No Audit Data** (audit data not yet uploaded for this Invoice)
4. Plutus validation (hard blocks in v1):
   - Missing SKU → block (must exist + be mapped to a Brand)
   - Missing cost basis for SKU as-of sale date (from Bills) → **block**
   - Ledger replay would go negative on-hand → **block**
   - Partial/ambiguous refunds → flag for review
5. Plutus calculation:
   - Units sold/returned per SKU per Brand from Audit Data
   - Cost per unit per component from bill-derived cost history
   - Allocate/reclass all **P&L-impacting** lines by Brand from Audit Data (fees/ads/promos/reimbursements/etc)
6. Plutus posting to QBO (per settlement):
   - **COGS JE**: debit Brand COGS component accounts, credit Brand Inventory Asset component accounts
   - **P&L Reclass JE**: move P&L amounts from parent accounts → Brand sub-accounts (brand-level P&L)
7. Mark the settlement **Processed**:
   - Store `(marketplace, invoiceId, processingHash)` + QBO JE IDs for idempotency and traceability.

## Optional: Autopost (safe automation)

Plutus includes an **Auto-process** action on the Settlements page plus a headless runner (`pnpm -C apps/plutus autopost:check`) suitable for cron/PM2.

Design rule: **never guess** which audit invoice belongs to a settlement.
- Matching is deterministic by settlement marketplace + settlement period (from LMB DocNumber).
- If there is no unique match (missing period, none found, ambiguous), the settlement is **skipped** and requires manual selection in the UI.

## Ongoing: Reconciliation (compare-only in v1)

Plutus includes a Reconciliation page (`/reconciliation`) to compare an Amazon Date Range Transaction Report against stored LMB Audit Data, surfaced as:
- matched orders
- discrepancies
- Amazon-only
- LMB-only

This is optional reporting in v1. It requires exporting the Amazon Seller Central Date Range Transaction Report. Posting reconciliation adjustments to QBO is still a future step.

## Decision Tree (v1 defaults)

- Cost basis source: **QBO Bills**
- Costing method: **moving average**
- Guardrails:
  - **Block** if no cost basis
  - **Block** if negative inventory would occur
- Brand-level:
  - Sales/refunds → LMB Product Groups
  - P&L (fees/ads/promos/reimbursements/etc) → Plutus reclass after settlement
  - Balance sheet items (tax/reserved/deferred/loans/rollovers) → shown for context, not part of profit

## UI: “Xerox LMB” Design Notes

### Settlements list (copy LMB)

- Table view with filters (Period / Total / Status) and an Action menu per row.
- Columns match LMB: **Marketplace**, **Date range**, **Settlement total**, **Status**, **Action**.
- Add a clear “Plutus processed” signal without changing the mental model (e.g., a status badge).

### Settlement detail (copy LMB tabs)

- Tabs similar to LMB “Sales & Fees / History / Analysis”:
  - **Sales & Fees**: raw LMB lines + brand allocation outputs (fees + units)
  - **History**: uploads, hashes, QBO JE links/IDs, processed timestamps, rollback/void actions
  - **Analysis**: COGS component breakdown, validation results, blockers with fixes

### Accounts mapping (copy LMB mapping screen)

- Present as a mapping table (not a multi-step wizard):
  - “Transaction category” (our categories: Inventory components, COGS components, LMB parents)
  - “Account name” (QBO account selector)
  - (No tax rates; not needed for Plutus)

## Related Docs

- `apps/plutus/plans/plutus-lmb-qbo-integration/plutus-implementation-plan-v2.md`
- `apps/plutus/plans/plutus-lmb-qbo-integration/plutus-setup-wizard-ui.md`
