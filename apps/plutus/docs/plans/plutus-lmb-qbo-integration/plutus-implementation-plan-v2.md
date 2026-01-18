# Plutus Implementation Plan v2

## Overview

Hybrid accounting system for Amazon FBA business using Link My Books (LMB) + Plutus.

**Business:**
- Amazon seller (US + UK marketplaces in single QBO)
- 2 brands currently: UK-Dust Sheets, US-Dust Sheets (US-Shoe Bag future)
- 12 SKUs total (4 US, 8 UK) with 3 shared ASINs between regions
- FBA only
- Single-member LLC (Targon LLC)
- Uses 3PL storage in US

**Goal:**
- Brand-level P&L that adds up 100% to total P&L
- COGS broken into components with full visibility
- Accurate inventory accounting (asset → COGS when sold)
- Automation, minimal manual work

---

## Prerequisites

**⚠️ CRITICAL: Complete LMB Accounts & Taxes Wizard BEFORE starting Plutus setup.**

LMB creates the base accounts (LMB1-LMB10) in QBO. Plutus depends on these accounts existing.

1. Go to LMB → Accounts & Taxes → Setup Wizard
2. Complete all 3 steps (Map transactions, Bank accounts, Tax rates)
3. Do this for EACH LMB connection (US and UK)

**Related Document:** See `plutus-setup-wizard-ui.md` for the Plutus Setup Wizard UI design, which automates much of the account creation and configuration.

---

## Current Status (2026-01-16)

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0 (QBO Cleanup) | ✅ COMPLETE | Duplicate Amazon accounts made inactive |
| Phase 1 (QBO Accounts) | 🟡 PARTIAL | Revenue/Fee sub-accounts done (16). **Missing:** 2 parents + 22 Plutus sub-accounts (8 Inv Asset + 14 COGS incl Shrinkage). *Setup Wizard automates this.* |
| Phase 2 (LMB Config) | ❌ NOT STARTED | Requires LMB UI for BOTH connections. *Setup Wizard Steps 2 (acknowledge) and 6 (guide) cover this.* |
| Phase 3 (Bill Entry Setup) | ✅ COMPLETE | Using Bill Memo field for PO linking. *Setup Wizard Step 7 explains format.* |
| Phase 4 (Bill SOP) | ❌ NOT STARTED | Documentation only |
| Phase 5 (Plutus Dev) | ❌ NOT STARTED | Build the app (includes Setup Wizard) |
| Phase 6 (Workflows) | ❌ NOT STARTED | Settlement + Returns + Reconciliation |
| Phase 7 (Testing) | ❌ NOT STARTED | Unit + Integration + Parallel run |
| Phase 8 (Go-Live) | ❌ NOT STARTED | Production deployment |

**Next Action:** Complete Phase 1 - Create 2 parent accounts + 22 Plutus sub-accounts in QBO (see MASTER CHECKLIST below), or wait for Plutus Setup Wizard to automate this.

---

## Architecture

```
Amazon FBA Warehouse (Physical Reality)
        │
        ├──────────────────────────────────────┐
        │                                      │
        ▼                                      ▼
Settlement Report                    Manual Inventory Count
(what Amazon paid you)               (Amazon Seller Central)
        │                                      │
        ▼                                      │
       LMB ─────────► QBO ◄─────── Plutus ◄────┘
                       │
              ┌────────┴────────┐
              │                 │
         Revenue/Fees     Inventory Asset
         (LMB posts)      COGS (Plutus posts)
```

### Responsibility Split

| System | Data Source | Posts to QBO |
|--------|-------------|--------------|
| LMB | Settlement Report | Revenue, Refunds, Fees (by brand via Product Groups) |
| Plutus | LMB Audit Data CSV (manual upload) | COGS (by brand, by component) |
| Plutus | Amazon Seller Central (manual count) | Reconciliation adjustments |
| Plutus | QBO Bills | Landed cost extraction |

### Inventory Audit Trail Principle

**Every inventory movement must be linked to a source document. No arbitrary opening balances allowed.**

| Movement | Source Document | Ledger Entry |
|----------|-----------------|--------------|
| Inventory IN | QBO Bill (with PO in Memo) | type=PURCHASE, qty=+N |
| Inventory OUT | LMB Settlement (via Audit Data CSV) | type=SALE, qty=-N |
| Return to Inventory | LMB Settlement (refund matched to order) | type=RETURN, qty=+N |
| Shrinkage/Adjustment | Monthly Reconciliation | type=ADJUSTMENT, qty=±N |
| Opening Position | Amazon Inventory Report + Valuation | type=OPENING_SNAPSHOT, qty=+N |

**Historical Catch-Up:** New users starting from a specific date must either:
1. Process all historical bills and settlements from the beginning, OR
2. Provide an Opening Snapshot (sourced from Amazon inventory report + accountant valuation)

See Setup Wizard Step 8 and V1 Constraint #9.

---

### V1 Constraints and Processing Rules

**These are explicit v1 design decisions to keep the initial implementation simple and reliable.**

#### 1. USD-Only Bills (v1 Constraint)
All supplier bills must be in USD. Multi-currency bill support is deferred to v2.
- Manufacturing invoices from China: typically invoiced in USD ✓
- Freight invoices: typically invoiced in USD ✓
- Duty bills: typically in USD (or convert before entry) ✓

If a bill arrives in non-USD, user must convert and enter the USD equivalent.

#### 2. Late Freight/Duty Policy (v1 Behavior)
If units are sold before all cost components (freight, duty) are entered:
- Late freight/duty increases inventory value for **remaining on-hand units only**
- Full bill amount is absorbed by remaining inventory, then flows to future COGS
- No catch-up JE for already-sold units in v1

**Algorithm (prevents inventory drift):**
```
When late freight bill arrives for PO:
1. Split freight across SKUs in PO by original PO units (allocation rule)
2. For each SKU:
   - Get on-hand quantity from InventoryLedger as-of bill date
   - If on_hand > 0:
     - Add allocated freight to that SKU's inventory value
     - Recompute average: new_avg = (current_value + allocated_freight) / on_hand_units
   - If on_hand = 0:
     - BLOCK (see edge case below)
```

**Example:**
- PO-2026-001: 1000 units, $5,000 manufacturing = $5.00/unit
- 200 units sold before freight arrives
- Freight bill: $500
- Allocation: $500 / 1000 PO units = $0.50 per original PO unit
- But applied to 800 on-hand: $500 / 800 = $0.625 per remaining unit
- Result: Full $500 absorbed into remaining inventory → flows to future COGS

**⚠️ EDGE CASE: On-Hand = 0 (Inventory Depleted)**

If late cost bill arrives and on-hand units = 0 for any SKU in the PO:
```
BLOCK MESSAGE (with actionable details):
─────────────────────────────────────────────────────────────────
❌ Cannot Apply Late Cost

PO Number:        PO-2026-001
Bill Type:        Freight
Bill TxnDate:     2026-02-15
SKU:              CS-007

Problem: On-hand = 0 as-of 2026-02-15
         Inventory was depleted by settlements before this bill date.

Depleting settlements:
  • Invoice 12345678 (processed 2026-02-10) - sold 500 units
  • Invoice 12345679 (processed 2026-02-12) - sold 300 units

Options:
  (a) Backdate bill TxnDate to before 2026-02-10 (earliest depletion)
  (b) Create manual COGS JE to expense this cost directly
  (c) Accept cost is unallocated (not recommended)

[Edit Bill in QBO]  [Create Manual JE]  [Skip This Bill]
─────────────────────────────────────────────────────────────────
```

User options:
(a) Backdate the bill to before inventory was depleted
(b) Create manual COGS JE to expense directly (accountant decision)
(c) Accept that this cost is "lost" for COGS purposes (not recommended)

v2 will add: Retroactive COGS adjustment for already-sold units

This is a data entry timing issue. Prevention is better than cure.

**User guidance:** Enter all bills for a PO before processing settlements that contain those SKUs.

**⚠️ Bill Effective Date Rule (v1):**
"Bill date" always means the QBO `TxnDate` field (the accounting date on the bill), NOT when the bill was entered into QBO.

```
Example:
- User enters freight bill on March 15
- Bill TxnDate is set to January 20
- Plutus computes on-hand units as-of January 20 (not March 15)
```

This means users CAN backdate bills to apply costs to an earlier period. However, if the bill's TxnDate is before the most recent processed settlement for those SKUs, the costs will NOT retroactively adjust already-posted COGS.

#### 3. Refund Matching Rule
Refund rows in Audit Data CSV contain both Order ID and SKU. Matching uses:
- Primary key: **(Order ID + SKU)** to locate the original sale row
- Fallback: Order ID alone only if order contains a single SKU

From the matched sale row, Plutus retrieves:
- Original sale date (for historical cost lookup)
- Quantity (for COGS reversal)

**⚠️ Partial Refund Guardrail:**
```
If refund amount is significantly less than expected for full unit reversal:
- Flag as "Possible partial refund / promo adjustment"
- Require user review before creating RETURN ledger entry
- Options: (a) Confirm full unit return, (b) Skip COGS reversal, (c) Manual qty entry

Why: Partial refunds (e.g., $5 refund on $25 item) may not represent physical returns.
Automatically reversing COGS overstates inventory.
```

#### 4. Cost Allocation Rule
Freight and Duty bills are allocated **across SKUs by units in the PO**:
```
SKU's share of freight = (SKU units in PO / Total PO units) × Total freight bill
```

**Two-step process:**
1. **Allocation (across SKUs):** Split freight/duty by PO units per SKU
2. **Application (to inventory):** Apply SKU's share to on-hand units at bill date (see Late Freight rule #2)

Value-based allocation (proportional to manufacturing cost) is not used in v1 because products are similar-sized drop cloths.

**"Units" defined:** The quantity from bill line descriptions (e.g., "CS-007 x 500 units" = 500 units).

#### 5. CSV Grouping Rule
When processing Audit Data CSV:
- Canonical grouping key: **`Invoice` column** (LMB invoice number)
- All rows with same Invoice value belong to one settlement posting
- Multiple Invoice values in one CSV = multiple settlements to process

#### 6. Idempotency Rule (Prevent Double-Posting)
Before processing a settlement:

**Idempotency Key:** `(marketplace, invoiceId, processingHash)`

```
1. Extract marketplace from CSV 'market' column
2. Extract invoiceId from CSV 'Invoice' column
3. Compute processingHash of normalized CSV rows (SKU, Quantity, amounts)
4. Query: SELECT * FROM Settlement
   WHERE marketplace = ? AND invoiceId = ? AND processingHash = ?
5. If exact match: Block, show "Already processed"
6. If same marketplace+invoiceId but different hash:
   Warn "Settlement exists with different data. Reprocess required."
   - User must void prior JE in QBO first
   - Then delete Plutus settlement record
   - Then re-upload CSV
```

**Stored for debugging:**
- `normalizedRowCount`: Number of rows in CSV
- `sourceFilename`: Original filename
- `uploadedAt`: Timestamp

#### 7. Journal Entry Memo Format
When posting COGS JEs to QBO, use this memo format for easy identification:
```
Plutus COGS | Invoice: 18129565 | Hash: abc123def
```
This allows users to reliably find and void the correct JE during manual rollback.

Fields:
- `Invoice`: LMB Invoice ID from CSV
- `Hash`: First 10 chars of processingHash

#### 8. No QBO Polling for LMB Settlements
Plutus does NOT poll QBO to detect LMB postings. The user is responsible for:
1. Checking LMB for settlements ready to post
2. Downloading Audit Data CSV from LMB
3. Uploading CSV to Plutus

This keeps the architecture simple and avoids issues with LMB posting Journal Entries vs Invoices.

#### 9. Opening Snapshot (for Catch-Up Mode)
"No arbitrary opening balances" does NOT mean "no opening position." For catch-up mode:

**Allowed:** Opening Inventory Snapshot backed by source documents:
```
type = OPENING_SNAPSHOT
sourceRef = "Amazon Inventory Report 2025-01-01"
notes = "Starting inventory for catch-up from 2025-01-01"
```

**Required sources:**
- Amazon FBA Inventory Report (units by SKU) - mandatory
- Plus ONE of:
  - Accountant's valuation (component breakdown), OR
  - Computed from historical bills if available in QBO

**NOT allowed:** User typing "I think I have 500 units worth $2,500" without documentation.

**Wizard behavior:** If user selects "Catch up from specific date", prompt for:
1. Amazon inventory report file (upload)
2. Valuation source (accountant OR "compute from bills")

**⚠️ CRITICAL: QBO Opening Initialization JE**

When creating an Opening Snapshot, Plutus must ALSO create (or instruct user to create) a QBO Journal Entry to initialize the inventory sub-account balances. Without this, QBO sub-accounts start at $0 and will go NEGATIVE on the first COGS posting.

```
Opening Inventory Initialization JE
Date: [Catch-up start date, e.g., 2025-01-01]

DEBITS (Inventory Asset sub-accounts):
  Inv Manufacturing - US    $X,XXX.XX
  Inv Freight - US          $XXX.XX
  Inv Duty - US             $XXX.XX
  Inv Mfg Accessories - US  $XX.XX
  Inv Manufacturing - UK    $X,XXX.XX
  ... (all component sub-accounts)

CREDITS:
  Opening Balance Equity                 $Total
  (or accountant-specified equity account)

Memo: "Plutus Opening Snapshot | Source: Amazon Inventory 2025-01-01 + [valuation source]"
```

**Options:**
1. Plutus auto-creates this JE via QBO API (recommended)
2. Plutus generates JE details for user to enter manually
3. User's accountant creates the JE (Plutus provides the amounts)

This keeps Plutus ledger and QBO balance sheet aligned from day 1.

#### 10. Refund Matching (DB-First)
When processing refunds, match against Plutus database FIRST, not just the uploaded CSV:

```
1. Query: SELECT * FROM InventoryLedger
   WHERE marketplace = ? AND orderId = ? AND sku = ? AND type = 'SALE'
2. If found → use stored component costs for reversal
3. If not found in DB → check current CSV file
4. If still not found → flag for user action:
   "Original sale not found. Upload CSV covering order date, or skip."
```

This handles cross-period refunds (January refund for October sale) without requiring massive CSV uploads.

#### 11. Rounding Policy (JE Balancing by Construction)
JEs must balance to the penny. We eliminate rounding variance by construction:

```
For each component (Mfg, Freight, Duty, MfgAcc) per brand:
1. Sum all SKU costs at 4-decimal precision
2. Round the COMPONENT TOTAL to 2 decimals (HALF_UP)
3. Use the SAME rounded total for both debit (COGS) and credit (Inv Asset)

Result: Debits = Credits by construction. No separate rounding account needed.
```

**Example:**
```
Settlement has 3 SKUs sold (all US brand):
  CS-007: Mfg $50.1234, Freight $5.0123, Duty $2.5012
  CS-010: Mfg $75.4567, Freight $7.5234, Duty $3.7523
  CS-012: Mfg $25.8765, Freight $2.5876, Duty $1.2934

Step 1: Sum components at 4-decimal precision
  Mfg Total:     $151.4566
  Freight Total: $15.1233
  Duty Total:    $7.5469

Step 2: Round each total to 2 decimals
  Mfg:     $151.46
  Freight: $15.12
  Duty:    $7.55

Step 3: Use same rounded values for both sides
DEBITS (COGS):
  Manufacturing - US-Dust Sheets     $151.46
  Freight - US-Dust Sheets           $15.12
  Duty - US-Dust Sheets              $7.55
  Total Debits:                      $174.13

CREDITS (Inventory Asset):
  Inv Manufacturing - US-Dust Sheets $151.46
  Inv Freight - US-Dust Sheets       $15.12
  Inv Duty - US-Dust Sheets          $7.55
  Total Credits:                     $174.13

Result: Balanced! (No rounding account needed)
```

**Why this works:** We round totals, not individual SKU amounts. Since debits and credits come from the same rounded totals, they're guaranteed equal.

#### 12. Mixed-Brand PO Constraint (v1)
**One PO may contain only one brand (one marketplace).**

If a shipment contains SKUs for both US and UK brands:
- User must create separate POs (PO-2026-001-US, PO-2026-001-UK)
- Freight/duty bills must be split into separate lines per brand
- This ensures QBO inventory accounts stay correct at bill entry

v2 may add a "Freight Clearing" account pattern for mixed shipments.

#### 13. Order-Line Ledger Granularity (Critical for Refunds)
**Sales must be stored in InventoryLedger at order-line level, not aggregated.**

```
For each sale row in CSV:
- Create ONE InventoryLedger entry with (orderId, sku, date, qty, component costs)
- Do NOT aggregate multiple orders into one ledger entry

Why: Refund matching queries by (marketplace, orderId, sku) to find original costs.
If sales are aggregated, refund matching breaks for cross-period refunds.
```

JE creation can still aggregate totals by (brand, component) for readability.

#### 14. Immutable Cost Snapshots (No Retro-Costing)
**Once a settlement is PROCESSED, its ledger entries are append-only and never re-costed.**

```
Rule: InventoryLedger entries from processed settlements are IMMUTABLE.

Implications:
- A late freight bill CANNOT retroactively change COGS already posted
- Backdated bill TxnDate affects future COGS, not past
- Reprocessing = explicit workflow (void JE → delete settlement → re-upload)

Why: Auditability, refund reversal correctness, reconciliation explainability.
```

#### 15. Date Normalization (Midnight UTC)
**All dates stored as date-only (not datetime) or normalized to midnight UTC.**

```
- Bill TxnDate → store as DATE (no time component)
- Settlement period dates → DATE only
- InventoryLedger.date → DATE only

Why: Prevents cross-timezone issues creating phantom "as-of" errors.
Example: A bill dated "2026-01-15" should be "2026-01-15" everywhere,
not "2026-01-14T23:00:00Z" in some time zones.
```

#### 16. QBO Duplicate JE Safety Check (Two-Tier Idempotency)
**Before creating a JE, verify it doesn't already exist in QBO.**

```
Tier 1: DB idempotency (existing)
- Check Settlement table for (marketplace, invoiceId, processingHash)

Tier 2: QBO duplicate safety (additional guard)
- Before creating JE, search QBO for existing JE:
  - Date range: postingDate ± 7 days
  - Memo contains: "Plutus COGS | Invoice: <invoiceId>"
- If found → BLOCK with message:
  "JE already exists in QBO for this invoice. Import may have been
   partially completed earlier. Verify and delete QBO JE if needed."

Why: Prevents double-posting if:
- Deploy/DB reset occurs
- QBO write succeeded but DB commit failed
- Someone manually deleted Settlement record but not the JE
```

#### 17. Same-Day Event Ordering (Deterministic Ledger)
**When multiple InventoryLedger events share the same date, order deterministically.**

```
Sort order for same-day events: (date, typePriority, createdAt, id)

Type priority (process in this order):
1. OPENING_SNAPSHOT (first - establishes baseline)
2. PURCHASE (adds units)
3. COST_ADJUSTMENT (modifies values, not quantities)
4. SALE (removes units)
5. RETURN (adds units back)
6. ADJUSTMENT (reconciliation corrections)

Why: Prevents "same-day weirdness" where event order affects computed
averages or on-hand counts. Makes ledger replay deterministic.
```

#### 18. Marketplace Normalization (Canonical Values)
**Normalize marketplace values at ingestion. Store only canonical forms.**

```
CSV 'market' column may contain: "Amazon.com", "amazon.com", "US", "Amazon.co.uk", etc.

Canonical values (store only these):
- amazon.com
- amazon.co.uk

Normalization function (apply everywhere):
- Trim whitespace
- Lowercase
- Map known variants:
  - "US", "Amazon.com", "amazon.com" → "amazon.com"
  - "UK", "Amazon.co.uk", "amazon.co.uk" → "amazon.co.uk"

Why: Every key that includes marketplace depends on consistent values:
- Idempotency: (marketplace, invoiceId, processingHash)
- Refund matching: (marketplace, orderId, sku)
- SKU costs: (sku, marketplace)
- Brand mapping: marketplace → brand

Without normalization, lookups fail silently or return wrong data.
```

---

## Brands

| Brand | Marketplace | Status |
|-------|-------------|--------|
| UK-Dust Sheets | Amazon.co.uk | Active |
| US-Dust Sheets | Amazon.com | Active |
| US-Shoe Bag | Amazon.com | Future |

---

## COGS Components

| Component | Description | Goes to Inventory Asset? |
|-----------|-------------|--------------------------|
| Manufacturing | Product cost from supplier | Yes |
| Freight | International shipping (sea/air freight) | Yes |
| Duty | Import duty/customs charges | Yes |
| Mfg Accessories | Packaging, labels, inserts | Yes |
| Land Freight | Local shipping (3PL → Amazon FC) | No (direct expense) |
| Storage 3PL | 3PL warehouse storage fees | No (direct expense) |

**Note:** Land Freight and Storage 3PL go directly to COGS when billed (not capitalized to inventory) because they're period costs that are difficult to tie to specific units.

---

# PHASE 0: QBO CLEANUP

## Step 0.1: Delete Duplicate Accounts

These accounts are duplicates of LMB-created accounts. Delete them:

| Account to Delete | Type | Reason |
|-------------------|------|--------|
| Amazon Sales | Income | LMB uses LMB1: Amazon Sales |
| Amazon Refunds | Income | LMB uses LMB10: Amazon Refunds |
| Amazon Reimbursement | Income | LMB uses LMB2 |
| Amazon Reimbursements | Income | Duplicate + wrong type |
| Amazon Shipping | Income | Non-standard |
| Amazon Advertising | COGS | LMB uses LMB6 |
| Amazon FBA Fees | COGS | LMB uses LMB4 |
| Amazon Seller Fees | COGS | LMB uses LMB3 |
| Amazon Storage Fees | COGS | LMB uses LMB5 |
| Amazon FBA Inventory Reimbursement | Other Income | LMB uses LMB2 |
| Amazon Carried Balances | Other Current Assets | Wrong detail type + non-standard |
| Amazon Pending Balances | Other Current Assets | Wrong detail type + non-standard |
| Amazon Deferred Balances | Other Current Assets | LMB uses LMB9d |
| Amazon Reserved Balances | Other Current Assets | LMB uses LMB9 |
| Amazon Split Month Rollovers | Other Current Assets | LMB uses LMB9A |
| Amazon Loans | Other Current Liabilities | LMB uses LMB8 |
| Amazon Sales Tax | Other Current Liabilities | LMB uses LMB7 |
| Amazon Sales Tax Collected | Other Current Liabilities | Duplicate |

**Total: 18 accounts to delete**

**Note:** If any account has transactions, make it inactive instead or move transactions first.

## Step 0.2: Keep These Accounts (Plutus will use)

| Account | Type | Detail Type | Purpose |
|---------|------|-------------|---------|
| Inventory Asset | Other Current Assets | Inventory | Parent for component sub-accounts |
| Manufacturing | COGS | Supplies & Materials - COGS | Parent for brand sub-accounts |
| Freight & Custom Duty | COGS | Shipping, Freight & Delivery - COS | Parent for brand sub-accounts |
| Land Freight | COGS | Shipping, Freight & Delivery - COS | Parent for brand sub-accounts |
| Storage 3PL | COGS | Shipping, Freight & Delivery - COS | Parent for brand sub-accounts |

---

# PHASE 1: QBO ACCOUNT CREATION

**Note:** The Plutus Setup Wizard automates Phase 1. It creates ALL brand sub-accounts:
- **Inventory Asset + COGS** (Plutus posts to these)
- **Revenue + Fee sub-accounts** (LMB posts to these via Product Groups)

The account names below are **suggestions** - users can customize names during setup. See `plutus-setup-wizard-ui.md` for the UI flow.

**What the Setup Wizard does:**
- Step 2: User acknowledges LMB Accounts & Taxes Wizard is complete (creates parent accounts)
- Step 3: Lets user define brand names
- Step 4: Creates ALL sub-accounts (38 total: 8 Inv Asset + 14 COGS + 16 Revenue/Fee)

## MASTER CHECKLIST - ALL ACCOUNTS

This is the complete list of accounts needed. The Plutus Setup Wizard creates sub-accounts automatically.

**⚠️ QBO Account Naming Convention:**
- **Name** = The leaf account name you create (e.g., `Manufacturing - US-Dust Sheets`)
- **FullyQualifiedName** = Display path with colons (e.g., `Inventory Asset:Inv Manufacturing - US-Dust Sheets`)
- Do NOT include colons in the `Name` field when creating accounts - QBO adds them automatically for sub-accounts
- In this document, tables show FullyQualifiedName for clarity, but create accounts using just the leaf Name

**Account Summary (for 2 brands):**
- 2 Plutus parent accounts to create (Mfg Accessories, Inventory Shrinkage)
- 5 Plutus parent accounts (should exist: Inventory Asset, Manufacturing, Freight & Duty, Land Freight, Storage 3PL)
- 8 LMB parent accounts (created by LMB wizard - listed for reference)
- 38 sub-accounts (Setup Wizard creates these: 8 Inv Asset + 14 COGS + 16 Revenue/Fee)

### PARENT ACCOUNTS TO CREATE (2 accounts)

| # | Account Name | Account Type | Detail Type | Status |
|---|--------------|--------------|-------------|--------|
| 1 | Mfg Accessories | Cost of Goods Sold | Supplies & Materials - COGS | ❌ MISSING |
| 2 | Inventory Shrinkage | Cost of Goods Sold | Other Costs of Services - COS | ❌ MISSING |

### EXISTING PLUTUS PARENT ACCOUNTS (5 accounts - verify these exist)

| # | Account Name | Account Type | Detail Type | Purpose |
|---|--------------|--------------|-------------|---------|
| 1 | Inventory Asset | Other Current Assets | Inventory | Parent for inventory component sub-accounts |
| 2 | Manufacturing | Cost of Goods Sold | Supplies & Materials - COGS | Parent for manufacturing COGS sub-accounts |
| 3 | Freight & Custom Duty | Cost of Goods Sold | Shipping, Freight & Delivery - COS | Parent for freight + duty COGS sub-accounts |
| 4 | Land Freight | Cost of Goods Sold | Shipping, Freight & Delivery - COS | Parent for land freight COGS sub-accounts |
| 5 | Storage 3PL | Cost of Goods Sold | Shipping, Freight & Delivery - COS | Parent for 3PL storage COGS sub-accounts |

### LMB PARENT ACCOUNTS (created by LMB Accounts & Taxes Wizard)

These accounts are created when you complete the LMB wizard. **Account names shown are LMB defaults - users can name them anything.** Plutus doesn't need to know these account names.

| # | Account Name | Account Type | Detail Type | Status |
|---|--------------|--------------|-------------|--------|
| 1 | Amazon Sales | Income | Sales of Product Income | ✅ EXISTS |
| 2 | Amazon Refunds | Income | Discounts/Refunds Given | ✅ EXISTS |
| 3 | Amazon FBA Inventory Reimbursement | Other Income | Other Miscellaneous Income | ✅ EXISTS |
| 4 | Amazon Seller Fees | Cost of Goods Sold | Shipping, Freight & Delivery - COS | ✅ EXISTS |
| 5 | Amazon FBA Fees | Cost of Goods Sold | Shipping, Freight & Delivery - COS | ✅ EXISTS |
| 6 | Amazon Storage Fees | Cost of Goods Sold | Shipping, Freight & Delivery - COS | ✅ EXISTS |
| 7 | Amazon Advertising Costs | Cost of Goods Sold | Shipping, Freight & Delivery - COS | ✅ EXISTS |
| 8 | Amazon Promotions | Cost of Goods Sold | Other Costs of Services - COS | ✅ EXISTS |

### INCOME SUB-ACCOUNTS (6 accounts) - Created by Plutus, LMB posts here

| # | Account Name | Parent Account | Account Type | Detail Type | Status |
|---|--------------|----------------|--------------|-------------|--------|
| 1 | Amazon Sales - US-Dust Sheets | Amazon Sales | Income | Sales of Product Income | ✅ DONE |
| 2 | Amazon Sales - UK-Dust Sheets | Amazon Sales | Income | Sales of Product Income | ✅ DONE |
| 3 | Amazon Refunds - US-Dust Sheets | Amazon Refunds | Income | Discounts/Refunds Given | ✅ DONE |
| 4 | Amazon Refunds - UK-Dust Sheets | Amazon Refunds | Income | Discounts/Refunds Given | ✅ DONE |
| 5 | Amazon FBA Inventory Reimbursement - US-Dust Sheets | Amazon FBA Inventory Reimbursement | Other Income | Other Miscellaneous Income | ✅ DONE |
| 6 | Amazon FBA Inventory Reimbursement - UK-Dust Sheets | Amazon FBA Inventory Reimbursement | Other Income | Other Miscellaneous Income | ✅ DONE |

### FEE SUB-ACCOUNTS (10 accounts) - Created by Plutus, LMB posts here

| # | Account Name | Parent Account | Account Type | Detail Type | Status |
|---|--------------|----------------|--------------|-------------|--------|
| 1 | Amazon Seller Fees - US-Dust Sheets | Amazon Seller Fees | Cost of Goods Sold | Shipping, Freight & Delivery - COS | ✅ DONE |
| 2 | Amazon Seller Fees - UK-Dust Sheets | Amazon Seller Fees | Cost of Goods Sold | Shipping, Freight & Delivery - COS | ✅ DONE |
| 3 | Amazon FBA Fees - US-Dust Sheets | Amazon FBA Fees | Cost of Goods Sold | Shipping, Freight & Delivery - COS | ✅ DONE |
| 4 | Amazon FBA Fees - UK-Dust Sheets | Amazon FBA Fees | Cost of Goods Sold | Shipping, Freight & Delivery - COS | ✅ DONE |
| 5 | Amazon Storage Fees - US-Dust Sheets | Amazon Storage Fees | Cost of Goods Sold | Shipping, Freight & Delivery - COS | ✅ DONE |
| 6 | Amazon Storage Fees - UK-Dust Sheets | Amazon Storage Fees | Cost of Goods Sold | Shipping, Freight & Delivery - COS | ✅ DONE |
| 7 | Amazon Advertising Costs - US-Dust Sheets | Amazon Advertising Costs | Cost of Goods Sold | Shipping, Freight & Delivery - COS | ✅ DONE |
| 8 | Amazon Advertising Costs - UK-Dust Sheets | Amazon Advertising Costs | Cost of Goods Sold | Shipping, Freight & Delivery - COS | ✅ DONE |
| 9 | Amazon Promotions - US-Dust Sheets | Amazon Promotions | Cost of Goods Sold | Other Costs of Services - COS | ✅ DONE |
| 10 | Amazon Promotions - UK-Dust Sheets | Amazon Promotions | Cost of Goods Sold | Other Costs of Services - COS | ✅ DONE |

### INVENTORY ASSET SUB-ACCOUNTS (8 accounts) - Plutus posts here

**⚠️ NAMING: QBO requires unique Account.Name across all accounts.** Since COGS accounts use names like "Manufacturing - US-Dust Sheets", we prefix Inventory Asset accounts with "Inv" to avoid collisions.

| # | Account Name (Leaf) | Parent Account | Account Type | Detail Type | Status |
|---|---------------------|----------------|--------------|-------------|--------|
| 1 | Inv Manufacturing - US-Dust Sheets | Inventory Asset | Other Current Assets | Inventory | ❌ MISSING |
| 2 | Inv Manufacturing - UK-Dust Sheets | Inventory Asset | Other Current Assets | Inventory | ❌ MISSING |
| 3 | Inv Freight - US-Dust Sheets | Inventory Asset | Other Current Assets | Inventory | ❌ MISSING |
| 4 | Inv Freight - UK-Dust Sheets | Inventory Asset | Other Current Assets | Inventory | ❌ MISSING |
| 5 | Inv Duty - US-Dust Sheets | Inventory Asset | Other Current Assets | Inventory | ❌ MISSING |
| 6 | Inv Duty - UK-Dust Sheets | Inventory Asset | Other Current Assets | Inventory | ❌ MISSING |
| 7 | Inv Mfg Accessories - US-Dust Sheets | Inventory Asset | Other Current Assets | Inventory | ❌ MISSING |
| 8 | Inv Mfg Accessories - UK-Dust Sheets | Inventory Asset | Other Current Assets | Inventory | ❌ MISSING |

**FullyQualifiedName in QBO:** `Inventory Asset:Inv Manufacturing - US-Dust Sheets`

### COGS SUB-ACCOUNTS (14 total, all brand-specific)

**Posting responsibility:**
- **Plutus posts:** Manufacturing, Freight, Duty, Mfg Accessories (4 components × 2 brands = 8 accounts)
- **Plutus posts (reconciliation):** Inventory Shrinkage (2 brand accounts)
- **Manual (user enters bills directly):** Land Freight, Storage 3PL (2 components × 2 brands = 4 accounts)

| # | Account Name | Parent Account | Account Type | Detail Type | Posted By |
|---|--------------|----------------|--------------|-------------|-----------|
| 1 | Manufacturing - US-Dust Sheets | Manufacturing | Cost of Goods Sold | Supplies & Materials - COGS | Plutus |
| 2 | Manufacturing - UK-Dust Sheets | Manufacturing | Cost of Goods Sold | Supplies & Materials - COGS | Plutus |
| 3 | Freight - US-Dust Sheets | Freight & Custom Duty | Cost of Goods Sold | Shipping, Freight & Delivery - COS | Plutus |
| 4 | Freight - UK-Dust Sheets | Freight & Custom Duty | Cost of Goods Sold | Shipping, Freight & Delivery - COS | Plutus |
| 5 | Duty - US-Dust Sheets | Freight & Custom Duty | Cost of Goods Sold | Shipping, Freight & Delivery - COS | Plutus |
| 6 | Duty - UK-Dust Sheets | Freight & Custom Duty | Cost of Goods Sold | Shipping, Freight & Delivery - COS | Plutus |
| 7 | Land Freight - US-Dust Sheets | Land Freight | Cost of Goods Sold | Shipping, Freight & Delivery - COS | Manual |
| 8 | Land Freight - UK-Dust Sheets | Land Freight | Cost of Goods Sold | Shipping, Freight & Delivery - COS | Manual |
| 9 | Storage 3PL - US-Dust Sheets | Storage 3PL | Cost of Goods Sold | Shipping, Freight & Delivery - COS | Manual |
| 10 | Storage 3PL - UK-Dust Sheets | Storage 3PL | Cost of Goods Sold | Shipping, Freight & Delivery - COS | Manual |
| 11 | Mfg Accessories - US-Dust Sheets | Mfg Accessories | Cost of Goods Sold | Supplies & Materials - COGS | Plutus |
| 12 | Mfg Accessories - UK-Dust Sheets | Mfg Accessories | Cost of Goods Sold | Supplies & Materials - COGS | Plutus |
| 13 | Inventory Shrinkage - US-Dust Sheets | Inventory Shrinkage | Cost of Goods Sold | Other Costs of Services - COS | Plutus |
| 14 | Inventory Shrinkage - UK-Dust Sheets | Inventory Shrinkage | Cost of Goods Sold | Other Costs of Services - COS | Plutus |

**Notes:**
- All COGS accounts are brand-specific → brand P&Ls (for Amazon ops) sum to exactly 100%
- No shared Rounding account needed (see Rounding Policy below)
- Land Freight and Storage 3PL bills are entered directly to COGS (not capitalized) - see Step 4.5 and 4.6

### SUMMARY

| Category | Total | Done | Missing | Created By |
|----------|-------|------|---------|------------|
| Plutus parent accounts (new) | 2 | 0 | 2 | Setup Wizard |
| Income sub-accounts | 6 | 6 | 0 | Setup Wizard (or manual) |
| Fee sub-accounts | 10 | 10 | 0 | Setup Wizard (or manual) |
| Inventory Asset sub-accounts | 8 | 0 | 8 | Setup Wizard |
| COGS component sub-accounts | 12 | 0 | 12 | Setup Wizard |
| COGS Shrinkage sub-accounts | 2 | 0 | 2 | Setup Wizard |
| **SUB-ACCOUNTS TOTAL** | **38** | **16** | **22** | |

**Note:** For this specific QBO (Targon), Revenue/Fee sub-accounts were created manually. For new users, Setup Wizard creates all 38 sub-accounts.

---

## Step 1.1: Create New Parent Accounts

Create these new parent accounts in QBO:

| Account Name | Account Type | Detail Type |
|--------------|--------------|-------------|
| Mfg Accessories | Cost of Goods Sold | Supplies & Materials - COGS |
| Inventory Shrinkage | Cost of Goods Sold | Other Costs of Services - COS |

## Step 1.2: Create Income Sub-Accounts

Create sub-accounts under existing LMB parent accounts:

**Under LMB1: Amazon Sales**
| Sub-Account Name | Account Type | Detail Type |
|------------------|--------------|-------------|
| Amazon Sales - US-Dust Sheets | Income | Sales of Product Income |
| Amazon Sales - UK-Dust Sheets | Income | Sales of Product Income |

**Under LMB10: Amazon Refunds**
| Sub-Account Name | Account Type | Detail Type |
|------------------|--------------|-------------|
| Amazon Refunds - US-Dust Sheets | Income | Discounts/Refunds Given |
| Amazon Refunds - UK-Dust Sheets | Income | Discounts/Refunds Given |

**Under LMB2: Amazon FBA Inventory Reimbursement**
| Sub-Account Name | Account Type | Detail Type |
|------------------|--------------|-------------|
| Amazon FBA Inventory Reimbursement - US-Dust Sheets | Other Income | Other Miscellaneous Income |
| Amazon FBA Inventory Reimbursement - UK-Dust Sheets | Other Income | Other Miscellaneous Income |

## Step 1.3: Create Fee Sub-Accounts (COGS)

**Under LMB3: Amazon Seller Fees**
| Sub-Account Name | Account Type | Detail Type |
|------------------|--------------|-------------|
| Amazon Seller Fees - US-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| Amazon Seller Fees - UK-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |

**Under LMB4: Amazon FBA Fees**
| Sub-Account Name | Account Type | Detail Type |
|------------------|--------------|-------------|
| Amazon FBA Fees - US-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| Amazon FBA Fees - UK-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |

**Under LMB5: Amazon Storage Fees**
| Sub-Account Name | Account Type | Detail Type |
|------------------|--------------|-------------|
| Amazon Storage Fees - US-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| Amazon Storage Fees - UK-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |

**Under LMB6: Amazon Advertising Costs**
| Sub-Account Name | Account Type | Detail Type |
|------------------|--------------|-------------|
| Amazon Advertising Costs - US-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| Amazon Advertising Costs - UK-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |

**Under Amazon Promotions (create parent if needed)**
| Sub-Account Name | Account Type | Detail Type |
|------------------|--------------|-------------|
| Amazon Promotions - US-Dust Sheets | Cost of Goods Sold | Other Costs of Services - COS |
| Amazon Promotions - UK-Dust Sheets | Cost of Goods Sold | Other Costs of Services - COS |

## Step 1.4: Create Inventory Asset Sub-Accounts

**⚠️ IMPORTANT: Use "Inv" prefix to avoid name collision with COGS accounts**

**Under Inventory Asset**
| Sub-Account Name | Account Type | Detail Type |
|------------------|--------------|-------------|
| Inv Manufacturing - US-Dust Sheets | Other Current Assets | Inventory |
| Inv Manufacturing - UK-Dust Sheets | Other Current Assets | Inventory |
| Inv Freight - US-Dust Sheets | Other Current Assets | Inventory |
| Inv Freight - UK-Dust Sheets | Other Current Assets | Inventory |
| Inv Duty - US-Dust Sheets | Other Current Assets | Inventory |
| Inv Duty - UK-Dust Sheets | Other Current Assets | Inventory |
| Inv Mfg Accessories - US-Dust Sheets | Other Current Assets | Inventory |
| Inv Mfg Accessories - UK-Dust Sheets | Other Current Assets | Inventory |

## Step 1.5: Create COGS Component Sub-Accounts

**Under Manufacturing**
| Sub-Account Name | Account Type | Detail Type |
|------------------|--------------|-------------|
| Manufacturing - US-Dust Sheets | Cost of Goods Sold | Supplies & Materials - COGS |
| Manufacturing - UK-Dust Sheets | Cost of Goods Sold | Supplies & Materials - COGS |

**Under Freight & Custom Duty**
| Sub-Account Name | Account Type | Detail Type |
|------------------|--------------|-------------|
| Freight - US-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| Freight - UK-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| Duty - US-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| Duty - UK-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |

**Under Land Freight**
| Sub-Account Name | Account Type | Detail Type |
|------------------|--------------|-------------|
| Land Freight - US-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| Land Freight - UK-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |

**Under Storage 3PL**
| Sub-Account Name | Account Type | Detail Type |
|------------------|--------------|-------------|
| Storage 3PL - US-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |
| Storage 3PL - UK-Dust Sheets | Cost of Goods Sold | Shipping, Freight & Delivery - COS |

**Under Mfg Accessories**
| Sub-Account Name | Account Type | Detail Type |
|------------------|--------------|-------------|
| Mfg Accessories - US-Dust Sheets | Cost of Goods Sold | Supplies & Materials - COGS |
| Mfg Accessories - UK-Dust Sheets | Cost of Goods Sold | Supplies & Materials - COGS |

## Step 1.6: Verification

After creating all accounts, verify against the MASTER CHECKLIST at the top of Phase 1.

**To verify in QBO:**
1. Go to Settings → Chart of Accounts
2. Filter by "Inventory Asset" - should see 8 sub-accounts
3. Filter by "Manufacturing" - should see 2 sub-accounts (US + UK)
4. Filter by "Freight" - should see 2 sub-accounts under "Freight & Custom Duty"
5. Filter by "Duty" - should see 2 sub-accounts under "Freight & Custom Duty"
6. Filter by "Land Freight" - should see 2 sub-accounts
7. Filter by "Storage 3PL" - should see 2 sub-accounts
8. Filter by "Mfg Accessories" - should see parent + 2 sub-accounts
9. Search for "Inventory Shrinkage" - should exist as parent account

---

# PHASE 2: LMB CONFIGURATION

**Note:** This phase corresponds to Plutus Setup Wizard Steps 2 and 6:
- Step 2: User acknowledges LMB Accounts & Taxes Wizard was completed
- Step 6: Guides user through Product Group setup (external checklist)

**Plutus does NOT need to know LMB account names.** LMB handles revenue/fees independently. Plutus only manages its own Inventory Asset and COGS accounts.

**Important:** You have TWO LMB connections - do Phase 2 for EACH:
- Targon - AMAZON NORTH AMERICA (US)
- Targon - AMAZON EUROPE (UK)

See Appendix F for connection-specific details.

## Step 2.1: Complete Setup Wizard (for EACH connection)

1. Go to LMB → Accounts & Taxes → Setup Wizard
2. Step 1: Select "Custom Chart Accounts"
3. Keep default LMB account mappings (these are fallbacks)
4. Step 2: Verify bank accounts:
   - **US Connection:** Chase Checking (USD) for deposits
   - **UK Connection:** Wise GBP account for deposits
5. Step 3: Confirm tax rates:
   - **US:** No Tax Rate Applicable (marketplace facilitator)
   - **UK:** Standard Rate 20% VAT
6. Complete wizard

## Step 2.2: Create Product Groups

Go to LMB → Inventory → Product Groups

**Create Group 1: US-Dust Sheets**
| Setting | Value |
|---------|-------|
| Group Name | US-Dust Sheets |
| Sales Account | Amazon Sales - US-Dust Sheets |
| Refunds Account | Amazon Refunds - US-Dust Sheets |
| FBA Fees Account | Amazon FBA Fees - US-Dust Sheets |
| Seller Fees Account | Amazon Seller Fees - US-Dust Sheets |
| Storage Fees Account | Amazon Storage Fees - US-Dust Sheets |
| Advertising Account | Amazon Advertising Costs - US-Dust Sheets |
| Promotions Account | Amazon Promotions - US-Dust Sheets |
| Reimbursement Account | Amazon FBA Inventory Reimbursement - US-Dust Sheets |
| COGS | OFF (Plutus handles) |

**Create Group 2: UK-Dust Sheets**
| Setting | Value |
|---------|-------|
| Group Name | UK-Dust Sheets |
| Sales Account | Amazon Sales - UK-Dust Sheets |
| Refunds Account | Amazon Refunds - UK-Dust Sheets |
| FBA Fees Account | Amazon FBA Fees - UK-Dust Sheets |
| Seller Fees Account | Amazon Seller Fees - UK-Dust Sheets |
| Storage Fees Account | Amazon Storage Fees - UK-Dust Sheets |
| Advertising Account | Amazon Advertising Costs - UK-Dust Sheets |
| Promotions Account | Amazon Promotions - UK-Dust Sheets |
| Reimbursement Account | Amazon FBA Inventory Reimbursement - UK-Dust Sheets |
| COGS | OFF (Plutus handles) |

## Step 2.3: Assign SKUs to Product Groups

Go to LMB → Inventory → Product Groups → Product SKUs tab

**US-Dust Sheets Group (4 SKUs):**
| SKU | ASIN | Product |
|-----|------|---------|
| CS-007 | B09HXC3NL8 | 6 Pack Plastic |
| CS-010 | B0CR1GSBQ9 | 3 Pack Plastic |
| CS-1SD-32M | B0FLKJ7WWM | 1 Pack Plastic |
| CS-12LD-7M | B0FP66CWQ6 | 12 Pack Plastic |

**UK-Dust Sheets Group (8 SKUs):**
| SKU | ASIN | Product |
|-----|------|---------|
| CS 007 | B09HXC3NL8 | 6 Pack Plastic |
| CS 008 | B0C7ZQ3VZL | 3 Pack Plastic (Light) |
| CS 009 | B0CR1H3VSF | 10 Pack Plastic |
| CS 010 | B0CR1GSBQ9 | 3 Pack Plastic |
| CS 011 | B0DHDTPGGP | 6 Pack Plastic |
| CS 1SD-32M | B0FLKJ7WWM | 1 Pack Plastic |
| CS-CDS-001 | B0CW3N48K1 | Cotton Dust Sheet (Small) |
| CS-CDS-002 | B0CW3L6PQH | Cotton Dust Sheet (Large) |

## Step 2.4: LMB Settings

Go to LMB → Settings → Settlement Settings

**For US Connection (Amazon North America):**
| Setting | Value |
|---------|-------|
| Product Grouping | ON |
| Fulfillment Type Grouping | OFF |
| Cost of Goods Sold | OFF |

**For UK Connection (Amazon Europe):**
| Setting | Value |
|---------|-------|
| Product Grouping | ON |
| Fulfillment Type Grouping | OFF |
| Cost of Goods Sold | OFF |
| VAT Scheme | Standard (see Appendix G) |

## Step 2.5: Create "Unassigned" Product Group (Safety Net)

Go to LMB → Inventory → Product Groups

**Create Group: UNASSIGNED**
| Setting | Value |
|---------|-------|
| Group Name | UNASSIGNED |
| Sales Account | Amazon Sales (parent - no brand suffix) |
| Refunds Account | Amazon Refunds (parent) |
| FBA Fees Account | Amazon FBA Fees (parent) |
| Seller Fees Account | Amazon Seller Fees (parent) |
| Storage Fees Account | Amazon Storage Fees (parent) |
| Advertising Account | Amazon Advertising Costs (parent) |
| Promotions Account | Amazon Promotions (parent) |
| Reimbursement Account | Amazon FBA Inventory Reimbursement (parent) |
| COGS | OFF |

**Set as Default:** In LMB settings, set UNASSIGNED as the default Product Group for unknown SKUs.

**Why:** If a new SKU appears that's not mapped to US-Dust Sheets or UK-Dust Sheets:
- Revenue still posts (not lost)
- Goes to parent accounts (not brand sub-accounts)
- Shows up in reports as "UNASSIGNED" - easy to spot
- You then add the SKU to correct Product Group for future settlements

## Step 2.6: Test LMB

1. Post one settlement manually
2. Check QBO → verify transactions landed in correct brand accounts
3. If wrong accounts → fix Product Group mappings
4. If unmapped SKU → add to correct Product Group

---

# PHASE 3: BILL ENTRY SETUP (PO Linking via Memo)

**Note:** This phase corresponds to Plutus Setup Wizard Step 7, which explains the bill memo format for PO linking.

## Step 3.1: PO Linking Strategy

Plutus links related bills (manufacturing, freight, duty) using the Bill's **Memo field** (PrivateNote in QBO API).

**Required Format:**
```
PO: PO-2026-001
```

**Why Memo instead of Custom Fields:**
- Custom Fields have API limitations (may require enhanced access, not queryable in sandbox)
- Memo (PrivateNote) is a standard Bill field, reliably readable via QBO API
- Server-side query: `SELECT * FROM Bill WHERE PrivateNote = 'PO: PO-2026-001'`
- Fallback: Pull bills by date range, filter client-side by memo prefix

**Strict Format Rules:**
- Start with `PO: ` (including the space after colon)
- Follow with PO number (e.g., `PO-2026-001`)
- No extra text in memo - keep it exactly this format
- Same format across all bills for the same PO

---

# PHASE 4: BILL ENTRY SOP

## Step 4.1: When New PO is Placed

1. Note the PO number: PO-YYYY-NNN
2. Record PO details (SKUs, quantities, expected costs)
3. You'll enter this PO number in the **Memo field** on all related bills

## Step 4.2: When Manufacturing Bill Arrives

**Example - exactly as it appears in QBO:**
```
┌─────────────────────────────────────────────────────────────────┐
│ BILL                                                            │
├─────────────────────────────────────────────────────────────────┤
│ Vendor:        Shenzhen Manufacturing Co                        │
│ Bill Date:     2025-01-15                                       │
│ Due Date:      2025-02-15                                       │
│ Bill No:       INV-2025-0042  (vendor's invoice number)         │
│ Memo:          PO: PO-2025-001    ← LINKS THIS BILL TO PO       │
├─────────────────────────────────────────────────────────────────┤
│ CATEGORY DETAILS (line items)                                   │
├───┬────────────────────────────────────────────────────────────────┬───────────┤
│ # │ ACCOUNT                                │ DESCRIPTION        │ AMOUNT    │
├───┼────────────────────────────────────────┼────────────────────┼───────────┤
│ 1 │ Inv Manufacturing - US-Du │ CS-007 x 500 units │ $1,250.00 │
│ 2 │ Inv Manufacturing - US-Du │ CS-010 x 500 units │ $1,250.00 │
├───┴────────────────────────────────────────┴────────────────────┴───────────┤
│ TOTAL                                                            $2,500.00 │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Field-by-field:**
| QBO Field | What to Enter |
|-----------|---------------|
| Vendor | Actual supplier name |
| Bill Date | Date on vendor's invoice |
| Due Date | Payment due date |
| Bill No | Vendor's invoice number (for your reference) |
| Memo | `PO: PO-YYYY-NNN` (links related bills) |
| Account | Inv Manufacturing - [Brand] |
| Description | SKU + quantity (e.g., "CS-007 x 500 units") |
| Amount | Cost for that line item |

**⚠️ Bill Parsing Validation (Manufacturing Bills Only):**
Plutus parses the Description field **on manufacturing bill lines only** to extract SKU and quantity.

**Supported formats for manufacturing lines:**
```
Pattern: [SKU] [separator] [quantity] [optional "units"]

Where:
- SKU = alphanumeric + spaces + hyphens (e.g., "CS-007", "CS 007", "CS 1SD-32M")
- Separator = "x", "×", or whitespace
- Quantity = integer
```

**Examples:**
- `CS-007 x 500 units` ✓
- `CS-007 x 500` ✓
- `CS-007 500 units` ✓
- `CS 007 x 500 units` ✓ (UK SKU with space)
- `CS 1SD-32M x 100` ✓ (UK SKU with space and hyphen)
- `CS007 500` ✗ (SKU must match known SKU list)
- `500 units CS-007` ✗ (wrong order - SKU must come first)

**Parser logic:**
1. Match against known SKU list (from SkuMapping table)
2. Extract quantity (first integer after SKU match)
3. Fail if no SKU match or no quantity found

**Freight/Duty/MfgAcc bills do NOT require SKU+qty parsing:**
- These are lump sums for the entire PO
- Description can be anything (e.g., "Ocean freight CHN→US", "Import duty 7.5%")
- Plutus allocates these across SKUs using the manufacturing bill's PO units

**PO Completeness Rules:**
| Component | Requirement |
|-----------|-------------|
| Manufacturing | ✅ Bill exists AND all lines parse to (SKU, qty) |
| Freight | ✅ Bill exists (amount only) |
| Duty | ✅ Bill exists OR user marks "no duty" |
| Mfg Accessories | Optional (if present, amount only) |

The Plutus Bill Review UI will show:
- ✅ PO complete (all required components present)
- ⚠️ PO incomplete (missing freight/duty OR unparseable mfg lines)
- ❌ Manufacturing line parse error (needs manual fix in QBO)

## Step 4.3: When Freight Bill Arrives

**Example - exactly as it appears in QBO:**
```
┌─────────────────────────────────────────────────────────────────┐
│ BILL                                                            │
├─────────────────────────────────────────────────────────────────┤
│ Vendor:        FastFreight Logistics                            │
│ Bill Date:     2025-01-20                                       │
│ Due Date:      2025-02-20                                       │
│ Bill No:       FF-78234                                         │
│ Memo:          PO: PO-2025-001    ← SAME AS MANUFACTURING BILL  │
├─────────────────────────────────────────────────────────────────┤
│ CATEGORY DETAILS                                                │
├───┬────────────────────────────────────────┬────────────────────┬───────────┤
│ # │ ACCOUNT                                │ DESCRIPTION        │ AMOUNT    │
├───┼────────────────────────────────────────┼────────────────────┼───────────┤
│ 1 │ Inv Freight - US-Dust She │ Ocean freight CHN→US│ $400.00  │
├───┴────────────────────────────────────────┴────────────────────┴───────────┤
│ TOTAL                                                              $400.00 │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key:** Same PO Number as manufacturing bill - this links them together for landed cost calculation.

## Step 4.4: When Duty Bill Arrives

**Example - exactly as it appears in QBO:**
```
┌─────────────────────────────────────────────────────────────────┐
│ BILL                                                            │
├─────────────────────────────────────────────────────────────────┤
│ Vendor:        ABC Customs Broker                               │
│ Bill Date:     2025-01-22                                       │
│ Due Date:      2025-02-22                                       │
│ Bill No:       CBR-2025-1234                                    │
│ Memo:          PO: PO-2025-001    ← SAME AS MANUFACTURING BILL  │
├─────────────────────────────────────────────────────────────────┤
│ CATEGORY DETAILS                                                │
├───┬────────────────────────────────────────┬────────────────────┬───────────┤
│ # │ ACCOUNT                                │ DESCRIPTION        │ AMOUNT    │
├───┼────────────────────────────────────────┼────────────────────┼───────────┤
│ 1 │ Inv Duty - US-Dust Sheets │ Import duty 7.5%   │ $187.50   │
├───┴────────────────────────────────────────┴────────────────────┴───────────┤
│ TOTAL                                                             $187.50  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Step 4.5: When Land Freight Bill Arrives

**Example - exactly as it appears in QBO:**
```
┌─────────────────────────────────────────────────────────────────┐
│ BILL                                                            │
├─────────────────────────────────────────────────────────────────┤
│ Vendor:        Local Trucking Inc                               │
│ Bill Date:     2025-01-25                                       │
│ Due Date:      2025-02-25                                       │
│ Bill No:       LT-9876                                          │
│ Memo:          PO: PO-2025-001    ← SAME AS MANUFACTURING BILL  │
├─────────────────────────────────────────────────────────────────┤
│ CATEGORY DETAILS                                                │
├───┬────────────────────────────────────────┬────────────────────┬───────────┤
│ # │ ACCOUNT                                │ DESCRIPTION        │ AMOUNT    │
├───┼────────────────────────────────────────┼────────────────────┼───────────┤
│ 1 │ Land Freight - US-Dust Sheets          │ 3PL → FBA transfer │ $150.00   │
├───┴────────────────────────────────────────┴────────────────────┴───────────┤
│ TOTAL                                                             $150.00  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Note:** Land Freight goes directly to **COGS** (not Inventory Asset) because:
- It's incurred AFTER goods arrive at 3PL
- It's a fulfillment cost, not a product cost
- Simplifies landed cost calculation

## Step 4.6: When 3PL Storage Bill Arrives

**Example - exactly as it appears in QBO:**
```
┌─────────────────────────────────────────────────────────────────┐
│ BILL                                                            │
├─────────────────────────────────────────────────────────────────┤
│ Vendor:        ShipBob / Prep Center                            │
│ Bill Date:     2025-01-31                                       │
│ Due Date:      2025-02-28                                       │
│ Bill No:       3PL-JAN-2025                                     │
│ Memo:          3PL storage January 2025                         │
├─────────────────────────────────────────────────────────────────┤
│ CATEGORY DETAILS                                                │
├───┬────────────────────────────────────────┬────────────────────┬───────────┤
│ # │ ACCOUNT                                │ DESCRIPTION        │ AMOUNT    │
├───┼────────────────────────────────────────┼────────────────────┼───────────┤
│ 1 │ Storage 3PL - US-Dust Sheets           │ 60% of storage     │ $300.00   │
│ 2 │ Storage 3PL - UK-Dust Sheets           │ 40% of storage     │ $200.00   │
├───┴────────────────────────────────────────┴────────────────────┴───────────┤
│ TOTAL                                                             $500.00  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Note:**
- 3PL storage goes directly to **COGS** (not Inventory Asset) - it's a period cost
- Split by brand based on estimated inventory % at 3PL
- NO PO Number needed - this is a recurring monthly cost, not tied to a specific shipment
- Plutus does NOT process this - entered manually in QBO

## Step 4.7: When Mfg Accessories Bill Arrives (Packaging, Labels, Inserts)

**Example - exactly as it appears in QBO:**
```
┌─────────────────────────────────────────────────────────────────┐
│ BILL                                                            │
├─────────────────────────────────────────────────────────────────┤
│ Vendor:        PackRight Supplies                               │
│ Bill Date:     2025-01-18                                       │
│ Due Date:      2025-02-18                                       │
│ Bill No:       PR-2025-456                                      │
│ Memo:          PO: PO-2025-001    ← SAME AS MANUFACTURING BILL  │
├─────────────────────────────────────────────────────────────────┤
│ CATEGORY DETAILS                                                │
├───┬────────────────────────────────────────┬────────────────────┬───────────┤
│ # │ ACCOUNT                                │ DESCRIPTION        │ AMOUNT    │
├───┼────────────────────────────────────────┼────────────────────┼───────────┤
│ 1 │ Inv Mfg Accessories - US  │ Poly bags x 1000   │ $50.00    │
│ 2 │ Inv Mfg Accessories - US  │ Labels x 1000      │ $30.00    │
│ 3 │ Inv Mfg Accessories - US  │ Insert cards x 1000│ $20.00    │
├───┴────────────────────────────────────────┴────────────────────┴───────────┤
│ TOTAL                                                             $100.00  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Note:** Mfg Accessories = packaging materials, labels, inserts, poly bags, etc. that go INTO the product. These are capitalized to Inventory Asset (not expensed) because they're part of the product cost.

## Step 4.8: Bill Summary by Cost Type

| Bill Type | Account | Goes to Inventory Asset? | PO Number Required? |
|-----------|---------|-------------------------|---------------------|
| Manufacturing | Inv Manufacturing - [Brand] | ✅ Yes | ✅ Yes |
| Freight | Inv Freight - [Brand] | ✅ Yes | ✅ Yes |
| Duty | Inv Duty - [Brand] | ✅ Yes | ✅ Yes |
| Mfg Accessories | Inv Mfg Accessories - [Brand] | ✅ Yes | ✅ Yes |
| Land Freight | Land Freight - [Brand] (COGS) | ❌ No - direct COGS | ✅ Yes |
| 3PL Storage | Storage 3PL - [Brand] (COGS) | ❌ No - direct COGS | ❌ No |

---

# PHASE 5: PLUTUS DEVELOPMENT

## Step 5.1: Project Setup

```bash
npx create-next-app@latest plutus --typescript --tailwind --app
cd plutus
npm install prisma @prisma/client
npm install @anthropic-ai/sdk  # for AI features if needed
npx prisma init
```

## Step 5.2: Database Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Brands
model Brand {
  id          String   @id @default(cuid())
  name        String   @unique  // "US-Dust Sheets", "UK-Dust Sheets"
  marketplace String   // "amazon.com", "amazon.co.uk"
  skuMappings SkuMapping[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// SKU to Brand mapping (per marketplace)
model SkuMapping {
  id          String   @id @default(cuid())
  sku         String   // Canonical SKU (e.g., "CS-007")
  brandId     String
  brand       Brand    @relation(fields: [brandId], references: [id])
  asin        String?
  productName String?
  aliases     String[] // Alternative text forms: ["CS007", "CS 007", "CS-007"] for bill parsing
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([sku, brandId])
}

/*
SKU ALIAS STRATEGY (for bill line parsing):
Real supplier docs have formatting drift: CS007 vs CS-007 vs CS 007

Parser logic:
1. Determine BRAND CONTEXT from bill line's Account (e.g., "Inv Manufacturing - US-Dust Sheets" → US-Dust Sheets brand)
2. Build alias lookup map SCOPED TO THAT BRAND only
3. For each bill line, match against brand-scoped aliases (longest match first)
4. If multiple SKUs match same line → BLOCK (ambiguous)
5. If no match → flag line for manual review

BRAND-AWARE MATCHING (Critical):
Without brand scoping, aliases can collide across brands:
  - US SKU: CS-007 (aliases: ["CS007", "CS-007"])
  - UK SKU: CS 007 (aliases: ["CS007", "CS 007"])
  - Text "CS007" would match BOTH → ambiguous

By scoping to brand (from Account), we eliminate cross-brand collisions.
The Account on each bill line determines which brand's SKUs to search.

This keeps "mfg lines must parse" principle but avoids death-by-formatting.
*/

// Landed costs per SKU - ALL COSTS STORED IN USD (base currency)
model SkuCost {
  id              String   @id @default(cuid())
  sku             String
  marketplace     String   // "amazon.com", "amazon.co.uk", etc.
  // All costs below are in USD (home currency)
  // These are CURRENT weighted averages (cached from SkuCostHistory)
  avgManufacturing  Decimal @db.Decimal(10, 4) @default(0)
  avgFreight        Decimal @db.Decimal(10, 4) @default(0)
  avgDuty           Decimal @db.Decimal(10, 4) @default(0)
  avgMfgAccessories Decimal @db.Decimal(10, 4) @default(0)
  avgTotalLanded    Decimal @db.Decimal(10, 4) @default(0)
  // NOTE: Quantity is derived from InventoryLedger, not stored here
  lastUpdated       DateTime @default(now())
  costHistory       SkuCostHistory[]
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([sku, marketplace])  // Same SKU can exist in multiple marketplaces
  @@index([sku])
}

// Historical cost entries per PO (for audit trail + as-of-date lookups)
model SkuCostHistory {
  id              String   @id @default(cuid())
  skuCostId       String
  skuCost         SkuCost  @relation(fields: [skuCostId], references: [id])
  poNumber        String
  marketplace     String   // "amazon.com", "amazon.co.uk" - matches parent SkuCost
  manufacturing   Decimal  @db.Decimal(10, 4)
  freight         Decimal  @db.Decimal(10, 4)
  duty            Decimal  @db.Decimal(10, 4)
  mfgAccessories  Decimal  @db.Decimal(10, 4) @default(0)
  totalLanded     Decimal  @db.Decimal(10, 4)
  quantity        Int
  perUnitLanded   Decimal  @db.Decimal(10, 4)
  qboBillIds      String[] // QBO bill IDs linked to this cost
  effectiveDate   DateTime // The Date of the Bill in QBO (for as-of lookups)
  createdAt       DateTime @default(now())

  @@index([skuCostId, effectiveDate])
  @@index([marketplace])
}

// QBO Account references
model QboAccount {
  id          String   @id @default(cuid())
  qboId       String   @unique  // QBO's internal ID
  name        String
  accountType String   // "Income", "COGS", "Asset", etc.
  category    String   // "Sales", "FBAFees", "Manufacturing", etc.
  brand       String?  // "US-Dust Sheets", "UK-Dust Sheets", or null for shared
  component   String?  // "Manufacturing", "Freight", "Duty", etc.
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// Settlement tracking
// Settlement = one Invoice group from CSV (the posting unit)
// Note: One CSV file may contain multiple Invoice values = multiple Settlements
// Idempotency key: (marketplace, invoiceId, processingHash)
model Settlement {
  id               String   @id @default(cuid())
  invoiceId        String   // LMB Invoice ID from CSV 'Invoice' column (e.g., "18128696")
  marketplace      String   // "amazon.com", "amazon.co.uk" - from CSV 'market' column
  startDate        DateTime
  endDate          DateTime
  depositDate      DateTime?
  totalAmount      Decimal  @db.Decimal(12, 2) // In settlement currency (informational only)
  currency         String   // USD or GBP (informational - Plutus ignores for COGS)
  status           String   @default("PENDING") // PENDING, PROCESSED, ERROR

  // Idempotency fields
  processingHash   String   // Hash of normalized CSV rows for this invoice
  sourceFilename   String?  // Original CSV filename
  normalizedRowCount Int?   // Number of rows in this invoice group

  errorMessage     String?

  // Relations
  lines            SettlementLine[]
  postings         SettlementPosting[] // One-to-many for split months
  validation       SettlementValidation?

  createdAt        DateTime @default(now())
  processedAt      DateTime?
  updatedAt        DateTime @updatedAt

  @@unique([marketplace, invoiceId])  // Idempotency check (hash checked separately)
  @@index([marketplace, invoiceId, processingHash])
}

// Tracks actual JEs posted to QBO (handles split months)
model SettlementPosting {
  id             String     @id @default(cuid())
  settlementId   String
  settlement     Settlement @relation(fields: [settlementId], references: [id])

  qboJournalId   String     // The ID of the COGS Journal Entry we created
  lmbInvoiceId   String?    // The ID of the LMB Invoice we matched against

  periodStart    DateTime   // The specific date range this JE covers
  periodEnd      DateTime
  postingDate    DateTime   // The TxnDate used in QBO

  totalCogsUSD   Decimal    @db.Decimal(12, 2)

  createdAt      DateTime   @default(now())

  @@index([settlementId])
}

// Inventory Ledger - audit trail for all inventory movements
model InventoryLedger {
  id             String   @id @default(cuid())
  sku            String
  marketplace    String   // "amazon.com", "amazon.co.uk" - from CSV market column
  date           DateTime
  type           String   // PURCHASE, SALE, RETURN, ADJUSTMENT, OPENING_SNAPSHOT, COST_ADJUSTMENT
  quantityChange Int      // Positive = in, Negative = out (0 for COST_ADJUSTMENT)

  /*
  TYPE DEFINITIONS:
  - PURCHASE: Units received from manufacturing bill (qty > 0)
  - SALE: Units sold per settlement CSV (qty < 0)
  - RETURN: Units returned per refund (qty > 0)
  - ADJUSTMENT: Reconciliation adjustment (qty +/-)
  - OPENING_SNAPSHOT: Initial inventory for catch-up mode (qty > 0)
  - COST_ADJUSTMENT: Late freight/duty - VALUE ONLY, NO QUANTITY CHANGE

  PURCHASE DATE SEMANTICS (Accounting Policy):
  Inventory is recognized on the QBO Bill TxnDate, NOT physical receipt date.
  - This means inventory may appear "in transit" before FBA actually receives it
  - Monthly reconciliation must account for in-transit and 3PL counts
  - This is a deliberate accounting policy choice for simplicity in v1

  COST_ADJUSTMENT (value-only events):
  When late freight/duty bill arrives AFTER manufacturing bill:
  - quantityChange = 0 (no units added/removed)
  - Only component values change (e.g., valueFreightUSD increases)
  - This models: "full bill amount absorbed by remaining inventory"
  - Average cost at any date = runningComponentValue / runningQty
  */

  // Component-level costs (enables reconciliation by sub-account)
  unitMfgUSD        Decimal  @db.Decimal(10, 4) @default(0)
  unitFreightUSD    Decimal  @db.Decimal(10, 4) @default(0)
  unitDutyUSD       Decimal  @db.Decimal(10, 4) @default(0)
  unitMfgAccUSD     Decimal  @db.Decimal(10, 4) @default(0)
  unitTotalUSD      Decimal  @db.Decimal(10, 4) // Sum of above (computed)

  // Component-level values (qty × unit cost)
  valueMfgUSD       Decimal  @db.Decimal(12, 2) @default(0)
  valueFreightUSD   Decimal  @db.Decimal(12, 2) @default(0)
  valueDutyUSD      Decimal  @db.Decimal(12, 2) @default(0)
  valueMfgAccUSD    Decimal  @db.Decimal(12, 2) @default(0)
  valueTotalUSD     Decimal  @db.Decimal(12, 2) // Sum of above (computed)

  // Running totals (after this event)
  // NOTE: These are DERIVED/CACHED values, not source of truth.
  // Can be recomputed from event rows at any time.
  // If backdated events are inserted, recompute for affected SKU.
  runningQty        Int?
  runningMfgUSD     Decimal? @db.Decimal(12, 2)
  runningFreightUSD Decimal? @db.Decimal(12, 2)
  runningDutyUSD    Decimal? @db.Decimal(12, 2)
  runningMfgAccUSD  Decimal? @db.Decimal(12, 2)
  runningTotalUSD   Decimal? @db.Decimal(12, 2)

  // Source references
  sourceRef      String?  // Settlement ID, Bill ID, Adjustment ID, or Snapshot report
  orderId        String?  // Amazon Order ID (for SALE/RETURN - enables refund matching)
  notes          String?
  createdAt      DateTime @default(now())

  @@index([sku, marketplace, date])
  @@index([type])
  @@index([marketplace, orderId, sku])  // For refund matching
}

// Settlement line items
model SettlementLine {
  id              String     @id @default(cuid())
  settlementId    String
  settlement      Settlement @relation(fields: [settlementId], references: [id])
  transactionType String     // ORDER, REFUND, etc. (we only process ORDER)
  amountType      String
  amountDesc      String
  sku             String?
  quantity        Int?
  amount          Decimal    @db.Decimal(12, 2)
  postedDate      DateTime?
  createdAt       DateTime   @default(now())
}

// FBA Returns (for COGS reversal processing)
model FbaReturn {
  id              String     @id @default(cuid())
  returnDate      DateTime
  orderId         String
  sku             String
  asin            String?
  fnsku           String?
  quantity        Int
  disposition     String     // SELLABLE, DAMAGED, CUSTOMER_DAMAGED, CARRIER_DAMAGED, etc.
  reason          String?
  cogsReversed    Boolean    @default(false)
  reversalJeId    String?    // QBO journal entry ID if reversed
  createdAt       DateTime   @default(now())

  @@index([sku, returnDate])
  @@index([disposition])
}

// Validation per settlement
model SettlementValidation {
  id            String     @id @default(cuid())
  settlementId  String     @unique
  settlement    Settlement @relation(fields: [settlementId], references: [id])
  brandResults  Json       // { "US-Dust Sheets": { lmb: 1000, plutus: 995, variance: 5 }, ... }
  totalVariance Decimal    @db.Decimal(12, 2)
  variancePercent Decimal  @db.Decimal(5, 4)
  status        String     // OK, WARNING, CRITICAL
  resolution    String?
  createdAt     DateTime   @default(now())
  resolvedAt    DateTime?
}

/*
VALIDATION STATUS POLICY (no variance account to absorb differences):

| Status   | Threshold        | Action                                    |
|----------|------------------|-------------------------------------------|
| OK       | variance < 1%    | Post JEs automatically                    |
| WARNING  | variance 1-5%    | Post JEs, flag for review                 |
| CRITICAL | variance > 5%    | BLOCK posting, mark NEEDS_ATTENTION       |

CRITICAL status forces investigation before posting. Without a variance account,
mismatches must be resolved (SKU mapping, missing costs, split-month logic).
*/

// Monthly inventory reconciliation
model InventoryReconciliation {
  id              String        @id @default(cuid())
  month           String        // "2025-01"
  marketplace     String
  bookValue       Decimal       @db.Decimal(12, 2)
  actualValue     Decimal       @db.Decimal(12, 2)
  variance        Decimal       @db.Decimal(12, 2)
  status          String        @default("PENDING") // PENDING, REVIEWED, ADJUSTED
  adjustmentJeId  String?       // QBO journal entry ID
  skuVariances    SkuVariance[]
  createdAt       DateTime      @default(now())
  reviewedAt      DateTime?
  adjustedAt      DateTime?
}

// Per-SKU variance in reconciliation
model SkuVariance {
  id               String                  @id @default(cuid())
  reconciliationId String
  reconciliation   InventoryReconciliation @relation(fields: [reconciliationId], references: [id])
  sku              String
  bookUnits        Int
  actualUnits      Int
  varianceUnits    Int
  varianceValue    Decimal                 @db.Decimal(10, 2)
  cause            String?                 // WAREHOUSE_DAMAGED, LOST, RETURN_DISPOSED, etc.
  amazonReference  String?
  createdAt        DateTime                @default(now())
}

// Audit log
model AuditLog {
  id          String   @id @default(cuid())
  action      String   // SETTLEMENT_PROCESSED, JOURNAL_POSTED, RECONCILIATION_COMPLETED, etc.
  entityType  String   // Settlement, InventoryReconciliation, etc.
  entityId    String
  details     Json?
  userId      String?
  createdAt   DateTime @default(now())
}
```

## Step 5.3: Core Modules

### Module 1: QBO Integration

```
/lib/qbo/
├── auth.ts          # OAuth2 flow, token refresh
├── client.ts        # API client wrapper
├── accounts.ts      # Account CRUD operations
├── journals.ts      # Journal entry posting
├── bills.ts         # Bill reading/parsing
└── types.ts         # TypeScript types
```

**Developer Note - Bill Querying:**

Plutus uses the Bill's `PrivateNote` (Memo) field to link bills by PO number.

**QBO Query Constraints (v1 spec):**
- Lookback window: **90 days default** (bills older than this require date range expansion)
- Pagination: `maxresults` up to **1000** (QBO default is 100), use `startposition` for next page
- Recommended page size: **500-1000** for accounts/bills to reduce round trips
- Cache TTL: 5 minutes (avoid repeated API calls)
- OR operator: NOT supported by QBO - use multiple queries or fetch-and-filter
- Special characters: Escape quotes in PrivateNote queries (backslash escaping)

**Query Strategy:**
1. Try exact match: `SELECT * FROM Bill WHERE PrivateNote = 'PO: PO-2026-001'`
2. If that fails or returns empty, fall back to date range + client-side filter
3. Cache results to avoid hitting API rate limits

```typescript
// Example: Finding bills for a specific PO
async function getBillsByPO(poNumber: string): Promise<Bill[]> {
  const memoValue = `PO: ${poNumber}`;

  // 1. Try server-side query (may work for PrivateNote)
  try {
    const bills = await qbo.findBills({
      PrivateNote: memoValue
    });
    if (bills.length > 0) return bills;
  } catch (e) {
    // Server-side filter not supported, fall back
  }

  // 2. Fallback: Fetch by date range with pagination
  const allBills: Bill[] = [];
  let startPosition = 1;
  const maxResults = 100;

  while (true) {
    const page = await qbo.findBills({
      TxnDate: { $gte: ninetyDaysAgo },
      startposition: startPosition,
      maxresults: maxResults
    });
    allBills.push(...page);
    if (page.length < maxResults) break;
    startPosition += maxResults;
  }

  // 3. Filter client-side by memo (exact match or regex)
  const poRegex = new RegExp(`\\bPO:\\s*${poNumber}\\b`);
  return allBills.filter(bill =>
    bill.PrivateNote && poRegex.test(bill.PrivateNote)
  );
}
```

### Module 2: LMB Audit Data Import

```
/lib/lmb/
├── parser.ts        # Parse Audit Data CSV
├── validator.ts     # Validate CSV structure, SKUs, amounts
├── matcher.ts       # Match refunds to original orders
├── importer.ts      # Import and store audit data
└── types.ts         # TypeScript types for CSV rows
```

**CSV Columns Used:**
| Column | Purpose |
|--------|---------|
| market | Marketplace (Amazon.com, Amazon.co.uk) |
| date | Transaction date |
| Order Id | For matching refunds to original sales |
| Sku | Product SKU |
| Quantity | Units sold (0 for refunds - match via Order Id) |
| LMB Line Description | Transaction type (Amazon Sales - Principal, Amazon Refunds - Refunded Principal) |
| Net | Amount (for validation) |
| Invoice | LMB Invoice ID (for matching to QBO) |

### Module 3: Landed Cost Engine

```
/lib/landed-cost/
├── parser.ts        # Parse bills from QBO
├── allocator.ts     # Allocate freight/duty to SKUs
├── calculator.ts    # Calculate per-unit landed cost
└── storage.ts       # Store/retrieve costs from DB
```

### Module 4: COGS Engine

```
/lib/cogs/
├── extractor.ts     # Extract units sold from settlement
├── calculator.ts    # Calculate COGS per brand per component
├── journal.ts       # Generate QBO journal entry
└── poster.ts        # Post to QBO
```

### Module 5: Validation Engine

```
/lib/validation/
├── csvValidator.ts      # Validate Audit Data CSV format and content
├── settlementChecks.ts  # Sanity checks (coverage, SKU mapping, totals)
├── thresholds.ts        # OK/WARNING/CRITICAL threshold logic
└── reporter.ts          # UI output, warnings/errors
```

### Module 6: Reconciliation Engine

```
/lib/reconciliation/
├── inventory.ts     # Pull FBA inventory
├── book-value.ts    # Get QBO book value
├── comparator.ts    # Compare book vs physical
├── adjuster.ts      # Generate adjustment entries
└── reporter.ts      # Generate reconciliation reports
```

## Step 5.4: API Routes

```
/app/api/
├── auth/
│   └── qbo/callback/route.ts    # QBO OAuth callback
├── audit-data/
│   ├── route.ts                 # POST upload CSV, GET list imports
│   ├── validate/route.ts        # POST validate CSV before import
│   └── [id]/route.ts            # GET single import, DELETE
├── settlements/
│   ├── route.ts                 # GET list, POST process
│   └── [id]/route.ts            # GET single, POST reprocess
├── cogs/
│   ├── route.ts                 # POST calculate and post
│   └── preview/route.ts         # POST preview without posting
├── reconciliation/
│   ├── route.ts                 # GET list, POST run
│   └── [id]/route.ts            # GET single, POST adjust
├── bills/
│   ├── route.ts                 # GET list from QBO
│   └── parse/route.ts           # POST parse bills for PO
├── skus/
│   ├── route.ts                 # CRUD operations
│   └── costs/route.ts           # GET/POST landed costs
└── accounts/
    ├── route.ts                 # GET list from QBO
    └── sync/route.ts            # POST sync from QBO
```

## Step 5.5: UI Pages

```
/app/
├── page.tsx                     # Dashboard
├── settlements/
│   ├── page.tsx                 # Settlement list
│   └── [id]/page.tsx            # Settlement detail
├── cogs/
│   └── page.tsx                 # COGS posting interface
├── reconciliation/
│   ├── page.tsx                 # Reconciliation list
│   └── [id]/page.tsx            # Reconciliation detail
├── inventory/
│   ├── page.tsx                 # Inventory overview
│   └── costs/page.tsx           # Landed costs management
├── skus/
│   └── page.tsx                 # SKU management
├── bills/
│   └── page.tsx                 # Bill parsing interface
└── settings/
    ├── page.tsx                 # Settings overview
    ├── qbo/page.tsx             # QBO connection
    └── amazon/page.tsx          # Amazon connection
```

---

# PHASE 6: PLUTUS WORKFLOW IMPLEMENTATION

## Step 6.1: Settlement Processing Flow (SALES ONLY)

**Important:** Settlement processing handles SALES and REFUNDS together. Refund quantities are matched to original sales via Order ID + SKU in the same Audit Data CSV (see Step 6.2).

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER UPLOADS AUDIT DATA CSV                                  │
│                                                                 │
│    A. User downloads Audit Data CSV from LMB:                   │
│       - LMB → Settlements → Select settlement → Download        │
│       - CSV contains all line items for settlement period       │
│                                                                 │
│    B. User uploads CSV to Plutus:                               │
│       - Dashboard → Upload Audit Data                           │
│       - Select file                                             │
│                                                                 │
│    C. Plutus validates CSV:                                     │
│       - Check file format (required columns present)            │
│       - Extract marketplace from 'market' column                │
│       - Group rows by Invoice column (canonical grouping key)   │
│       - Validate all SKUs exist in Plutus SKU master            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. IDEMPOTENCY CHECK                                            │
│                                                                 │
│    A. Compute hash of normalized CSV rows:                      │
│       - Hash includes: SKU, Quantity, Net amounts               │
│       - Ignore whitespace, normalize values                     │
│                                                                 │
│    B. Check for duplicate:                                      │
│       - Query Settlement table by Invoice ID + hash             │
│       - If same hash exists → Block: "Already processed"        │
│       - If different hash exists → Warn: "Reprocess required"   │
│         (User must void old JE first, then delete record)       │
│       - If not found → Proceed                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. PARSE SALES ROWS (ORDER-LINE GRANULARITY)                    │
│                                                                 │
│    ⚠️ CRITICAL: Store sales at ORDER-LINE level, not aggregated │
│    (Required for refund matching - see Step 6.2)                │
│                                                                 │
│    - Filter CSV for LMB Line Description = 'Amazon Sales -      │
│      Principal'                                                 │
│    - For EACH sale row, extract:                                │
│      • orderId (Order Id column)                                │
│      • sku (Sku column)                                         │
│      • quantity (Quantity column)                               │
│      • date (date column)                                       │
│    - VALIDATE: All SKUs must be mapped (see Appendix E.4)       │
│                                                                 │
│    Why not aggregate? Refund matching needs (orderId, sku) to   │
│    find the original sale's component costs.                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. LOOK UP LANDED COSTS (HISTORICAL - AS-OF DATE)               │
│    - Input: SKU + Transaction Date (of the sale)                │
│    - Query SkuCostHistory to find Weighted Average Cost         │
│      effective on that specific date                            │
│    - Why: If you re-process a January settlement in March,      │
│      you must use January's cost, not March's cost              │
│    - All costs in USD (ignore settlement currency)              │
│    - See Appendix E.7 for cost method details                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. CALCULATE COGS (AGGREGATE FOR JE)                            │
│    - For each sale row: units × landed cost components          │
│    - Aggregate totals by (brand, component) for JE creation     │
│    - Debit COGS / Credit Inventory Asset                        │
│                                                                 │
│    Storage: Order-line level (for refunds)                      │
│    JE lines: Aggregated by brand+component (for readability)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. UPDATE INVENTORY LEDGER (PER ORDER-LINE)                     │
│                                                                 │
│    For EACH sale row (not aggregated):                          │
│    - Insert record: type=SALE, quantityChange=-N                │
│    - Store orderId + sku (enables refund matching)              │
│    - Store component costs: unitMfgUSD, unitFreightUSD, etc.    │
│    - Track running quantity and component values                │
│                                                                 │
│    This granularity is REQUIRED for DB-first refund matching.   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. VALIDATE DATA INTEGRITY                                      │
│    - Verify all SKUs mapped to brands                           │
│    - Check for missing cost data                                │
│    - Summarize: total units, total COGS by brand                │
│    - Flag any warnings (unmapped SKUs, zero costs)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. POST JOURNAL ENTRY TO QBO (SPLIT MONTH LOGIC)                │
│                                                                 │
│    A. Group by Invoice column from CSV:                         │
│       - Each unique Invoice value = one JE posting              │
│       - (LMB may split settlements across months)               │
│                                                                 │
│    B. For EACH Invoice group:                                   │
│       - Determine date from CSV rows in this group              │
│       - Filter sales/refunds by Invoice value                   │
│       - Calculate COGS for this subset                          │
│       - Post Journal Entry dated to match invoice period        │
│       - Create SettlementPosting record                         │
│                                                                 │
│    C. Example: Settlement Dec 27 - Jan 10                       │
│       - CSV has 2 Invoice values (18129565, 18129566)           │
│       - Plutus creates:                                         │
│         → JE #1: Dated Dec 31 (sales Dec 27-31) → Posting #1    │
│         → JE #2: Dated Jan 10 (sales Jan 1-10) → Posting #2     │
│                                                                 │
│    D. Database:                                                 │
│       - Each JE → one SettlementPosting record                  │
│       - Settlement.status = PROCESSED when all postings done    │
│                                                                 │
│    E. Result: COGS matches Revenue month-by-month               │
└─────────────────────────────────────────────────────────────────┘
```

## Step 6.2: Returns Processing Flow (FROM AUDIT DATA CSV)

**DB-First Matching:** We process refunds from Audit Data CSV but match against Plutus database FIRST to handle cross-period refunds.

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. EXTRACT REFUNDS FROM AUDIT DATA CSV                          │
│    - Filter for LMB Line Description = 'Amazon Refunds -        │
│      Refunded Principal'                                        │
│    - Get Order ID and SKU for each refund                       │
│    - IMPORTANT: Only reverse COGS for 'Principal' refunds       │
│      (fee-only refunds do NOT affect inventory/COGS)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. MATCH REFUND TO ORIGINAL SALE (DB-First, then CSV)           │
│                                                                 │
│    A. QUERY PLUTUS DATABASE FIRST:                              │
│       SELECT * FROM InventoryLedger                             │
│       WHERE marketplace = ? AND orderId = ? AND sku = ?         │
│             AND type = 'SALE'                                   │
│                                                                 │
│    B. IF FOUND IN DB:                                           │
│       - Use stored component costs (Mfg, Freight, Duty, MfgAcc) │
│       - Get quantity from original ledger entry                 │
│       - Proceed to COGS reversal                                │
│                                                                 │
│    C. IF NOT IN DB, CHECK CURRENT CSV:                          │
│       - Find original sale row with same Order ID + SKU         │
│       - Fallback: Order ID alone if single-SKU order            │
│                                                                 │
│    D. IF STILL NOT FOUND:                                       │
│       - UI shows: "Refund for Order XXX not found."             │
│       - Options: (a) upload wider date range, (b) skip refund   │
│       - Skipped refunds logged for manual review                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. DETERMINE REFUND QUANTITY                                    │
│                                                                 │
│    Priority order:                                              │
│    1. If refund row has non-zero Quantity → use it              │
│    2. Else use matched sale quantity                            │
│    3. For partial refunds: compare refund amount to sale amount │
│       and prorate quantity if needed                            │
│                                                                 │
│    Guard: If quantity cannot be determined → flag for review    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. CALCULATE COGS REVERSAL                                      │
│    - Per SKU: refunded units × landed cost                      │
│    - Credit COGS / Debit Inventory Asset                        │
│    - Note: Assumes refund = physical return to sellable inv.    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. UPDATE INVENTORY LEDGER                                      │
│    - Insert record: type=RETURN, quantityChange=+N              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. INCLUDE IN SETTLEMENT JOURNAL ENTRY                          │
│    - Refund reversals included in same JE as sales COGS         │
│    - Net effect: COGS = (Sales COGS) - (Refund Reversals)       │
└─────────────────────────────────────────────────────────────────┘
```

**Simplification Note:** This assumes all refunds result in physical returns to sellable inventory. In reality, some refunds are "returnless" (customer keeps item) or items return as damaged. This simplification may slightly overstate inventory. For higher accuracy, you could later add FBA Returns Report integration to track actual return dispositions.

## Step 6.3: COGS Journal Entry Structure

**Example: Settlement with Sales only**
```
Settlement: 12345678 (Dec 19 - Jan 2)
Currency: USD (but same logic for GBP settlements - COGS always in USD)

DEBITS (COGS):
  Manufacturing - US-Dust Sheets        $1,200.00
  Freight - US-Dust Sheets              $180.00
  Duty - US-Dust Sheets                 $90.00
  Mfg Accessories - US-Dust Sheets      $30.00
  Manufacturing - UK-Dust Sheets        $800.00
  Freight - UK-Dust Sheets              $120.00
  Duty - UK-Dust Sheets                 $60.00
  Mfg Accessories - UK-Dust Sheets      $20.00
                                        ─────────
  Total COGS                            $2,500.00

CREDITS (Inventory Asset):
  Inv Manufacturing - US   $1,200.00
  Inv Freight - US         $180.00
  Inv Duty - US            $90.00
  Inv Mfg Accessories - US $30.00
  Inv Manufacturing - UK   $800.00
  Inv Freight - UK         $120.00
  Inv Duty - UK            $60.00
  Inv Mfg Accessories - UK $20.00
                                        ─────────
  Total Credit                          $2,500.00

Memo: "Plutus COGS - Settlement 12345678 (Dec 19 - Jan 2, 2026)"
```

**Example: Returns Reversal (from Audit Data CSV refund)**
```
Sellable Return: 2 units of CS-007 @ $2.50 total landed cost

DEBITS (Inventory Asset - cost goes BACK to balance sheet):
  Inv Manufacturing - US   $4.00
  Inv Freight - US         $0.60
  Inv Duty - US            $0.30
  Inv Mfg Accessories - US $0.10

CREDITS (COGS - reduces expense):
  Manufacturing - US-Dust Sheets        $4.00
  Freight - US-Dust Sheets              $0.60
  Duty - US-Dust Sheets                 $0.30
  Mfg Accessories - US-Dust Sheets      $0.10

Memo: "Returns reversal - Jan 2026"
```

**Note:** Refund reversals are included in the same JE as sales COGS. Refund qty is determined by matching Order ID to original sale in the Audit Data CSV.

**Note:** Storage 3PL and Land Freight are NOT included here - they're posted directly to COGS when billed (see Step 4.5 and 4.6).

## Step 6.4: Monthly Reconciliation Flow

**Developer Note:** For reconciliation, physical inventory counts are pulled manually from Amazon Seller Central (Inventory > Manage FBA Inventory). In a future version, you could integrate Amazon's FBA Inventory API for automated pulls, but manual reconciliation is sufficient for v1 given the monthly cadence.

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. GATHER PHYSICAL INVENTORY FROM ALL LOCATIONS                 │
│                                                                 │
│    A. Amazon FBA:                                               │
│       - Manual: Download from Amazon Seller Central             │
│       - (Inventory > Manage FBA Inventory > Export)             │
│       - Units per SKU currently at Amazon                       │
│                                                                 │
│    B. 3PL Warehouse:                                            │
│       - Get inventory report from Talos/3PL                     │
│       - Units per SKU at 3PL                                    │
│                                                                 │
│    C. In-Transit / On-Water:                                    │
│       - Check open POs not yet received                         │
│       - Units per SKU in transit                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. CALCULATE TOTAL PHYSICAL INVENTORY VALUE                     │
│                                                                 │
│    Physical Value = (FBA Units × Cost)                          │
│                   + (3PL Units × Cost)                          │
│                   + (In-Transit Units × Cost)                   │
│                                                                 │
│    Sum by brand and component                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. GET QBO BOOK VALUE                                           │
│    - Query Inventory Asset sub-account balances                 │
│    - Sum by brand and component                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. COMPARE AND IDENTIFY VARIANCES                               │
│    - Variance = QBO Book Value - Total Physical Value           │
│    - Break down by SKU                                          │
│    - Flag if variance > threshold (e.g., $100 or 2%)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. IDENTIFY VARIANCE CAUSES (manual investigation)              │
│    - Check Amazon Seller Central for adjustments                │
│    - Check for damaged/lost inventory in FBA reports            │
│    - Check removal orders                                       │
│    - Note: Detailed cause tracking is manual for v1             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. POST ADJUSTMENT JOURNAL ENTRY (only if > threshold)          │
│                                                                 │
│    If Book > Physical (inventory overstated → write-down):      │
│    - Debit: Inventory Shrinkage - [Brand]                       │
│    - Credit: Inventory Asset (by component + brand)             │
│                                                                 │
│    If Physical > Book (inventory understated → write-up):       │
│    - Debit: Inventory Asset (by component + brand)              │
│    - Credit: Inventory Shrinkage - [Brand] (negative expense)   │
│                                                                 │
│    Example (US brand, 10 units short @ $3.00 total landed):     │
│    - Debit: Inventory Shrinkage - US-Dust Sheets    $30.00      │
│    - Credit: Inv Manufacturing - US-Dust Sheets     $25.00      │
│    - Credit: Inv Freight - US-Dust Sheets           $3.00       │
│    - Credit: Inv Duty - US-Dust Sheets              $1.50       │
│    - Credit: Inv Mfg Accessories - US-Dust Sheets   $0.50       │
│                                                                 │
│    COMPONENT SPLIT RULE:                                        │
│    Use current per-unit component averages as-of reconciliation │
│    date to split the adjustment across Inv Asset sub-accounts.  │
│    This keeps reconciliation JE consistent with sub-account     │
│    structure and makes variances explainable.                   │
│                                                                 │
│    Note: Brand-specific Shrinkage ensures brand P&Ls sum to 100%│
└─────────────────────────────────────────────────────────────────┘
```

---

# PHASE 7: TESTING & VALIDATION

## Step 7.1: Unit Testing

- Test landed cost allocation logic
- Test COGS calculation logic
- Test settlement validation thresholds (OK/WARNING/CRITICAL)
- Test split-month allocation and rounding behavior
- Test journal entry generation

## Step 7.2: Integration Testing

- Test QBO API integration (sandbox)
- Test LMB Audit Data CSV parsing (various formats, edge cases)
- Test refund-to-sale matching via Order ID
- Test end-to-end settlement processing

## Step 7.3: Parallel Run

1. Process 3+ settlements with Plutus
2. Compare Plutus COGS to expected values
3. Verify journal entries posted correctly
4. Verify P&L reports show correct brand breakdown

## Step 7.4: Validation Checklist

| Check | Expected Result |
|-------|-----------------|
| LMB posts to brand accounts | Revenue split by brand |
| Plutus posts COGS journal | COGS split by brand + component |
| P&L by brand (Amazon ops) | Adds up to 100% of Amazon ops P&L* |
| Inventory Asset balance | Matches expected on-hand value |

*Note: "Brand P&L sums to 100%" applies to **Amazon operations only** (revenue, Amazon fees, inventory COGS). Company overhead (software, accounting, office, etc.) is NOT brand-split unless you create additional brand sub-accounts for those. For full-company brand P&L, either brand-split all overhead accounts OR treat "Shared/Overhead" as a third reporting bucket.

---

# PHASE 8: GO-LIVE & OPERATIONS

## Step 8.1: Go-Live Checklist

- [ ] QBO accounts created and verified
- [ ] LMB Product Groups configured
- [ ] LMB SKU assignments complete
- [ ] Test settlement processed successfully
- [ ] Plutus deployed to production
- [ ] Monitoring/alerting set up

## Step 8.2: Ongoing Operations

| Task | Frequency | Owner |
|------|-----------|-------|
| Process settlements | Per settlement (~biweekly) | Plutus (auto) |
| Run inventory reconciliation | Monthly | Plutus + Accountant |
| Add new SKUs | As needed | Manual (LMB + Plutus) |
| Enter bills | Per PO (~every 2-3 months) | Manual (QBO) |

## Step 8.3: New SKU Procedure

1. SKU appears in settlement (Plutus flags as unknown)
2. Determine brand assignment
3. Add to Plutus: SKU → Brand mapping
4. Add to LMB: Product Groups → Product SKUs
5. Verify next settlement processes correctly

## Step 8.4: New PO Procedure

1. **Define PO:** Assign a number (e.g., `PO-2026-001`)
2. **Bill Entry:** When entering bills in QBO (Manufacturing, Freight, Duty):
   - Enter `PO: PO-2026-001` in the **Memo field** (exact format required)
   - Select the correct Inventory Asset account
3. **Verification:** Check Plutus Landed Cost UI to ensure PO is detected and costs are allocated

**Do NOT use QBO Tags for PO tracking - use the Memo field with strict format.**

---

# APPENDIX A: SKU MAPPING (Current)

## US Marketplace (Amazon.com) → US-Dust Sheets

| SKU | ASIN | Product | FBA Units |
|-----|------|---------|-----------|
| CS-007 | B09HXC3NL8 | 6 Pack Extra Large Plastic Drop Cloth 12x9ft | 5,777 |
| CS-010 | B0CR1GSBQ9 | 3 Pack Extra Large Plastic Drop Cloth 12x9ft | 438 |
| CS-1SD-32M | B0FLKJ7WWM | 1 Pack Extra Large Plastic Drop Cloth 12x9ft | 618 |
| CS-12LD-7M | B0FP66CWQ6 | 12 Pack Extra Large Plastic Drop Cloth 12x9ft | 1,262 |

## UK Marketplace (Amazon.co.uk) → UK-Dust Sheets

| SKU | ASIN | Product | FBA Units |
|-----|------|---------|-----------|
| CS 007 | B09HXC3NL8 | 6 Pack Plastic Dust Sheets 3.6x2.7m | 8,809 |
| CS 008 | B0C7ZQ3VZL | 3 Pack Plastic Dust Sheets 3.6x2.7m (Light) | 0 |
| CS 009 | B0CR1H3VSF | 10 Pack Plastic Dust Sheets 3.6x2.7m | 1,234 |
| CS 010 | B0CR1GSBQ9 | 3 Pack Plastic Dust Sheets 3.6x2.7m | 879 |
| CS 011 | B0DHDTPGGP | 6 Pack Plastic Dust Sheets 3.6x2.7m | 0 |
| CS 1SD-32M | B0FLKJ7WWM | 1 Pack Plastic Dust Sheets 3.6x2.7m | 0 |
| CS-CDS-001 | B0CW3N48K1 | Cotton Dust Sheet 3.6x1.3m (Small) | 0 (1,188 inbound) |
| CS-CDS-002 | B0CW3L6PQH | Cotton Dust Sheet 3.6x2.7m (Large) | 0 (1,120 inbound) |

## Shared ASINs (Same product in both regions)

| ASIN | US SKU | UK SKU | Product |
|------|--------|--------|---------|
| B09HXC3NL8 | CS-007 | CS 007 | 6 Pack Plastic |
| B0CR1GSBQ9 | CS-010 | CS 010 | 3 Pack Plastic |
| B0FLKJ7WWM | CS-1SD-32M | CS 1SD-32M | 1 Pack Plastic |

## SKU Count Summary

| Region | Active SKUs | Total SKUs |
|--------|-------------|------------|
| US | 4 | 4 |
| UK | 5 | 8 |
| **Total unique** | **9** | **12** |

---

# APPENDIX B: LMB AUDIT DATA IMPORT UI

## B.1: Import Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  LMB AUDIT DATA IMPORT                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 1: Upload Audit Data CSV from LMB                         │
│          [Choose File] audit-data-2026-01.csv                   │
│          [Upload & Validate]                                    │
│                                                                 │
│  Previously processed:                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ✅  #17971233  Dec 19-30, 2025  $748.69     PROCESSED  │   │
│  │  ✅  #17910736  Dec 5-19, 2025   $2,967.96   PROCESSED  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Step 2: Validation Results                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ CSV contains Invoice #18128696                          │   │
│  │   - 403 sales transactions (CS-007: 226, CS-010: 36,    │   │
│  │     CS-12LD-7M: 87, CS-1SD-32M: 54)                      │   │
│  │   - 2 refunds (matched to original orders ✅)           │   │
│  │   - All SKUs mapped ✅                                  │   │
│  │                                                         │   │
│  │ [Preview COGS]  [Process & Post COGS]                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## B.2: Monthly Calendar View

```
2026
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│ Jan │ Feb │ Mar │ Apr │ May │ Jun │ Jul │ Aug │ Sep │ Oct │ Nov │ Dec │
│ ⚠️  │  -  │  -  │  -  │  -  │  -  │  -  │  -  │  -  │  -  │  -  │  -  │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘

2025
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│ Jan │ Feb │ Mar │ Apr │ May │ Jun │ Jul │ Aug │ Sep │ Oct │ Nov │ Dec │
│  -  │  -  │  -  │  -  │  -  │  -  │  -  │  -  │  -  │  -  │  -  │ ✅  │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘

Legend: ✅ Complete  ⚠️ Pending  ❌ Error  - No data
```

## B.3: Validation Safeguards

| Check | How |
|-------|-----|
| No duplicates | Hash CSV rows, compare to processed Settlement.processingHash |
| Data integrity | Sum CSV sales amounts, validate totals match expected patterns |
| Refund matching | Validate all refund Order IDs have matching original sale (OrderId + SKU) |
| SKU validation | All SKUs in CSV exist in Plutus SKU master |
| Marketplace match | CSV market column matches expected brand/marketplace |

## B.4: Database Model

**Relationship:**
- `CsvUpload` = one uploaded CSV file (may contain multiple Invoice groups)
- `Settlement` = one Invoice group (the canonical posting unit) - see main schema

```typescript
// File upload log (optional - for tracking uploads)
model CsvUpload {
  id                String   @id @default(cuid())
  filename          String   // audit-data-2026-01.csv
  marketplace       String   // Amazon.com (from CSV)
  uploadedAt        DateTime @default(now())
  uploadedBy        String?  // User ID if multi-user

  // Stats from parsing
  invoiceCount      Int      // How many unique Invoice values
  totalRows         Int      // Total CSV rows

  // Settlement IDs created from this upload
  settlementIds     String[] // References to Settlement records

  status            String   // PARSED | PROCESSING | COMPLETE | ERROR
  errorMessage      String?
}
```

**Note:** The canonical data model is `Settlement` (one per Invoice group). CsvUpload is optional audit logging.

## B.5: CSV Download Instructions (for User)

1. Go to LMB → Settlements Dashboard
2. Click the download icon (top right)
3. Select "Download Audit Data"
4. Set date range to cover the settlement period
5. Click "Download to CSV"
6. Upload CSV to Plutus

**Recommended:** Download monthly (covers all settlements in that month).

---

# APPENDIX C: QBO ACCOUNT TYPES REFERENCE

| Account Type | Detail Type | Use For |
|--------------|-------------|---------|
| Income | Sales of Product Income | Amazon Sales |
| Income | Discounts/Refunds Given | Amazon Refunds |
| Other Income | Other Miscellaneous Income | FBA Reimbursements |
| Cost of Goods Sold | Supplies & Materials - COGS | Manufacturing, Mfg Accessories |
| Cost of Goods Sold | Shipping, Freight & Delivery - COS | Freight, Duty, Fees |
| Cost of Goods Sold | Other Costs of Services - COS | Shrinkage, Variance |
| Other Current Assets | Inventory | Inventory Asset sub-accounts |
| Other Current Assets | Other Current Assets | Control accounts |

---

# APPENDIX D: LMB TRANSACTION CATEGORIES

| Category | Type | Split by Brand | Handled By |
|----------|------|----------------|------------|
| Amazon Sales | Revenue | Yes | LMB |
| Amazon Refunds | Revenue | Yes | LMB |
| Amazon FBA Inventory Reimbursement | Other Income | Yes | LMB |
| Amazon Seller Fees | Expense | Yes | LMB |
| Amazon FBA Fees | Expense | Yes | LMB |
| Amazon Storage Fees | Expense | Yes | LMB |
| Amazon Advertising Costs | Expense | Yes | LMB |
| Amazon Promotions | Expense | Yes | LMB |
| Amazon Sales Tax | Current Liability | No | LMB |
| Amazon Loans | Current Liability | No | LMB |
| Amazon Reserved Balances | Current Asset | No | LMB |
| Amazon Split Month Rollovers | Current Asset | No | LMB |
| Amazon Deferred Balances | Current Asset | No | LMB |
| COGS (Manufacturing) | COGS | Yes | Plutus |
| COGS (Freight) | COGS | Yes | Plutus |
| COGS (Duty) | COGS | Yes | Plutus |
| COGS (Mfg Accessories) | COGS | Yes | Plutus |
| Storage 3PL | COGS | Yes | Manual (QBO) |
| Land Freight | COGS | Yes | Manual (QBO) |

---

# APPENDIX E: CRITICAL EDGE CASES

## E.1: Currency Handling & QBO Setup

**QBO Account Configuration:**

| Account Type | Currency Setting | Notes |
|--------------|------------------|-------|
| Income/Expense/COGS | Home Currency (USD) | Cannot set to GBP - QBO doesn't allow it |
| Bank Accounts | Can be GBP | e.g., Wise GBP Account |
| A/R, A/P | Can be GBP | If you have UK vendors/customers |
| Inventory Asset | Home Currency (USD) | Standard QBO accounts |

**Critical:** Do NOT attempt to set "GBP" currency for Income/Expense/COGS accounts. In QBO, these account types are **always in Home Currency (USD)**.

**Plutus Logic:**
- Plutus creates Journal Entries in USD (Home Currency)
- The "Inventory Asset" and "COGS" accounts are standard QBO accounts
- This works because the value of the asset is "trapped" in USD when you buy it
- When you sell in the UK, you're simply moving that USD value from Asset to Expense
- The currency of the sale (GBP) is handled entirely by LMB on the Revenue side

**How it flows:**

1. **Buying inventory:** You pay suppliers in USD. All costs in `SkuCost` table are in **USD**.

2. **Selling (US):**
   - LMB posts revenue in USD
   - Plutus posts COGS in USD
   - Clean match

3. **Selling (UK):**
   - LMB posts revenue (GBP transaction → USD account via QBO FX)
   - Plutus posts COGS in USD (same as US)
   - The GBP sale is handled at transaction level, not account level

**Why this is clean:**
- No currency conversion at COGS posting time
- Inventory Asset is always in USD
- COGS is always in USD
- LMB handles GBP revenue via transaction-level currency
- QBO handles FX translation for reporting

## E.2: Returns Handling (from Audit Data CSV)

**Simplified Approach (v1):** Process refunds from Audit Data CSV, assuming all refunds result in physical returns to sellable inventory.

| Scenario | Audit Data Shows | Plutus Action | Accuracy |
|----------|------------------|---------------|----------|
| Customer returns item | REFUND | Reverse COGS | ✅ Correct |
| Returnless refund | REFUND | Reverse COGS | ⚠️ Overstates inventory |
| Item returned damaged | REFUND | Reverse COGS | ⚠️ Overstates inventory |

**How refund matching works:**
1. Refund row shows: SKU, Order ID, Quantity=0, negative amount
2. Find original sale with same Order ID in CSV
3. Get quantity from original sale
4. Reverse COGS for that quantity

**Why this simplification is acceptable:**
- Returnless refunds are relatively rare (~5-10% of refunds)
- Damaged returns are caught in monthly reconciliation
- Monthly reconciliation adjusts inventory to physical count
- Net effect: Small temporary overstatement, corrected at reconciliation

**Future Enhancement:** Add FBA Returns Report integration to track actual return dispositions (SELLABLE vs DAMAGED) for more accurate real-time inventory.

**P&L Timing Note (v1 Simplification):**
When a refund occurs, LMB posts the revenue reversal immediately. Plutus reverses COGS in the **same period as the refund** (not when item physically returns). This is a simplification:
- Refund processed → COGS reversed → Inventory increased (assumes item returns sellable)
- Physical return timing is ignored in v1

This may cause temporary inventory overstatement if:
- Customer got refund but hasn't shipped item back yet
- Item returns as damaged (not sellable)

Monthly reconciliation catches these discrepancies.

**Journal Entry for Refund (COGS Reversal):**
```
Refund: 2 units of CS-007 @ $2.50 total landed cost
(Assumes sellable return)

DEBITS (Inventory Asset - cost goes BACK to balance sheet):
  Inv Manufacturing - US   $4.00
  Inv Freight - US         $0.60
  Inv Duty - US            $0.30
  Inv Mfg Accessories - US $0.10

CREDITS (COGS - reduces expense):
  Manufacturing - US-Dust Sheets        $4.00
  Freight - US-Dust Sheets              $0.60
  Duty - US-Dust Sheets                 $0.30
  Mfg Accessories - US-Dust Sheets      $0.10
```

**Damaged/Defective Returns:** No way to know in v1 (no FBA Returns Report integration). Monthly reconciliation catches these and posts to Inventory Shrinkage - [Brand].

## E.3: Reimbursements Handling

**Scenario:** Amazon loses/damages inventory and reimburses seller.

**What happens:**
1. LMB posts income to Amazon FBA Inventory Reimbursement - [Brand]
2. Inventory is gone (Amazon lost it)
3. But Inventory Asset still has the cost on books

**Plutus handling:**
- During monthly reconciliation:
  1. Compare QBO book value to physical inventory count
  2. Identify variance by SKU
  3. Check Amazon Seller Central for reimbursement history (manual)
  4. Post adjustment:
     ```
     Debit: Inventory Shrinkage - [Brand]
     Credit: Inventory Asset: [Component] - [Brand]
     ```
- The reimbursement income (posted by LMB) offsets the shrinkage expense (posted by Plutus)

## E.4: Unknown SKU in Settlement

**Scenario:** New SKU appears in settlement that Plutus doesn't recognize.

**Handling:**
1. Plutus flags settlement as "NEEDS_ATTENTION"
2. Shows list of unknown SKUs in UI
3. User must:
   - Add SKU to Plutus with brand mapping
   - Add SKU to LMB Product Group
   - Enter landed cost (or mark as $0 if no inventory yet)
4. Reprocess settlement

**Validation:**
- Plutus should validate ALL SKUs are mapped before processing
- Block processing if any unknown SKUs

## E.5: Negative Settlement Total

**Scenario:** Settlement total is negative (fees > sales, or large reserve release).

**Handling:**
- LMB handles this normally (posts negative amounts)
- Plutus still processes COGS based on units sold
- Negative settlement doesn't mean negative COGS
- Units sold is always positive or zero

## E.6: Partial PO / Incomplete Bills

**Scenario:** Manufacturing bill arrives, but freight bill hasn't arrived yet.

**Handling:**
1. Enter manufacturing bill with Memo: `PO: PO-2026-001`
2. Plutus sees incomplete PO (missing freight/duty)
3. Plutus flags PO as "INCOMPLETE" in UI
4. When freight bill arrives, enter with same PO in Memo: `PO: PO-2026-001`
5. Plutus recalculates landed cost when all bills present

**Validation rules:**
- PO is "complete" when it has: Manufacturing bill + Freight bill + Duty bill
- User can manually mark PO as "complete" if no duty applies
- Incomplete POs show warning but don't block processing (use last known cost)

## E.7: Cost Method

**Decision: Use WEIGHTED AVERAGE cost method**

**Rationale:**
- Simpler than FIFO for FBA (commingled inventory)
- Amazon doesn't track which specific unit was sold
- Matches how most e-commerce businesses operate

**Implementation:**
- When new PO lands, recalculate weighted average for each component
- Formula: (existing_value + new_value) / (existing_units + new_units)
- Store per-unit cost per component in SkuCost table

**Example:**
```
Existing: 100 units @ $2.00 manufacturing = $200
New PO: 200 units @ $2.50 manufacturing = $500
New weighted average: $700 / 300 units = $2.33/unit
```

## E.8: 3PL Storage & Land Freight (Direct Expenses)

**These costs are NOT capitalized to Inventory Asset:**

| Cost | Why Direct Expense |
|------|-------------------|
| 3PL Storage | Monthly lump sum, not tied to specific PO or units |
| Land Freight | Incurred after goods arrive, fulfillment cost |

**How to handle:**
1. When bill arrives, estimate brand split based on inventory %
2. Post directly to COGS accounts (Storage 3PL - [Brand] or Land Freight - [Brand])
3. Plutus does NOT process these - manual entry in QBO

**Brand Split Estimation:**
- Check current FBA inventory units per brand
- Or use rough estimate (e.g., 60% US / 40% UK)
- Document your method for consistency

---

**Important:** US and UK are SEPARATE LMB connections.

## F.1: Amazon North America Connection

- **LMB Account:** Targon - AMAZON NORTH AMERICA
- **Marketplace:** Amazon.com (US)
- **Currency:** USD
- **Bank Account for Deposits:** Chase Checking (USD)
- **Product Groups to create:** US-Dust Sheets
- **SKUs:** CS-007, CS-010, CS-1SD-32M, CS-12LD-7M

## F.2: Amazon Europe Connection

- **LMB Account:** Targon - AMAZON EUROPE (or similar)
- **Marketplace:** Amazon.co.uk (UK)
- **Currency:** GBP
- **Bank Account for Deposits:** Wise GBP Account
- **Product Groups to create:** UK-Dust Sheets
- **SKUs:** CS 007, CS 008, CS 009, CS 010, CS 011, CS 1SD-32M, CS-CDS-001, CS-CDS-002

## F.3: Configuration for Each Connection

**Repeat Phase 2 steps for EACH LMB connection:**

1. Complete Accounts & Taxes Wizard
2. Create Product Group (one per connection)
3. Assign SKUs to Product Group
4. Map accounts for Product Group
5. Set tax rates:
   - US: No Tax Rate Applicable (marketplace facilitator)
   - UK: Standard Rate 20% (or as appropriate for VAT)

---

# APPENDIX G: UK VAT HANDLING

## G.1: VAT Background

- UK has 20% standard VAT rate
- Amazon collects VAT on B2C sales (marketplace facilitator)
- LMB separates VAT from gross sales

## G.2: LMB VAT Settings (UK Connection)

| Setting | Value |
|---------|-------|
| VAT Scheme | Standard |
| Default Tax Rate | 20% Standard |
| Product Groups | May need separate groups for zero-rated items |

## G.3: Impact on Accounts

- Amazon Sales - UK-Dust Sheets = NET sales (excl VAT)
- VAT collected goes to separate VAT liability account
- Plutus COGS is not affected by VAT (COGS is always net)

---

# APPENDIX H: AMAZON PROMOTIONS & COUPONS

## H.1: Missing Transaction Category

Add to LMB Transaction Categories:

| Category | Type | Split by Brand | Handled By |
|----------|------|----------------|------------|
| Amazon Promotions | Expense | Yes | LMB |

## H.2: Account Setup

**Under LMB parent (if exists) or create new:**
| Sub-Account Name | Account Type | Detail Type |
|------------------|--------------|-------------|
| Amazon Promotions - US-Dust Sheets | Cost of Goods Sold | Other Costs of Services - COS |
| Amazon Promotions - UK-Dust Sheets | Cost of Goods Sold | Other Costs of Services - COS |

## H.3: LMB Product Group Mapping

Add Promotions account mapping to each Product Group in LMB.

---

# Document History

- v1: January 15, 2026 - Initial plan
- v2: January 15, 2026 - Comprehensive A-Z implementation guide
- v2.1: January 16, 2026 - Currency simplification (all COGS in USD), refund handling (reverse COGS)
- v2.2: January 16, 2026 - Tags→Custom Fields, InventoryLedger model, dual stream processing (Sales/Returns separate), reconciliation includes 3PL+In-Transit, UNASSIGNED Product Group safety net
- v2.3: January 16, 2026 - Split-month JE logic (match LMB), historical cost lookup (as-of date), QBO bill query limitation note, currency setup correction
- v3.0: January 16, 2026 - SettlementPosting table (multi-JE support), memo-based LMB matching, removed Settlement Control, P&L timing note for returns, Tag cleanup
- v3.1: January 16, 2026 - Removed Inventory Variance account, reconciliation uses Shrinkage only (both directions), /lib/variance/ → /lib/validation/, CRITICAL validation blocks posting
- v3.2: January 16, 2026 - Added Current Status tracker. Phase 1 partial (LMB accounts done, Plutus accounts missing)
- v3.3: January 16, 2026 - Added MASTER CHECKLIST with all 38 accounts explicitly listed. Removed Amazon Reserved Balances from brand sub-accounts (balance sheet accounts don't need brand breakdown)
- v3.4: January 16, 2026 - Renamed "Plutus PO Number" → "PO Number" (simpler custom field name)
- v3.5: January 16, 2026 - MAJOR: Replaced SP-API with LMB Audit Data CSV import. Added Appendix B (Import UI design). Simplified returns handling (refunds from CSV, matched via Order ID). Removed Amazon OAuth, FBA Reports API references. Manual inventory reconciliation via Seller Central export.
- v3.6: January 16, 2026 - Added Prerequisites section (LMB Accounts & Taxes Wizard must be completed first). Referenced Setup Wizard document. Clarified account names are customizable via Setup Wizard.
- v3.7: January 16, 2026 - Added Inventory Audit Trail Principle. No opening balances allowed - all inventory movements must link to source documents (Bills or Settlements). Historical catch-up required for new users. Updated Setup Wizard to reflect these constraints.
- v3.8: January 16, 2026 - Clarified Setup Wizard creates ALL 37 sub-accounts (including revenue/fee accounts for LMB). Added "Existing Plutus Parent Accounts" section. Updated status tracker and summary table. Clarified SKU costs come from bills only (not entered during setup).
- v3.9: January 16, 2026 - MAJOR: Schema fix for marketplace (SkuCost, SkuCostHistory, InventoryLedger now have marketplace field). Changed PO linking from Custom Field to Bill Memo (PrivateNote). Added V1 Constraints section (USD-only bills, late freight policy, refund matching rule, allocation by units, CSV grouping by Invoice, idempotency via hash). Removed QBO polling for LMB settlements (CSV-only mode). Updated workflow to start with CSV upload.
- v3.10: January 16, 2026 - Fixed late freight algorithm: allocate across SKUs by PO units, but apply to on-hand units at bill date (prevents inventory drift). Added JE memo format spec for rollback. Added refund UX for cross-period matching. Final doc cleanup for Custom Field → Memo references.
- v3.11: January 16, 2026 - MAJOR: (1) InventoryLedger now tracks component costs (unitMfgUSD, unitFreightUSD, etc.) for sub-account reconciliation. (2) Added orderId field for cross-period refund matching (DB-first lookup). (3) Added Opening Snapshot support for catch-up mode with sourced documentation. (4) Added Rounding account and JE balancing policy. (5) Added Mixed-Brand PO constraint. Total V1 constraints now 12.
- v3.12: January 17, 2026 - (1) Added late freight edge case: block when on-hand = 0. (2) Added QBO Opening Initialization JE requirement for catch-up mode. (3) Added QBO query pagination limits (90-day lookback, 100 per page). (4) Clarified Name vs FullyQualifiedName for account creation. (5) Added returns quantity priority logic. (6) Updated idempotency key to include marketplace. (7) Clarified Settlement vs CsvUpload model hierarchy. (8) Fixed account summary to show "8 + 12 + 1 Rounding + 16".
- v3.13: January 17, 2026 - (1) Added Inventory Shrinkage brand sub-accounts (2 accounts) so brand P&Ls sum to 100%. (2) Total sub-accounts now 39 (was 37). (3) Clarified COGS posting responsibility (Plutus vs Manual for Land Freight/Storage 3PL). (4) Fixed bill parsing validation to apply to manufacturing lines only. (5) Added detailed PO completeness rules.
- v3.14: January 17, 2026 - MAJOR: (1) Fixed QBO Account.Name uniqueness issue - Inventory Asset accounts now prefixed with "Inv" (e.g., "Inv Manufacturing - US-Dust Sheets") to avoid collision with COGS accounts. (2) Removed Rounding account - JEs now balance by construction (round component totals, not individual SKUs). Total sub-accounts now 38 (was 39). (3) Updated bill parsing to support UK SKUs with spaces (e.g., "CS 007", "CS 1SD-32M"). (4) Fixed Step 6.x numbering (6.2→6.3→6.4). (5) Standardized Detail Type spelling to "Other Costs of Services - COS".
- v3.15: January 17, 2026 - (1) CRITICAL: Settlement processing now stores sales at ORDER-LINE granularity (one InventoryLedger entry per orderId+sku), not aggregated. Required for DB-first refund matching to work across periods. (2) Added explicit Bill Effective Date Rule: "bill date" = QBO TxnDate, not entry time. (3) Clarified "Brand P&L sums to 100%" applies to Amazon operations only, not company overhead.
- v3.16: January 17, 2026 - (1) Added COST_ADJUSTMENT ledger type for late freight/duty bills (value-only events with quantityChange=0). (2) Synced Setup Wizard to use correct "Inv" prefix for all Inventory Asset account names. (3) Added Inventory Shrinkage to wizard COGS list. (4) Separated "Plutus posts" vs "Manual" COGS sections in wizard.
- v3.17: January 17, 2026 - (1) Fixed Step 1.4 to use "Inv" prefix for Inventory Asset accounts (was inconsistent with MASTER CHECKLIST). (2) Updated QBO pagination: maxresults up to 1000, recommended 500-1000 for efficiency. (3) Added V1 Constraint #14: Immutable Cost Snapshots (no retro-costing). (4) Added V1 Constraint #15: Date Normalization (midnight UTC). (5) Added SkuMapping.aliases field for SKU text variant matching in bill parsing.
- v3.18: January 17, 2026 - (1) Added V1 Constraint #16: QBO Duplicate JE Safety Check (two-tier idempotency - DB + QBO search). (2) Added V1 Constraint #17: Same-Day Event Ordering (deterministic ledger replay). (3) Added note that InventoryLedger running totals are derived/recomputable. (4) Improved late freight BLOCK message with actionable diagnostics (shows PO, SKU, depleting settlements, options).
- v3.19: January 17, 2026 - (1) Added V1 Constraint #18: Marketplace Normalization (canonical values). (2) Added partial refund guardrail to Refund Matching Rule. (3) Added PURCHASE date semantics as explicit accounting policy. (4) Added reconciliation component split rule. (5) Made SKU alias matching BRAND-AWARE (scope to brand from bill line Account to prevent cross-brand alias collisions).
