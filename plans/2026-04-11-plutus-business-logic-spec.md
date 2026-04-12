# 2026-04-11 Plutus Business Logic Spec
## Goal
Document code-backed business-logic defects in Plutus’s core finance workflows: setup dependencies, settlement/transaction processing prerequisites, bill mapping, and cashflow generation. Per `plans/2026-04-11-cross-app-ci-smoke-spec.md`, `/plutus/settlements` and `/plutus/transactions` currently boot, so this spec focuses on workflow correctness rather than first-render failures.

## Files Reviewed
- Specs and manifest: `app-manifest.json`, `plans/2026-04-11-cross-app-ci-smoke-spec.md`, `plans/2026-04-11-plutus-test-plan.md`
- App routes: `apps/plutus/app/page.tsx`, `apps/plutus/app/settlements/page.tsx`, `apps/plutus/app/transactions/page.tsx`, `apps/plutus/app/cashflow/page.tsx`, `apps/plutus/app/setup/page.tsx`
- Directly referenced API routes: `apps/plutus/app/api/setup/route.ts`, `apps/plutus/app/api/setup/accounts/route.ts`, `apps/plutus/app/api/setup/brands/route.ts`, `apps/plutus/app/api/plutus/settlements/route.ts`, `apps/plutus/app/api/plutus/settlements/spapi/us/sync/route.ts`, `apps/plutus/app/api/plutus/settlements/spapi/uk/sync/route.ts`, `apps/plutus/app/api/plutus/autopost/check/route.ts`, `apps/plutus/app/api/plutus/transactions/route.ts`, `apps/plutus/app/api/plutus/bills/create/route.ts`, `apps/plutus/app/api/plutus/purchases/create/route.ts`, `apps/plutus/app/api/plutus/purchases/map/route.ts`, `apps/plutus/app/api/plutus/cashflow/config/route.ts`, `apps/plutus/app/api/plutus/cashflow/snapshot/route.ts`
- Directly referenced components/libs: `apps/plutus/components/page-header.tsx`, `apps/plutus/components/not-connected-screen.tsx`, `apps/plutus/components/ui/empty-state.tsx`, `apps/plutus/components/ui/marketplace-flag.tsx`, `apps/plutus/components/ui/split-button.tsx`, `apps/plutus/lib/store/marketplace.ts`, `apps/plutus/lib/store/settlements.ts`, `apps/plutus/lib/store/transactions.ts`, `apps/plutus/lib/plutus/default-accounts.ts`, `apps/plutus/lib/plutus/settlement-marketplace-query.ts`, `apps/plutus/lib/plutus/settlement-display.ts`, `apps/plutus/lib/plutus/settlement-doc-number.ts`, `apps/plutus/lib/plutus/settlement-parents.ts`, `apps/plutus/lib/plutus/settlement-processing.ts`, `apps/plutus/lib/plutus/autopost-check.ts`, `apps/plutus/lib/plutus/bills/classification.ts`, `apps/plutus/lib/plutus/bills/pull-sync.ts`, `apps/plutus/lib/plutus/purchases/description.ts`, `apps/plutus/lib/plutus/cashflow/snapshot.ts`, `apps/plutus/lib/plutus/cashflow/types.ts`, `apps/plutus/lib/qbo/api.ts`, `apps/plutus/lib/qbo/plutus-qbo-plan.ts`, `apps/plutus/prisma/schema.prisma`

## Repro Routes
- `/plutus` -> `/plutus/settlements` via `apps/plutus/app/page.tsx`
- `/plutus/setup` with `GET /api/setup`, `POST /api/setup/accounts`, and `POST /api/setup/brands`
- `/plutus/transactions` and bill flows backed by `GET /api/plutus/transactions` and `GET/POST /api/plutus/bills/create`
- `/plutus/cashflow` with `GET/POST /api/plutus/cashflow/config` and `GET /api/plutus/cashflow/snapshot?refresh=1`
- `/plutus/settlements` and SP-API sync/process flows through `POST /api/plutus/settlements/spapi/us/sync` and `POST /api/plutus/settlements/spapi/uk/sync`

## Confirmed Issues
- `productExpenses` is part of the setup workflow but is silently omitted from the persisted setup payload returned by `apps/plutus/app/api/setup/route.ts`. The field is supported by `apps/plutus/app/api/setup/accounts/route.ts`, and `apps/plutus/app/setup/page.tsx` includes it in `PRODUCT_EXPENSES_ACCOUNTS` and `ALL_ACCOUNTS`. After reload, the wizard forgets that mapping, undercounts completion, and can block `Ensure Sub-Accounts in QBO` even when the database already has the mapping.
- Brand changes do not invalidate persisted account-creation state. `apps/plutus/app/setup/page.tsx` sets `accountsCreated: false` only in local state before calling `apps/plutus/app/api/setup/brands/route.ts`, but that route never updates `SetupConfig.accountsCreated`. On the next fetch, `apps/plutus/app/api/setup/route.ts` can still return `accountsCreated: true` for a changed brand set. Downstream, `apps/plutus/app/api/plutus/bills/create/route.ts` resolves brand-specific sub-accounts and will fail with missing brand sub-account errors for newly added or renamed brands.
- Brand maintenance becomes DB-blocked once bill mappings exist. `apps/plutus/app/api/setup/brands/route.ts` replaces brands via `tx.brand.deleteMany()` and recreate. But `apps/plutus/prisma/schema.prisma` defines `BillMapping.brandId -> Brand.id` without cascade. Once mapped bills exist, deleting all brands will violate that relation and prevent future brand edits.
- Cashflow snapshot generation drops refreshed QBO connections. In `apps/plutus/lib/plutus/cashflow/snapshot.ts`, `generateCashflowSnapshot()` calls `fetchAccounts(connection)` but then still uses the original `connection` for `fetchOpenBills`, `fetchOpenInvoices`, `fetchRecurringTransactions`, and settlement-history fetches. Any `updatedConnection` returned by those calls is also discarded and never persisted. Other Plutus routes such as `apps/plutus/app/api/plutus/bills/create/route.ts` and `apps/plutus/app/api/plutus/purchases/create/route.ts` correctly carry and save refreshed connections. Cashflow refresh can therefore succeed on the first QBO call and then continue with stale credentials on later calls, yielding partial or failed snapshots.
- Cashflow config accepts arbitrary `cashAccountIds` and the snapshot pipeline only warns after the fact. `apps/plutus/app/api/plutus/cashflow/config/route.ts` validates payload shape only, and `updateCashflowConfig()` in `apps/plutus/lib/plutus/cashflow/snapshot.ts` persists those IDs without checking them against QBO accounts or `buildCashAccountCandidates()`. `generateCashflowSnapshot()` then proceeds with warnings like `CASH_ACCOUNT_NOT_FOUND` and `NO_CASH_ACCOUNTS_SELECTED`, which can reduce starting cash to zero and make the forecast materially wrong instead of rejecting invalid config up front.

## Likely Root Causes
- Setup state is defined in multiple places and the API/page contract drifted. `apps/plutus/app/setup/page.tsx` treats `productExpenses` as required setup state, but `apps/plutus/app/api/setup/route.ts` no longer returns it.
- Setup mutations are not invalidating dependent workflow state. Brand changes alter the required QBO sub-account set, but `apps/plutus/app/api/setup/brands/route.ts` does not reset or recompute `accountsCreated`.
- Brand storage is modeled as replace-all, while bill mappings reference brands as durable foreign keys. That makes historical transaction mappings incompatible with destructive brand resets.
- Cashflow refresh logic is not following the same token-refresh discipline used elsewhere in Plutus. Multi-call QBO workflows in `apps/plutus/lib/plutus/cashflow/snapshot.ts` keep using stale connections instead of threading the newest one forward.
- Cashflow configuration favors permissive writes over business-valid writes. Invalid account IDs are stored and only downgraded to warnings during forecast generation.

## Recommended Fixes
- Add `productExpenses` to the `accountMappings` payload in `apps/plutus/app/api/setup/route.ts` so the setup wizard and persisted config stay in sync.
- When brands change in `apps/plutus/app/api/setup/brands/route.ts`, persistently reset `SetupConfig.accountsCreated` or recompute it against the new brand set before returning setup state.
- Replace the current delete-all brand mutation with a relation-safe update strategy. At minimum, do not delete referenced brands while `BillMapping` rows still point at them.
- Refactor `apps/plutus/lib/plutus/cashflow/snapshot.ts` to carry the latest `updatedConnection` through every QBO call and persist it when refreshed, matching the pattern already used in the bill and purchase routes.
- Reject invalid `cashAccountIds` in `apps/plutus/app/api/plutus/cashflow/config/route.ts` by validating them against live candidate accounts before saving config.

## Verification Plan
- Seed a setup config with `productExpenses` populated, load `/plutus/setup`, refresh, and verify the mapping still counts toward completion and does not block account creation.
- Mark setup complete, change the brand list in `/plutus/setup`, reload, and confirm the route no longer reports `accountsCreated: true` until the new brand sub-accounts have actually been created.
- Create at least one `BillMapping`, then change brands through `/api/setup/brands` and verify the operation follows the intended migration/update path instead of failing on FK constraints.
- Force an expiring QBO token, then refresh `/plutus/cashflow` and confirm snapshot generation can complete all account, bills, invoices, recurring, and settlement-history calls with the refreshed connection.
- Attempt to save invalid `cashAccountIds` through `/api/plutus/cashflow/config` and verify the request is rejected instead of producing a warning-only, zero-cash forecast.

## Open Questions
- Should `accountsCreated` mean “sub-accounts exist for the current brand set” or merely “sub-accounts were created at some point in the past”?
- When brands are renamed or removed after bill mappings already exist, should Plutus migrate those mappings, freeze referenced brands, or prevent destructive edits entirely?
- Should cashflow config allow non-bank or nonexistent accounts at all, or should config writes fail hard on anything outside the candidate set?
- No direct evidence yet of a settlement-posting math defect in the current seeded paths; a seeded end-to-end settlement-processing fixture is still needed to verify journal-entry parent/child handling beyond the setup dependencies above.
