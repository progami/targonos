# Plutus Subledger Redesign

## Decision

Plutus will be the deterministic Amazon/QBO control, mapping, inventory, and audit subledger.
QBO remains the formal accounting ledger.

The redesign is inventory-COGS first. Plutus and QBO outputs should not depend on brand-level QBO accounts or SKU-level P&L allocation. The core goal is source-to-COGS truth for inventory assets by marketplace, canonical product, SKU alias, PO, and landed-cost component.

Posting shape should not be optimized around whether QBO output is a form or a journal entry. Posting shape matters only when it improves traceability without distorting accounting.

QBO accounts should stay accounting-focused. SKU and PO truth belongs in Plutus structured data only where it affects inventory asset release into COGS. QBO memo and line descriptions carry Plutus trace references, and QBO item/product fields may be used when they are stable and helpful, but QBO account names must not be the operating subledger.

Plutus still owns settlement reclassing, but settlement reclassing is category-level only:

- all Amazon sales go to Amazon Sales;
- all Amazon refunds go to Amazon Refunds;
- all Amazon FBA fees go to Amazon FBA Fees;
- all Amazon seller/referral fees go to Amazon Seller Fees;
- all Amazon advertising costs go to Amazon Advertising Costs;
- all Amazon storage/AWD fees go to the selected storage/warehousing accounts;
- all reserve, tax, rollover, and settlement-control lines go to their control accounts.

Plutus must not allocate settlement operating fees into brand or SKU P&L accounts. Sellerboard owns sales-side and fee-side SKU profitability.

## Current Facts Verified

- Current Plutus settlement ingestion posts Amazon settlement source output to QBO journal entries.
- Current Plutus COGS and P&L processing posts QBO journal entries.
- Current Plutus already reads QBO bills and purchases as cost inputs.
- Current QBO has Amazon customers and vendors available.
- Current QBO has no enabled classes, no departments, no PO custom field, and only a minimal item list.
- Current QBO detail is mostly carried through Chart of Accounts subaccounts such as US-PDS and UK-PDS. That is legacy behavior to migrate away from, not the target architecture.

## Architecture

The target architecture is:

```text
Amazon/QBO source documents
  -> normalized Plutus events
  -> canonical product, SKU alias, and PO mapping
  -> PO cost layers and inventory movements
  -> inventory valuation and COGS
  -> QBO posting output on simple accounting accounts
  -> Sellerboard COGS export/update
  -> drift audit and tieout views
```

Plutus tables carry the truth. QBO memo and line descriptions carry trace references only.

## Ownership

| Layer | Owner |
|---|---|
| Financial statements | QBO |
| Amazon settlement interpretation | Plutus |
| Canonical product and SKU aliases | Plutus |
| PO trail and supplier reference | Plutus |
| Landed cost by component | Plutus |
| Inventory ledger and COGS engine | Plutus |
| COGS batches for Sellerboard | Plutus |
| Source documents and tieouts | Plutus |
| Final summarized accounting output | QBO |
| Sales-side SKU profitability | Sellerboard |
| Fee-side SKU profitability | Sellerboard |

## Core Data Model

| Entity | Purpose |
|---|---|
| CanonicalProduct | One real sellable product across markets and aliases. |
| SkuAlias | Maps Amazon seller SKU, ASIN, UK SKU, US SKU, and other aliases to a canonical product. |
| ProductGroup | Optional Plutus reporting bucket such as PDS, CDS, future families, or categories. It is not a QBO account requirement. |
| PurchaseOrder | Internal PO record with supplier reference, market, status, source documents, and QBO links. |
| PoCostLayer | Cost attached to a PO by canonical product, component, quantity basis, amount, and source document. |
| InventoryMovement | Unit movement such as receipt, sale, return, removal, disposal, or approved adjustment. |
| Settlement | Amazon settlement source period plus raw imported rows. |
| PostingIntent | What Plutus expected to post to QBO, including source hash, mapping version, and line fingerprints. |
| QboPosting | Actual QBO transaction IDs, sync tokens, posting hash, attachments, and drift status. |
| SellerboardCogsBatch | COGS values generated from PO cost layers and inventory movements for Sellerboard update/import. |

### PO Cost Layer

`PoCostLayer` means what inventory cost exists.

Examples:

- PO-19 manufacturing for CS-007.
- PO-19 freight allocated to CS-007.
- PO-19 duty for the applicable HTS treatment.
- PO-19 boxes/accessories assigned to CS-007.

Each layer records component, amount, quantity basis, source document, and allocation method.

### Inventory Movement

`InventoryMovement` means where inventory units went.

Examples:

- PO receipt into inventory.
- Amazon sale consuming units.
- Refund/return reversing or restoring units according to treatment.
- Removal/disposal.
- Approved count or cost adjustment.

COGS and inventory valuation must come from `InventoryMovement + PoCostLayer`, not from QBO account names.

### Inventory SKU Assignment Contract

Only inventory-affecting lines need SKU/PO assignment. Every source line that affects inventory asset release must resolve to one of these states before COGS posting or Sellerboard COGS export:

| State | Meaning | Action |
|---|---|---|
| `SKU_DIRECT` | Inventory source or settlement unit row carries a seller SKU, ASIN, or stable alias. | Map to canonical product and SKU alias. |
| `SKU_ALLOCATED` | Inventory source cost is SKU-less, but a deterministic source allocates it to SKUs. | Store allocation source and split to canonical products. |
| `NON_INVENTORY_APPROVED` | Source line is settlement operating fee, tax, reserve, rollover, control, or another non-inventory line. | Post category-level QBO settlement entry only; no COGS allocation. |
| `BLOCKED_UNMAPPED` | SKU, ASIN, allocation source, PO, cost layer, or treatment is missing for inventory COGS. | Block COGS posting/export and show exception. |

There is no "parent unless SKU exists" P&L rule. Settlement operating lines are category-level by design. SKU detail is required only when the line changes inventory units, inventory value, COGS, or Sellerboard COGS output.

### Settlement Reclass Contract

Settlement reclassing must be simple and deterministic:

| Settlement Source | QBO Output |
|---|---|
| Sales principal and shipping income | Amazon Sales |
| Refund principal and refunded shipping | Amazon Refunds |
| FBA fulfillment, chargeback, inbound, storage, and AWD fees | Amazon FBA Fees, Amazon Storage Fees, or Warehousing as configured |
| Referral/commission/subscription/seller fees | Amazon Seller Fees |
| Advertising charges | Amazon Advertising Costs |
| Marketplace facilitator and collected tax | Amazon Sales Tax |
| Reimbursements | Amazon FBA Inventory Reimbursement |
| Reserves, failed disbursement, split-month rollover | Plutus control accounts |
| Payout leg | Plutus Settlement Control |

This settlement reclassing does not create SKU, brand, PO, or product-group subaccounts. It keeps the QBO P&L clean and lets Sellerboard handle SKU-level sales and fee analytics.

## UI Workflow

Plutus should mirror Link My Books at the top level, with a deeper PO and inventory layer underneath.

| Section | Purpose |
|---|---|
| Settlements | Import, review, map, post, and reconcile Amazon settlements. |
| Products | Manage canonical products, SKU aliases, ASINs, marketplace SKUs, and product groups. |
| Purchase Orders | Manage PO trail, supplier refs, QBO bills, cost components, and source documents. |
| Inventory Ledger | Show receipts, sales, returns, removals, adjustments, valuation, and COGS. |
| Mappings | Manage Amazon settlement category mapping and QBO account mapping. |
| QBO Audit | Show posted vs expected, missing, edited, duplicate, and stale mapping exceptions. |
| Settings | Manage QBO connection, posting preferences, markets, and import configuration. |

The current COGS Inputs page should evolve into structured Purchase Orders and Inventory Ledger workflows. It should not remain a loose transaction queue as the main control surface.

## QBO Posting SOP

This SOP applies to Plutus-owned QBO postings.

| QBO Field | Requirement |
|---|---|
| Attachments | Mandatory. Attach source file, supplier invoice, settlement export, or tieout. |
| Memo / PrivateNote | Mandatory. Short Plutus trace only. |
| Line Description | Mandatory. Human-readable category plus Plutus line reference only. |
| Doc Number | Real external source reference only. Do not overload with internal metadata. |
| QBO Accounts | Keep simple accounting accounts. No brand, SKU, PO, or product-group account explosion. |
| QBO Item/Product fields | Use only when QBO supports the field cleanly on the transaction form and the value is mirrored from Plutus. Do not treat QBO items as the source of SKU truth in this phase. |

Memo pattern:

```text
PLUTUS_REF=<id>; SOURCE=<source>; MARKET=<market>; PERIOD=<period>
```

Trace fields:

| Field | Allowed Shape |
|---|---|
| `PLUTUS_REF` | Stable Plutus posting or source identifier. |
| `SOURCE` | `AMZ_SETTLEMENT`, `QBO_BILL`, `QBO_PURCHASE`, or `MANUAL_ADJUSTMENT`. |
| `MARKET` | `US`, `UK`, or `MULTI`. |
| `PERIOD` | `YYYY-MM` or `YYYY-MM-DD..YYYY-MM-DD`. |

Line description pattern:

```text
<category>; PLUTUS_LINE=<line_id>
```

The Finance shared-drive SOP must explicitly mark these as Plutus-owned QBO postings so memo, line description, and attachments are treated as required controls, not optional notes.

### QBO Account Model

QBO should not mirror Plutus dimensions as accounts. The desired QBO account shape is accounting-category first:

- Amazon Sales
- Amazon Refunds
- Amazon Seller Fees
- Amazon FBA Fees
- Amazon Advertising Costs
- Amazon Storage Fees
- Amazon FBA Inventory Reimbursement
- Manufacturing COGS
- Freight COGS
- Duty COGS
- Mfg Accessories COGS
- Inventory Asset
- Plutus Settlement Control

SKU, PO, canonical product, and allocation method are carried by Plutus records and QBO trace references, not by account names like `Amazon FBA Fees - US-PDS` or `Manufacturing - CS-007`.

## Posting Shape

| Event | QBO Treatment |
|---|---|
| Supplier manufacturing, freight, duty, or accessory invoice | QBO Bill when payable. |
| Supplier manufacturing, freight, duty, or accessory charge already paid | QBO Purchase when paid directly from a bank or card account. |
| Amazon settlement summary | Phase 1 keeps the current journal-entry posting shape, but the rows must be generated from the new Plutus normalized model and posted to simple accounting accounts. |
| COGS from inventory ledger | Journal entry until QBO inventory items are intentionally adopted. |
| Internal reclass, reserve, rollover, or cleanup | Journal entry only when it is a true internal accounting movement. |

COGS should not become a fake vendor bill. It is inventory asset moving into COGS.
Converting Amazon settlement summaries from journal entries into QBO sales forms is out of scope for this phase.

### Sellerboard Output

Sellerboard should receive COGS values from Plutus, derived from QBO-supported source documents and Plutus cost layers.

For each Sellerboard COGS update/import, Plutus must be able to show:

- canonical product and marketplace SKU;
- PO and supplier reference when the cost came from a PO;
- landed-cost components included;
- source QBO bill/purchase/journal IDs;
- allocation method;
- effective date or date range;
- tieout against QBO source amounts and Plutus inventory movement consumption.

Sellerboard is not the source of landed cost truth. It is the product-profitability consumer of the SKU-level cost output.

## Drift Control

QBO drift is a real concern. Plutus must not assume posted objects stay unchanged.

| Drift Type | Control |
|---|---|
| QBO amount changed | Store QBO transaction ID, sync token, and line hash; re-fetch and compare. |
| QBO account changed | Compare expected account IDs to live QBO line accounts. |
| QBO transaction deleted or voided | Re-fetch by ID and mark missing in QBO. |
| QBO memo changed | Flag missing backlink, but do not lose truth because Plutus has structured IDs. |
| Duplicate posting created | Search by source ID, Plutus ref, amount, date, and posting hash. |
| Mapping changed after posting | Mark posting stale and require re-preview before correction. |
| Source data changed | Compare source hash and block silent overwrite. |
| QBO brand/SKU account used | Flag as legacy-account leakage and block new posting once migration mode is enabled. |

Posting states should include:

- `draft`
- `ready`
- `posted`
- `in_sync`
- `drifted`
- `missing_in_qbo`
- `duplicate_qbo_posting`
- `stale_mapping`
- `blocked`

Plutus should show the diff and require explicit approval before reversing or reposting.

## Reporting Model

QBO should support clean financial statements.
Plutus should support inventory asset, COGS, SKU unit movement, PO, landed-cost, and optional product-group cost reporting.

The design intentionally avoids depending on QBO brand/product subaccounts for Plutus truth. Product group and brand-style cost reporting may live in Plutus structured data. QBO account mappings remain accounting mappings, not the operating subledger.

Brand-level QBO accounting is not a target. If legacy QBO brand subaccounts exist, Plutus should read them only for migration/audit and should move new postings toward SKU-classified Plutus data plus simple QBO accounts.

## Non-Goals

- Do not make QBO the SKU/PO inventory ledger in this phase.
- Do not create SKU, PO, or brand account explosions in QBO.
- Do not keep brand-level QBO subaccounts as the Plutus reporting mechanism.
- Do not allocate ads, FBA fees, seller fees, storage, AWD, reimbursements, or other settlement operating lines to SKU or brand P&L inside Plutus.
- Do not parse QBO memos as the source of truth.
- Do not convert every journal entry into a transaction form for cosmetic reasons.
- Do not build a generic finance workflow outside Plutus-owned Amazon/QBO postings.

## Success Criteria

- Every Plutus-owned QBO posting has mandatory attachment, memo trace, and line references.
- Every settlement amount can be traced from Amazon source rows to Plutus normalized events to QBO output.
- Every COGS amount can be traced from Amazon sale or return to inventory movement and PO cost layer.
- SKU aliases resolve to canonical products across US and UK.
- Every SKU-level Sellerboard COGS update can be regenerated from Plutus cost layers and QBO source evidence.
- Settlement operating lines post to simple QBO category accounts without brand/SKU/PO subaccount allocation.
- QBO drift is detected by re-fetching live QBO objects and comparing stored expectations.
- QBO account mapping can be simplified without losing Plutus reporting detail.
- No new Plutus-owned QBO posting requires brand, SKU, PO, or product group encoded in the account name.
