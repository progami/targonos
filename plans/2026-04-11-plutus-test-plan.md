# 2026-04-11 Plutus Test Plan

## Purpose
Define the CI smoke suite for Plutus so QBO connection state, settlements, transactions, cashflow, and finance setup routes fail in CI when they stop loading.
Plutus is the finance app around QuickBooks Online: setup, settlements, transaction mapping, cashflow, bills, and accounting configuration are its critical workflows.

## Standard Gate
- Use the repo-standard Playwright smoke harness.
- Fail on page errors, console errors, and required API failures.
- Run the suite against a deterministic QBO-connected fixture company for full P0 coverage.

## P0 Flows

### 1. Connection Gate
Routes: `/settlements`, `/setup`

Checks:
- Connected fixture user sees the app UI, not the not-connected screen.
- Disconnected fixture explicitly renders the not-connected state where expected.

### 2. Setup Wizard
Routes: `/setup`

Checks:
- Wizard loads.
- Brands, accounts, and settlement sections render.
- Persisted setup state does not break reload.

### 3. Settlements List
Routes: `/settlements`, `/settlements/[region]`

Checks:
- Root loads settlement table.
- Region redirect normalizes `US` and `UK` to marketplace query params.
- Filters/search/pagination render.
- Sync/process action controls render without crashing.

### 4. Settlement Detail
Routes: `/settlements/[region]/[settlementId]`

Checks:
- Detail page loads for a seeded settlement.
- Sales/fees and history tabs render.
- Preview/process controls render for the fixture record.

### 5. Legacy Journal Entry Redirect
Routes: `/settlements/journal-entry/[id]`

Checks:
- Legacy route resolves the parent settlement and redirects once.
- Broken id surfaces an error state instead of a crash.

### 6. Transactions and Bills
Routes: `/transactions`, `/bills`

Checks:
- Transactions page loads.
- Bill tab redirect from `/bills` lands on `/transactions?tab=bill`.
- Existing transaction rows render with expandable details.

### 7. Cashflow
Routes: `/cashflow`

Checks:
- Cashflow chart and event table load.
- Config and manual adjustment dialogs open.
- Refresh/export controls render.

## P1 Flows

### 8. Chart of Accounts
Routes: `/chart-of-accounts`

Checks:
- Accounts list loads.
- Search and filter UI render without crashing.

### 9. Data Sources
Routes: `/data-sources`

Checks:
- AWD upload surface loads.
- Upload history table renders.
- Invalid upload input shows a controlled error.

### 10. Settings
Routes: `/settings`

Checks:
- Notification and autopost settings load.
- QBO disconnect control renders.

### 11. Settlement Mapping
Routes: `/settlement-mapping`

Checks:
- Mapping page loads and seeded mappings render.

## Fixtures and Data
- One connected QBO fixture company.
- Seeded US and UK settlements with one detail id each.
- One legacy journal entry id that resolves to a parent settlement.
- Seeded transaction rows, bill rows, cashflow snapshot, AWD upload history, and setup mappings.

## Known Issues From 2026-04-11
- Basic live smoke on `/plutus/settlements` and `/plutus/transactions` passed.
- There is no current browser CI coverage for settlements processing, legacy redirects, cashflow, or setup.
