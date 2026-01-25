# Quantity Reconfirmation (Across Talos) — Plan

## Why

Quantities diverge from plan in real operations (short production, partial loads, damage, partial receipts, etc). Talos needs a consistent way to:

- prevent “silent drift” in quantities
- keep the inventory ledger correct
- keep costs/credits/debits auditable
- avoid double counting (especially when items move multiple times)

This plan defines **where** quantities must be reconfirmed and **what** the UI/flow must enforce.

## Core model (non-negotiable)

For any workflow that moves inventory or creates a financial obligation, we keep **three separate quantity truths**:

1) **Planned** — what the user intends to do (editable; no ledger impact)  
2) **Shipped / Dispatched** — what physically left a location (confirmed; creates outbound facts)  
3) **Received** — what physically arrived (confirmed; posts the inbound facts / closes the loop)

If any value differs from the prior one, it is a **variance** and must be explicit in the UI with a reason and (when required) a document.

## Where reconfirmations happen

### Purchase Orders (RFQ/PO flow)

**Commercial**
- RFQ/Issued: ordered units (commercial snapshot)
- Units/carton is a packaging attribute (used for shipping marks) and locks once Manufacturing starts

**Physical**
- Manufacturing Dispatch: confirm **split allocation** (cartons shipping now) and create a Remainder PO for the rest (or cancel remainder as final variance)
- At Warehouse: confirm **received cartons/units per line** and require discrepancy notes when mismatched

**Variance handling**
- Split shipments do **not** trigger credit/debit notes (the remainder is still expected to ship later).
- Short/over variances create credit/debit notes only when treated as **final** (e.g., remainder cancelled or PO closed with confirmed variance).
- Short variance (final): **Supplier Credit Note** financial entry (system-calculated; override allowed with reason + doc)
- Over variance (final): **Supplier Debit Note** financial entry (system-calculated; override allowed with reason + doc) or explicit “bonus/FOC” handling

### Warehouse-to-warehouse transfers

- Transfer Draft: planned quantities per SKU/batch
- Dispatch (from warehouse A): confirm quantities leaving A (must be ≤ on-hand ledger)
- Receive (at warehouse B): confirm quantities received; discrepancies require notes

### AWD / Amazon flows

- Plan: planned quantities (no ledger impact)
- Ship: confirm quantities shipped (creates outbound inventory facts)
- Receive/Confirm: reconcile against platform receipt (SP-API) or manual receipt confirmation

## UI requirements

- Show **Planned vs Shipped vs Received** side-by-side wherever divergence can occur.
- On confirm steps:
  - default values should prefill from the previous truth (planned → shipped → received)
  - if values differ, require:
    - discrepancy notes (minimum)
    - additional docs where the flow demands them
- No gating modals:
  - the primary action returns field-level validation
  - UI highlights the tab + field with a red indicator and scrolls the user to the exact location

## Ledger rules (inventory is holy)

- Inventory ledger is the source of truth for available stock.
- “Plan” and “Draft” steps must never alter the inventory ledger.
- Only **confirmed** events can post ledger entries:
  - dispatch posts outbound facts
  - receive posts inbound facts
- Costs must attach to a **real event** (dispatch/receive) so they cannot be duplicated by editing drafts.

## Phased implementation (recommended)

1) Apply reconfirmation pattern to **PO flow** (Manufacturing allocation + receiving)
2) Apply to **warehouse transfers** (dispatch + receive)
3) Apply to **AWD/Amazon** (ship confirmation + reconcile receipt)

## Open decisions (need confirmation)

- Do we allow one shipment to contain multiple POs (freight allocation required), or keep “one shipment ↔ one PO” for Tactical MVP?
- PO flow (Tactical): single receive event that closes the PO (decided in PO PRD)
- For other flows: do we support multi-event partial receipts, or only a single receive action with variance notes?
