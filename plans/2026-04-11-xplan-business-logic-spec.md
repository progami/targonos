# 2026-04-11 xPlan Business Logic Spec

## Goal
Document code-evidenced business-logic defects in xPlan’s workbook workflows: strategy/scenario creation and selection, defaults/products mutations, workbook-state calculations, and data-contract behavior on the main planning sheets. The requested `/plans`, `/scenarios`, and `/forecasts` route files are not present in this checkout; the actual workflow surface is the workbook router at [apps/xplan/app/[sheet]/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/[sheet]/page.tsx:2226) with sheet slugs defined in [apps/xplan/lib/sheets.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/lib/sheets.ts:1).

## Files Reviewed
- [app-manifest.json](/Users/jarraramjad/dev/targonos-main/app-manifest.json:1)
- [plans/2026-04-11-cross-app-ci-smoke-spec.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec.md:1)
- [plans/2026-04-11-xplan-test-plan.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-xplan-test-plan.md:1)
- [apps/xplan/app/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/page.tsx:1)
- [apps/xplan/app/[sheet]/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/[sheet]/page.tsx:2226)
- [apps/xplan/lib/sheets.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/lib/sheets.ts:1)
- [apps/xplan/lib/workbook.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/lib/workbook.ts:1)
- [apps/xplan/lib/strategy-access.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/lib/strategy-access.ts:1)
- [apps/xplan/lib/api/strategy-guard.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/lib/api/strategy-guard.ts:1)
- [apps/xplan/components/workbook-layout.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/components/workbook-layout.tsx:1)
- [apps/xplan/components/sheet-tabs.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/components/sheet-tabs.tsx:1)
- [apps/xplan/components/active-strategy-indicator.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/components/active-strategy-indicator.tsx:1)
- [apps/xplan/components/sheets/setup-workspace.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/components/sheets/setup-workspace.tsx:1)
- [apps/xplan/components/sheets/strategy-table.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/components/sheets/strategy-table.tsx:1)
- [apps/xplan/components/sheets/setup-defaults-band.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/components/sheets/setup-defaults-band.tsx:1)
- [apps/xplan/components/sheets/setup-product-table.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/components/sheets/setup-product-table.tsx:1)
- [apps/xplan/app/api/v1/xplan/strategies/route.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/api/v1/xplan/strategies/route.ts:1)
- [apps/xplan/app/api/v1/xplan/assignees/route.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/api/v1/xplan/assignees/route.ts:1)
- [apps/xplan/app/api/v1/xplan/business-parameters/route.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/api/v1/xplan/business-parameters/route.ts:1)
- [apps/xplan/app/api/v1/xplan/products/route.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/api/v1/xplan/products/route.ts:1)
- [apps/xplan/app/api/v1/xplan/lead-time-overrides/route.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/api/v1/xplan/lead-time-overrides/route.ts:1)

## Repro Routes
- `/xplan/` renders the setup workbook directly via [apps/xplan/app/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/page.tsx:1), not a separate plans index.
- `/xplan/1-setup` is the strategy/scenario, defaults, and product-management workflow.
- `/xplan/3-ops-planning`, `/xplan/4-sales-planning`, `/xplan/5-fin-planning-pl`, `/xplan/6-po-profitability`, and `/xplan/7-fin-planning-cash-flow` are the workbook planning/calculation surfaces, routed through [apps/xplan/app/[sheet]/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/[sheet]/page.tsx:2226).
- `/xplan/1-strategies` is a legacy slug that redirects to `/xplan/1-setup`, matching the smoke evidence in [plans/2026-04-11-cross-app-ci-smoke-spec.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec.md:85).
- Main mutations behind setup are `POST/PUT/DELETE /xplan/api/v1/xplan/strategies`, `POST/PUT /xplan/api/v1/xplan/business-parameters`, `POST/PUT/DELETE /xplan/api/v1/xplan/products`, and `PUT/DELETE /xplan/api/v1/xplan/lead-time-overrides`.

## Confirmed Issues
- Strategy-access degradation is process-global and can lock non-super-admin users out of all strategy-backed workflows after one assignment-field failure. [apps/xplan/lib/strategy-access.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/lib/strategy-access.ts:36) keeps a mutable `strategyAssignmentFieldsAvailable` flag; once it is flipped, `buildStrategyAccessWhere()` returns a hard-forbidden predicate for non-super-admins at [apps/xplan/lib/strategy-access.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/lib/strategy-access.ts:97). The sheet router retries with that degraded state, so the app falls back to “no accessible strategy” behavior instead of failing loudly. This aligns with the smoke result where setup booted but showed `No strategies found` after `/api/v1/xplan/assignees` failed in [plans/2026-04-11-cross-app-ci-smoke-spec.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec.md:88).
- Workbook completion/status calculations are global to the schema, not scoped to the selected strategy. [apps/xplan/lib/workbook.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/lib/workbook.ts:46) counts all strategies, products, purchase orders, sales weeks, P&L weeks, cash-flow weeks, and business parameters, then derives sheet status from those totals. That means one strategy can make another strategy’s workbook appear populated or complete.
- Workbook-status failures are silently converted into an all-zero workbook. On any exception, [apps/xplan/lib/workbook.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/lib/workbook.ts:181) returns a fallback workbook with every sheet marked `todo` and `recordCount: 0`. That hides calculation/data access failures as normal empty state instead of surfacing a broken planning workflow.
- Business-parameter updates can report success while dropping requested writes. In [apps/xplan/app/api/v1/xplan/business-parameters/route.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/api/v1/xplan/business-parameters/route.ts:136), the `PUT` path authorizes only records that currently exist, updates only those ids it found, and still returns `{ ok: true }` even when some submitted ids do not exist. That is a data-contract defect for autosave because the caller cannot distinguish full success from partial no-op.
- Product updates conflate invalid numeric input with an intentional clear. [apps/xplan/app/api/v1/xplan/products/route.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/api/v1/xplan/products/route.ts:16) parses blank and non-numeric values to `null`, and the `PUT` path writes that `null` back at [apps/xplan/app/api/v1/xplan/products/route.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/api/v1/xplan/products/route.ts:187). A malformed numeric edit therefore erases stored values instead of being rejected.
- Product updates cannot explicitly clear text fields. In the same `PUT` path, blank trimmed strings are skipped rather than persisted at [apps/xplan/app/api/v1/xplan/products/route.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/api/v1/xplan/products/route.ts:196). Numeric fields can become `null`, but text fields cannot be cleared through the same mutation contract.

## Likely Root Causes
- xPlan is trying to survive missing assignment-schema capability by mutating shared process state instead of failing per request. That turns a schema/config problem into a workflow-wide access blackout.
- Workbook status is implemented as a suite-level aggregate health summary in [apps/xplan/lib/workbook.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/lib/workbook.ts:46), but the UI consumes it as if it were the active strategy’s workbook progress.
- The setup autosave APIs are permissive and best-effort. They prefer returning `ok` after partial work instead of enforcing strict request/response integrity.
- The product mutation contract does not distinguish three different intents: keep current value, clear current value, and reject invalid user input.

## Recommended Fixes
- Remove the process-global assignment-fields fallback and make missing assignment metadata a hard, request-scoped failure. Non-super-admin access should not silently degrade to “no strategies.”
- Re-scope workbook status and sheet completion counts to the active strategy, and only fall back to an explicit error state when those calculations fail.
- Make `business-parameters PUT` fail when any submitted id is missing or unauthorized. Partial acceptance should be explicit, not silent.
- Tighten `products PUT` so invalid numeric input is rejected, while deliberate clears use an explicit nullable contract. Apply the same explicit-clear behavior to text fields.
- Add workflow tests around the code paths already called out in [plans/2026-04-11-xplan-test-plan.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-xplan-test-plan.md:14): strategy creation, strategy switching, setup defaults autosave, product edits, and workbook sheet status per strategy.

## Verification Plan
- Verify a non-super-admin user with valid strategy access can still resolve and switch strategies after one simulated assignment-field/schema failure; the app should fail explicitly rather than collapsing to empty setup.
- Verify workbook status changes when switching between two strategies with different data footprints, instead of staying tied to global counts.
- Verify a workbook-status query failure surfaces as an error state, not an all-zero “todo” workbook.
- Verify `PUT /api/v1/xplan/business-parameters` fails when the payload contains a stale or nonexistent id.
- Verify `PUT /api/v1/xplan/products` rejects malformed numeric input, supports explicit nulling where intended, and supports clearing text fields where intended.
- Re-run the smoke entry route from [plans/2026-04-11-cross-app-ci-smoke-spec.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec.md:85) and confirm setup no longer lands in a misleading `No strategies found` state for recoverable backend/config failures.

## Open Questions
- The requested `/plans`, `/scenarios`, and `/forecasts` pages are not in this app. Was the intent to investigate an older xPlan route model, or should the workbook sheets be treated as the canonical replacement?
- Should workbook status represent global tenant health or the active strategy’s planning completeness? Current code implements the former, while the workbook UX strongly implies the latter.
- For product edits, should blank numeric input mean “clear this field” or “reject invalid input”? The current API treats blank and malformed input identically.
- Should setup autosave APIs permit partial success at all, or should every batch mutation be atomic from the caller’s perspective?
