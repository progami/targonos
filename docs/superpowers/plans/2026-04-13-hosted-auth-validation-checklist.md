# Hosted Auth Validation Checklist

Date: 2026-04-13 02:24:06 CDT
Branch: `sso/portal-auth-centralization`
Worktree: `/Users/jarraramjad/.config/superpowers/worktrees/targonos-main/sso-portal-auth-centralization`

## Rules

- Validate with `chrome-devtools-mcp` only for hosted browser checks.
- Take a screenshot for every route that is claimed working.
- Inspect the visible screen, console output, and network failures before marking a route passed.
- Fix any browser-found bug on this branch before continuing the rollout.
- Complete full PR flow only after browser validation passes.

## Phase 0: Branch And Local Verification

- [x] Confirm branch is clean and current.
- [x] Re-run local auth contract checks.
- [x] Re-run local portal login Playwright smoke.
- [x] Re-run topology build/runtime assertion path.

## Phase 1: Dev Rollout

- [ ] Open PR from `sso/portal-auth-centralization` to `dev`.
- [ ] Wait for CI to pass.
- [ ] Read and address all review comments.
- [ ] Merge to `dev`.
- [ ] Wait for `dev-os` deployment to reach the expected version.

### `dev-os` Portal And App Sweep

- [ ] Portal `/`
- [ ] Talos route family
- [ ] Atlas route family
- [ ] Website route family
- [ ] xPlan route family
- [ ] Kairos route family
- [ ] Plutus route family
- [ ] Hermes route family
- [ ] Argus route family

## Phase 2: Main Rollout

- [ ] Open PR from `dev` to `main`.
- [ ] Wait for CI to pass.
- [ ] Read and address all review comments.
- [ ] Merge to `main`.
- [ ] Wait for `os` deployment to reach the expected version.

### `os` Portal And App Sweep

- [ ] Portal `/`
- [ ] Talos route family
- [ ] Atlas route family
- [ ] Website route family
- [ ] xPlan route family
- [ ] Kairos route family
- [ ] Plutus route family
- [ ] Hermes route family
- [ ] Argus route family

## Hosted Route Inventory

The browser sweep is derived from page routes in the app trees and then expanded through in-app navigation where dynamic records are required.

### Portal

- `/`
- `/login`
- `/logout`
- `/xplan`

### Talos

- `/talos`
- `/talos/dashboard`
- `/talos/operations/purchase-orders`
- `/talos/operations/purchase-orders/new`
- `/talos/operations/orders`
- `/talos/operations/orders/new`
- `/talos/operations/inventory`
- `/talos/operations/inventory/incomplete`
- `/talos/operations/transactions`
- `/talos/operations/fulfillment-orders`
- `/talos/operations/fulfillment-orders/new`
- `/talos/operations/storage-ledger`
- `/talos/operations/cost-ledger`
- `/talos/operations/financial-ledger`
- `/talos/market`
- `/talos/market/orders`
- `/talos/market/reorder`
- `/talos/market/shipment-planning`
- `/talos/market/amazon`
- `/talos/amazon`
- `/talos/amazon/fba-fee-tables`
- `/talos/amazon/fba-fee-discrepancies`
- `/talos/config`
- `/talos/config/permissions`
- `/talos/config/products`
- `/talos/config/suppliers`
- `/talos/config/warehouses`
- `/talos/config/warehouses/new`
- `/talos/finance`
- `/talos/finance/storage-ledger`
- `/talos/finance/cost-ledger`

### Atlas

- `/atlas`
- `/atlas/hub`
- `/atlas/employees`
- `/atlas/leave`
- `/atlas/leave/request`
- `/atlas/contractors`
- `/atlas/onboarding`
- `/atlas/performance/violations`
- `/atlas/performance/reviews`
- `/atlas/performance/disciplinary`
- `/atlas/hiring`
- `/atlas/hiring/schedule`
- `/atlas/work`
- `/atlas/policies`
- `/atlas/passwords`
- `/atlas/passwords/credit-cards`
- `/atlas/secrets`
- `/atlas/secrets/credit-cards`
- `/atlas/tasks`
- `/atlas/organogram`
- `/atlas/calendar`
- `/atlas/admin/access`

### Website

- `/`
- `/cs`
- `/cs/us`
- `/cs/us/support`
- `/cs/us/where-to-buy`
- `/cs/us/about`
- `/cs/us/packs`
- `/cs/us/gallery`
- `/cs/uk`
- `/cs/uk/support`
- `/cs/uk/where-to-buy`
- `/cs/uk/about`
- `/cs/uk/packs`
- `/legal/privacy`
- `/legal/terms`

### xPlan

- `/xplan`
- `/xplan/1-setup`

### Kairos

- `/kairos`
- `/kairos/forecasts`
- `/kairos/sources`
- `/kairos/models`

### Plutus

- `/plutus`
- `/plutus/setup`
- `/plutus/data-sources`
- `/plutus/chart-of-accounts`
- `/plutus/transactions`
- `/plutus/cashflow`
- `/plutus/settlements`
- `/plutus/bills`
- `/plutus/settlement-mapping`
- `/plutus/settings`

### Hermes

- `/hermes`
- `/hermes/accounts`
- `/hermes/orders`
- `/hermes/messaging`
- `/hermes/reviews`
- `/hermes/insights`
- `/hermes/campaigns`
- `/hermes/campaigns/new`
- `/hermes/experiments`
- `/hermes/logs`
- `/hermes/settings`
- `/hermes/templates`

### Argus

- `/argus`
- `/argus/wpr`
- `/argus/wpr/sources`
- `/argus/wpr/compare`
- `/argus/wpr/changelog`
- `/argus/wpr/competitor`
- `/argus/monitoring`
- `/argus/tracking`
- `/argus/cases`
- `/argus/listings`

## Execution Log

- 2026-04-13 02:24 CDT: Generated hosted route inventory from source page routes across `apps/*/app` and `apps/*/src/app`.
- 2026-04-13 02:31 CDT: `pnpm --filter @targon/auth build` passed.
- 2026-04-13 02:31 CDT: `pnpm --filter @targon/auth test` passed (`16` tests).
- 2026-04-13 02:31 CDT: `node --test ecosystem.topology.test.cjs` passed (`2` tests).
- 2026-04-13 02:31 CDT: `pnpm run test:auth-topology` passed (`5` tests).
- 2026-04-13 02:31 CDT: `pnpm --dir apps/talos exec tsx --test src/app/api/tenant/current/route.test.ts src/app/api/tenant/select/route.test.ts src/lib/tenant/guard.test.ts src/lib/tenant/session.test.ts tests/unit/navigation.test.ts` passed (`15` tests).
- 2026-04-13 02:31 CDT: `pnpm --dir apps/sso exec tsx --test tests/active-tenant.route.test.ts` passed (`3` tests).
- 2026-04-13 02:31 CDT: `pnpm --dir apps/sso exec playwright test tests/e2e.spec.ts tests/login.spec.ts --reporter=list` passed (`3` tests).
