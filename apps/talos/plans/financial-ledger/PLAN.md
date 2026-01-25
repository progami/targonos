# Financial Ledger (Storage + Cost Ledger Unification) — Plan

## Why

Talos currently stores money-impacting facts in multiple places:

- **StorageLedger** (weekly balances + storage cost)
- **CostLedger** (per inventory transaction costs, e.g. inbound/outbound/forwarding)

We also need first-class support for:

- **Supplier credit/debit notes** (quantity variance, pricing variance, etc.)
- future invoice generation and reconciliation (warehouse invoices vs expected costs)

This plan consolidates financial facts into one place: **Financial Ledger**.

## Goals

- A single, queryable ledger for all costs/credits/debits across Talos
- No double counting (costs attach to a real event and have one canonical entry)
- Clear audit trail: who/when/why, with linked documents
- Works for both US and UK tenants without branching logic per screen

Note: this is a **financial** ledger. Operational inventory/balance ledgers (e.g., storage balance history) may remain for reporting; only the **money** portion is unified.

## Non-goals (for the first rollout)

- Full accounting system (payments, GL integration)
- Automated supplier credit/debit settlement
- Perfect freight allocation across mixed-PO shipments (unless required)

## What becomes a “Financial Ledger entry”

Any monetary fact that should affect costing or invoicing:

- Storage accruals (weekly)
- Inbound handling fees (on receipt)
- Outbound handling fees (on ship)
- Forwarding/freight (on shipment)
- Customs/duty (on clearance)
- Supplier credit notes (negative entries)
- Supplier debit notes (positive entries)

## Required behaviors

- Each entry has:
  - category (Storage / Inbound / Outbound / Forwarding / Product / Adjustments / Duty)
  - amount + currency
  - effective date (when the cost applies)
  - reference links (PO, shipment, movement note, warehouse invoice, etc.)
  - created by / created at
  - document attachments when relevant (e.g., supplier credit note PDF)
- Posted entries are immutable (changes are new entries, not edits).

## Migration strategy (safe + incremental)

1) **Add Financial Ledger (additive)**
   - introduce a new ledger table and write APIs
   - keep existing StorageLedger and CostLedger untouched
   - enforce idempotency via stable reference keys (e.g., `sourceType` + `sourceId`)

2) **Dual-write for new events**
   - new features write to Financial Ledger
   - legacy writes (storage weekly calc, receipt cost calc) continue until cutover

3) **Backfill historical data**
   - map StorageLedger.totalStorageCost → Financial Ledger (Storage)
   - map CostLedger.totalCost → Financial Ledger (Inbound/Outbound/Forwarding)
   - keep source ids so we can de-duplicate and audit

4) **Cut read paths**
   - reports/pages read from Financial Ledger
   - old pages either redirect or become views on top of Financial Ledger

5) **Deprecate old ledgers**
   - stop writing to CostLedger/StorageLedger
   - keep tables for historical compatibility until removal is safe

## Credit/Debit Notes (how they fit)

- When quantities diverge after Issued (short-produced, damaged, etc.), the system creates:
  - a **Supplier Credit Note entry** (negative) for the variance amount, or
  - a **Supplier Debit Note entry** (positive) for the variance amount
- Split shipments (partial loads) do **not** create credit/debit notes; notes are created only when the variance is treated as **final** (cancel remainder or close with variance).
- The entry is linked to:
  - the PO (commercial reference)
  - the event that caused the variance (manufacturing completion, shipment allocation, receipt discrepancy)
  - the supplier
- The system calculates the default amount from the best available facts (e.g., ordered vs shipped/received variance, confirmed unit cost, supplier-invoiced amount when available).
- Users can override the calculated amount, but must provide:
  - a reason/note
  - the supporting document (credit/debit note) attachment
  - an audit trail (who/when/old→new)

## Accounting safeguards (avoid double counting)

- Costs must be event-scoped:
  - storage accrues per week per warehouse/SKU/batch
  - receipt costs tie to a receipt event
  - freight ties to a shipment event (Tactical: the split PO)
- If a commercial order is split into multiple POs (Shipping PO + Remainder PO):
  - freight is recorded per split PO (one shipment per PO)
  - product cost totals move with the split quantities (sum across the split group must equal the original; no duplication)
  - financial entries must reference the correct split PO and the split group/original PO for traceability
- If a future enhancement allows one shipment to include multiple POs:
  - financial entries must store allocation metadata to split freight correctly

## Open decisions (need confirmation)

- Tactical decision: split into separate POs (one shipment per PO), so freight/forwarding can reference the split PO directly.
- Future decision: if we need one shipment/container to include multiple POs, we must introduce a shipment entity and allocate freight across the linked POs.
