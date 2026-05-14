# Plutus Subledger Redesign

## Decision

Plutus will be the deterministic Amazon/QBO control, mapping, inventory, and audit subledger.
QBO remains the formal accounting ledger.

The redesign should not optimize around whether QBO output is a form or a journal entry. Posting shape matters only when it improves traceability without distorting accounting. The core goal is source-to-COGS truth by marketplace, product group, canonical product, SKU alias, PO, and landed-cost component.

## Current Facts Verified

- Current Plutus settlement ingestion posts Amazon settlement source output to QBO journal entries.
- Current Plutus COGS and P&L processing posts QBO journal entries.
- Current Plutus already reads QBO bills and purchases as cost inputs.
- Current QBO has Amazon customers and vendors available.
- Current QBO has no enabled classes, no departments, no PO custom field, and only a minimal item list.
- Current QBO detail is mostly carried through Chart of Accounts subaccounts such as US-PDS and UK-PDS.

## Architecture

The target architecture is:

```text
Amazon/QBO source documents
  -> normalized Plutus events
  -> canonical product, SKU alias, product group, and PO mapping
  -> PO cost layers and inventory movements
  -> inventory valuation and COGS
  -> QBO posting output
  -> drift audit and tieout views
```

Plutus tables carry the truth. QBO memo and line descriptions carry trace references only.

## Ownership

| Layer | Owner |
|---|---|
| Financial statements | QBO |
| Amazon settlement interpretation | Plutus |
| Canonical product and SKU aliases | Plutus |
| Product group assignment | Plutus |
| PO trail and supplier reference | Plutus |
| Landed cost by component | Plutus |
| Inventory ledger and COGS engine | Plutus |
| Source documents and tieouts | Plutus |
| Final summarized accounting output | QBO |

## Core Data Model

| Entity | Purpose |
|---|---|
| CanonicalProduct | One real sellable product across markets and aliases. |
| SkuAlias | Maps Amazon seller SKU, ASIN, UK SKU, US SKU, and other aliases to a canonical product. |
| ProductGroup | Reporting bucket such as PDS, CDS, future brands, or categories. |
| PurchaseOrder | Internal PO record with supplier reference, market, status, source documents, and QBO links. |
| PoCostLayer | Cost attached to a PO by canonical product, component, quantity basis, amount, and source document. |
| InventoryMovement | Unit movement such as receipt, sale, return, removal, disposal, or approved adjustment. |
| Settlement | Amazon settlement source period plus raw imported rows. |
| PostingIntent | What Plutus expected to post to QBO, including source hash, mapping version, and line fingerprints. |
| QboPosting | Actual QBO transaction IDs, sync tokens, posting hash, attachments, and drift status. |

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
| QBO Accounts | Keep simple accounting accounts. Avoid SKU, PO, and brand account explosion. |

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

## Posting Shape

| Event | QBO Treatment |
|---|---|
| Supplier manufacturing, freight, duty, or accessory invoice | QBO Bill when payable. |
| Supplier manufacturing, freight, duty, or accessory charge already paid | QBO Purchase when paid directly from a bank or card account. |
| Amazon settlement summary | Phase 1 keeps the current journal-entry posting shape, but the rows must be generated from the new Plutus normalized model. |
| COGS from inventory ledger | Journal entry until QBO inventory items are intentionally adopted. |
| Internal reclass, reserve, rollover, or cleanup | Journal entry only when it is a true internal accounting movement. |

COGS should not become a fake vendor bill. It is inventory asset moving into COGS.
Converting Amazon settlement summaries from journal entries into QBO sales forms is out of scope for this phase.

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
Plutus should support product group, SKU, PO, and landed-cost profitability.

The design intentionally avoids depending on QBO brand/product subaccounts for Plutus truth. Product group and brand-style reporting live in Plutus structured data. QBO account mappings remain accounting mappings, not the operating subledger.

## Non-Goals

- Do not make QBO the SKU/PO inventory ledger in this phase.
- Do not create SKU, PO, or brand account explosions in QBO.
- Do not parse QBO memos as the source of truth.
- Do not convert every journal entry into a transaction form for cosmetic reasons.
- Do not build a generic finance workflow outside Plutus-owned Amazon/QBO postings.

## Success Criteria

- Every Plutus-owned QBO posting has mandatory attachment, memo trace, and line references.
- Every settlement amount can be traced from Amazon source rows to Plutus normalized events to QBO output.
- Every COGS amount can be traced from Amazon sale or return to inventory movement and PO cost layer.
- SKU aliases resolve to canonical products across US and UK.
- QBO drift is detected by re-fetching live QBO objects and comparing stored expectations.
- QBO account mapping can be simplified without losing Plutus reporting detail.
