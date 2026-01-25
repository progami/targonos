# Purchase Orders: Rename “Draft” Stage to “RFQ”

**Author:** GPT  
**Created:** January 24, 2026 at 03:07 AM CST  
**Status:** Planned

---

## Context / Problem

Current PO flow uses a “Draft” stage, but the business meaning is “RFQ” (request for quote). Treating RFQ as “Draft” is causing semantic/UX issues and confusing stage expectations.

Request: rename “Draft” → “RFQ” across the Talos app (UI + PDF + any exports/labels).

## Objectives

1) Replace the “Draft” label with “RFQ” consistently anywhere purchase order stage/status is displayed.
2) Ensure PO stage semantics remain correct and do not introduce regressions in stage transitions or validations.
3) Decide whether this is **display-only** (preferred: keep DB enum as-is) or a **true status enum change** (requires migration + backwards compatibility).

## Decisions Needed (before implementation)

- **Approach**
  - Option A (recommended): keep DB status value (e.g. `DRAFT`) but display label “RFQ”.
  - Option B: introduce a real `RFQ` enum/status and migrate existing data (higher risk).
- **Stage meaning**
  - Define what actions are allowed in RFQ stage (editing lines, documents, costs, etc.).
  - Confirm what “Issue PO” means relative to RFQ.

## Plan

- [ ] 1. Inventory all “Draft” references for purchase orders
  - UI labels (tabs, badges, stage timeline, filters, empty states)
  - PDF templates / export strings
  - Service-layer validation/error messages
  - Any analytics/audit strings

- [ ] 2. Confirm PO stage model and transition rules
  - Identify the canonical PO status enum and stage mapping.
  - Verify any logic that treats “Draft” specially (permissions, validations, edit locks).

- [ ] 3. Implement label change consistently
  - Centralize label mapping (single source) and swap “Draft” → “RFQ”.
  - Ensure filters/search continue to work (if they depend on labels vs enum values).

- [ ] 4. Update PDF/export rendering
  - Ensure PDF uses “RFQ” for the initial stage/status where applicable.

- [ ] 5. Validation
  - Verify on `https://dev-targonos.targonglobal.com/talos`:
    - PO list + detail timeline shows “RFQ” instead of “Draft”
    - Stage transition actions still function
    - PDF/export strings match UI
  - Run Talos lint/type-check for touched files.

## Notes / Risks

- Avoid changing persisted enum values unless required; a display-only rename is safer and faster.
- If any external integrations rely on “Draft” as a literal string, they must be updated or decoupled from labels.

