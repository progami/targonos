# Talos — RFQ / PO Flow (Tactical)

This document defines the RFQ→PO workflow in Talos for Tactical (US/UK). It is intentionally non‑technical and describes what users see and what is required at each step.

## Core principles

- One page, one flow: the RFQ/PO is always the same screen; only editability changes by stage.
- Tabs stay consistent: `Details`, `Cargo`, `Costs`, `Documents`, `History` are always present.
- No gating modals: advancing a stage fails with inline `!` markers and directs the user to the exact missing field.
- Inventory Ledger is the source of truth: inventory is created only by receiving at `At Warehouse`.

## Stages

1) `RFQ` (DRAFT) → 2) `Issued` → 3) `Manufacturing` → 4) `In Transit` → 5) `At Warehouse`

### Stage ownership rule

- Only the **current stage** is editable.
- Previous stages are read-only.

## What lives in each tab (by stage)

### 1) RFQ

Goal: build a complete request for quote (supplier + cargo lines + assumptions) so it can be issued.

**Details**

```
[Order Info]
RFQ # (read-only)
Supplier (select from Suppliers)
Destination (derived from tenant)
Cargo Ready Date
Incoterms
Payment Terms
Notes (optional)
```

**Cargo**

```
[Lines]
SKU (must exist)
Batch (must exist)
Units Ordered
Units / Carton   (!! must divide exactly)
PI # (required)

[Attributes needed for later shipping marks]
Commodity Code (required, region-validated)
Country of Origin (required)
Material (required)
Net Weight (kg) (required)
Gross Weight (kg) (required)
Carton Dimensions (cm) (required)
```

**Costs**

```
[Product Costs]
Target unit cost / total cost per line (required)
Currency (derived from tenant; line-level shown)
```

**Documents**

```
PI documents:
- For every unique PI # used in Cargo lines, a PI document upload is required.
```

**History**

```
Audit log (creation + edits)
```

**Advance action: Issue PO**

To Issue, the RFQ must have:

- Supplier selected
- Cargo Ready Date, Incoterms, Payment Terms
- ≥ 1 cargo line
- For every line: SKU+Batch, Units Ordered, Units/Carton (divisible), PI #
- Shipping-mark inputs complete (commodity/origin/material/weights/dimensions)
- Product cost per line
- PI documents uploaded (one per unique PI #)
- Supplier banking info present on the Supplier record (required to issue a PO)

---

### 2) Issued

Goal: lock commercial terms (this is now a real PO) while still allowing packaging/spec details to be finalized before production.

**Details**

```
[Order Info]
PO # (read-only, assigned at Issued)
Supplier (read-only)
Destination (derived)
Cargo Ready Date (read-only)
Incoterms (read-only)
Payment Terms (read-only)
Ship To (standardized company details; not user input)
Supplier Banking (from Supplier; visible)
```

**Cargo**

```
[Lines] (read-only commercial snapshot)
SKU, Batch, Units Ordered, PI # are locked

[Attributes] (editable packaging/spec inputs until Manufacturing)
Commodity Code / COO / Material / Net+Gross / Carton Dims
Units / Carton (still editable; must stay divisible)
```

**Costs**

```
[Product Costs] (confirmed)
Line totals shown and locked
```

**Documents**

```
PI docs are visible (already required at Issue)
```

**Outputs**

- PO PDF can be generated.
- Shipping Marks can be generated.

**Advance action: Advance to Manufacturing**

To advance, packaging/spec inputs must be valid (no missing shipping-mark inputs, units/carton divisible).

---

### 3) Manufacturing

Goal: track production and confirm what will be dispatched as Shipment #1 (split shipments supported).

**Details**

```
Manufacturing Start Date (required to advance)
Factory details (optional if present)
```

**Cargo**

```
[Lines] (read-only)

[Dispatch Plan: Ship Now cartons]  (required to advance)
Per line: Ship Now Cartons (0..available)
If Ship Now < available → system creates a remainder PO in the same split group.
Carton ranges are preserved:
- Shipping PO covers range A..B / Total
- Remainder PO covers range (B+1)..Total / Total
```

**Costs**

```
Product cost locked (commercial)
No warehouse costs yet
```

**Documents**

```
Box Artwork upload required to advance
```

**Advance action: Advance to In Transit**

Required:

- Manufacturing Start Date
- Box Artwork document uploaded
- Dispatch Plan filled (at least one carton dispatched)

---

### 4) In Transit

Goal: record shipping identifiers + documents, plus freight (forwarding).

**Details**

```
Vessel Name (required)
POL / POD (required)
BOL ref (required)
Commercial Invoice # (required)
Packing List ref (required)
```

**Cargo**

```
Read-only shipping snapshot
(Includes carton ranges from split shipments)
```

**Costs**

```
Forwarding (Freight) — required before receiving
```

**Documents**

```
Required uploads:
- Commercial Invoice
- Bill of Lading
- Packing List
```

**Advance action: Advance to At Warehouse**

Required:

- All In Transit identifiers
- CI/BOL/Packing List uploaded
- Freight cost recorded

---

### 5) At Warehouse

Goal: receive inventory into the Inventory Ledger, capture customs entry, and reconcile discrepancies.

**Details**

```
Warehouse (required)
Receive Type (required)
Import Entry Number (required; region-validated)
Customs Cleared Date (required)
Received Date (required)
Discrepancy Notes (required if any received qty != ordered)
```

**Cargo**

```
[Receiving]
Per line: Received Cartons (default = ordered cartons)
If any line differs, Discrepancy Notes required.
```

**Costs**

```
Inbound costs are calculated on receive using warehouse rate list.
Forwarding (Freight) must exist.

[Supplier Credit/Debit]
If received quantity differs from ordered and product cost exists:
- System calculates an expected Supplier Credit (short) or Supplier Debit (over)
- Stored in Financial Ledger and can be overridden.
```

**Documents**

```
Required uploads:
- Movement Note
- Customs & Border Patrol Clearance Proof
```

**Action: Receive Inventory**

Creates Inventory Ledger transactions. After this, inventory exists and can be used by downstream flows (FO, transfers, etc.).

## Notes on split shipments (how we avoid double counting)

- A split shipment creates a remainder PO in the same split group.
- Product costs are split proportionally by units shipped now vs remainder.
- Freight/inbound/outbound/storage costs remain tied to the PO that actually incurs them.
- Supplier credits/debits (if any) are recorded explicitly in the Financial Ledger for reconciliation.

