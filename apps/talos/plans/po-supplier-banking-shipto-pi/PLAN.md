# Purchase Orders: Default Supplier Banking + Ship-To Consistency + PI Numbers

**Author:** GPT  
**Created:** January 24, 2026 at 03:07 AM CST  
**Status:** Planned

---

## Context / Problem

On PO detail/PDF (example: `/talos/operations/purchase-orders/9c89e5c2-2c47-4570-ad53-879a1a88cb99`):

- Supplier banking information should be present by default (pulled from supplier record / PO snapshot).
- Ship-to address formatting is inconsistent:
  - Missing phone number
  - Address line breaks are excessive / inconsistent
  - Country code missing
- Add PI number(s) to the PO since a single PO can contain multiple Proforma Invoices (PIs).

## Objectives

1) Always show supplier banking info on the PO (UI + PDF), sourced consistently.
2) Standardize ship-to block formatting and required fields (name, phone, country code, address formatting).
3) Support multiple PI numbers per PO and display them in the PO header/summary (UI + PDF).

## Decisions Needed (before implementation)

- **Source of truth for banking info:** dynamic from Supplier vs snapshot stored on the PO at issue-time (recommended for auditability).
- **Ship-to source of truth:** configured per warehouse/tenant vs stored on the PO at issue-time.
- **PI modeling:** reuse existing PO document model with a PI type + reference number vs introduce a dedicated `purchase_order_proforma_invoices` table.
- **When to enforce requirements:** block “Issue PO” if required ship-to/banking fields are missing (no silent fallbacks).

## Plan

- [ ] 1. Audit current PO header/PDF data sources
  - Identify where supplier banking fields live (Supplier schema, PO schema, PDF generator).
  - Identify current ship-to derivation logic and formatting utilities.
  - Identify if PIs already exist implicitly (documents) or need a new model.

- [ ] 2. Define canonical formatting + required fields
  - Ship-to: include company name, phone, condensed address lines, country code.
  - Banking: include all required banking fields (account name/number, routing/SWIFT/IBAN, bank name/address as applicable).
  - PI: show a list of PI numbers (comma-separated or multi-line) with a clear label.

- [ ] 3. Implement data model changes (if needed)
  - If snapshotting: add PO fields for `supplierBankingInfo` and `shipTo*` fields (or JSON blocks).
  - If PI table: add `purchase_order_proforma_invoices` linked to PO (supports multiple).
  - Add migrations for both US/UK schemas as applicable.

- [ ] 4. Wire API + service layer
  - Ensure PO read endpoints return the banking + ship-to + PI info needed by UI/PDF.
  - Ensure PO update/issue flows populate snapshot fields and validate required data (no fallbacks).

- [ ] 5. Update UI
  - PO detail page: show supplier banking + ship-to blocks consistently.
  - Add PI section (list/add/remove) if editing is required.

- [ ] 6. Update PDF export
  - Ensure PDF header includes banking info, ship-to info, and PI number list.
  - Keep formatting consistent with UI (shared formatter utility if appropriate).

- [ ] 7. Validation
  - Verify on `https://dev-os.targonglobal.com/talos`:
    - Banking block present by default for suppliers with banking configured
    - Ship-to includes phone + country code and uses consistent line breaks
    - Multiple PIs display correctly on UI + PDF
  - Run Talos lint/type-check for the touched files.

## Notes / Risks

- Avoid any “fallback” behavior for required address/banking fields; fail fast and block issuing when data is incomplete.
- If we snapshot data at issue-time, confirm how edits should behave after issuing (immutable vs editable with audit log).

