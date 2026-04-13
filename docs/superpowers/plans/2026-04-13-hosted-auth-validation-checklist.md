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
- 2026-04-13 08:00 CDT: Confirmed hosted `dev-os` failures with Chrome/PM2 evidence before patching: Plutus redirected authenticated users to `http://localhost:3200/login`, Talos `/api/warehouses` failed on missing `warehouses.billing_config`, Hermes served standalone output through `next start` and logged `permission denied for schema dev_hermes`, and Argus ran stale build metadata and a broken Prisma engine/runtime.
- 2026-04-13 08:09 CDT: Patched `ecosystem.config.js` so hosted child apps cannot override portal-managed auth secret, cookie domain, app/portal origins, or build metadata from app-local env; Hermes and Argus now run their standalone server entrypoints under PM2.
- 2026-04-13 08:11 CDT: Patched `scripts/deploy-app.sh` so hosted builds export canonical app/portal origins, shared portal auth secret, and environment cookie domain before `next build`, and hosted deploys no longer skip database migrations when the current diff does not include migration files.
- 2026-04-13 08:14 CDT: `node --test ecosystem.topology.test.cjs` passed (`4` tests) and now covers hosted env override stripping plus standalone runtime assertions.
- 2026-04-13 08:14 CDT: `pnpm run test:auth-topology` passed (`5` tests).
- 2026-04-13 08:14 CDT: `bash -n scripts/deploy-app.sh && node -c ecosystem.config.js` passed.
- 2026-04-13 08:29 CDT: Patched `ecosystem.config.js` so hosted child apps inherit `PORTAL_DB_URL` from the portal contract and fail fast if it is missing. Rebuilt/restarted `dev-plutus`, verified `https://dev-os.targonglobal.com/plutus/settings` with Chrome (`/plutus/api/plutus/users [200]`), and saved the visible settings screenshot to `.codex-artifacts/hosted-validation-rerun/dev-os/plutus-settings-fixed.png`.
- 2026-04-13 08:46 CDT: Patched hosted Hermes runtime to use `next start` under PM2 with `HERMES_AUTO_MIGRATE=0`, rebuilt/restarted `dev-hermes`, and confirmed the live Insights screen with Chrome after both `/hermes/api/analytics/overview?...conn_01 [200]` and `...conn_01_uk [200]` returned successfully. Visible rerun evidence is saved at `.codex-artifacts/hosted-validation-rerun/dev-os/hermes-insights-fixed.png`.
- 2026-04-13 09:08 CDT: Added `apps/talos/scripts/migrations/add-warehouse-billing-config.ts`, wired it into `apps/talos/package.json` and `scripts/deploy-app.sh`, ran the owner-backed migration against `portal_db_dev`, and verified the new `warehouses.billing_config` column exists in both `dev_talos_us` and `dev_talos_uk`. Chrome now renders `https://dev-os.targonglobal.com/talos/config/warehouses` with `/talos/api/warehouses [200]`; visible evidence is saved at `.codex-artifacts/hosted-validation-rerun/dev-os/talos-warehouses-fixed.png`.
- 2026-04-13 09:16 CDT: Re-checked Argus after the hosted runtime fix. `https://dev-os.targonglobal.com/argus/monitoring` now renders the monitoring board with `/argus/api/monitoring/overview [200]` and `/argus/api/monitoring/changes?... [200]`, no Chrome console messages, and a visible screenshot at `.codex-artifacts/hosted-validation-rerun/dev-os/argus-monitoring-fixed.png`. `/argus/tracking` is an intentional redirect to `/monitoring` from `apps/argus/app/(app)/tracking/page.tsx`.
- 2026-04-13 04:28 CDT: Ran a fresh full `chrome-devtools-mcp` rerun of the complete `dev-os` hosted route inventory from `.codex-artifacts/hosted-sweep/reports/dev-os.json`. The rerun covered `110` routes across Portal, Talos, Atlas, Website, xPlan, Kairos, Plutus, Hermes, and Argus, wrote a current route report to `.codex-artifacts/hosted-sweep/reports/dev-os-rerun.json`, and produced a fresh screenshot for every route under `.codex-artifacts/hosted-sweep/rerun-dev-os/`.
- 2026-04-13 04:28 CDT: The fresh `dev-os` rerun produced `0` suspicious routes, `0` console errors, and `0` network failures under the sweep heuristics. Per-app contact sheets were generated in `.codex-artifacts/hosted-sweep/contact-rerun-dev-os/` and visually reviewed in Codex Chrome image view for Portal, Talos, Atlas, Website, xPlan, Kairos, Plutus, Hermes, and Argus. No blank screens, login misroutes, Chrome error pages, or unhandled application error states were visible in the rerun set.
- 2026-04-13 12:42 CDT: While validating the merged `dev` deploy against the real deployed checkout in `/Users/jarraramjad/dev/targonos-dev`, PM2 logs exposed a portal runtime defect that the route sweep did not surface: `dev-targonos` repeatedly threw Prisma errors because `auth_dev.UserApp.tenantMemberships` did not exist in `portal_db_dev`.
- 2026-04-13 12:56 CDT: Confirmed the root cause directly in Postgres. `auth_dev` had no `_prisma_migrations` table, `UserApp` and `GroupAppMapping` were missing `tenantMemberships`, and the SSO deploy path in `scripts/deploy-app.sh` was not running `@targon/auth` migrations at all.
- 2026-04-13 13:07 CDT: Applied the one-time `auth_dev` baseline with the owner connection `postgresql://portal_auth:portal-auth-main-local@localhost:5432/portal_db_dev?schema=auth_dev`: marked `20260226180000_remove_app_access_role` as applied, ran `pnpm --filter @targon/auth prisma:migrate:deploy`, and verified that `auth_dev.UserApp.tenantMemberships` and `auth_dev._prisma_migrations` now exist.
- 2026-04-13 13:12 CDT: Re-hit `https://dev-os.targonglobal.com/` after the baseline and tailed only new `dev-targonos` error-log lines. No new `tenantMemberships` Prisma errors were emitted for the portal request.
- 2026-04-13 13:21 CDT: Patched the deploy contract so hosted SSO deploys run `pnpm --filter @targon/auth prisma:migrate:deploy`, use `PORTAL_DB_URL` instead of app `DATABASE_URL` for migration readiness, and rewrite the auth migration connection onto the owner schema URL before Step 3b. Added `scripts/deploy-app.test.cjs` to lock that behavior and added `prisma:migrate:deploy` to `packages/auth/package.json`.
- 2026-04-13 13:23 CDT: `node --test ecosystem.topology.test.cjs scripts/deploy-app.test.cjs` passed (`8` tests) and `bash -n scripts/deploy-app.sh` passed.
- 2026-04-13 05:16 CDT: The first `dev` CD run for PR `#4962` failed in the live deploy job. The log showed two deploy-path defects: SSO owner migration resolution was still trying to read `apps/sso/.env.production` on the dev runner, and Atlas timed out on Prisma’s advisory lock while shared-db app deploys were running in parallel, then hit its `db push` fallback on the external role.
- 2026-04-13 05:30 CDT: Patched the deploy path again so shared-db migrations use deterministic local owner-role URLs on `localhost:5432` (`portal_auth`, `portal_atlas`, `portal_xplan`, `portal_talos`, `portal_plutus`) instead of hidden env files, removed the Atlas `db push` fallback, and forced CD app deploy fanout to run sequentially because Prisma advisory locks are database-wide across the shared portal DB.
- 2026-04-13 05:33 CDT: Re-verified the recovery patch with `node --test ecosystem.topology.test.cjs scripts/deploy-app.test.cjs`, `bash -n scripts/deploy-app.sh`, `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/cd.yml")'`, plus direct owner-role migration commands for `@targon/auth`, Atlas, and xPlan against `portal_db_dev`.
- 2026-04-13 05:39 CDT: The second `dev` merge (`#4963`) still did not redeploy the suite because `scripts/detect-cd-affected-apps.js` only considered `apps/*` and `packages/*`. Changes to `.github/workflows/cd.yml`, `ecosystem.config.js`, and `scripts/deploy-app.sh` incorrectly produced `any_app=false`, so the fixed deploy path never ran.
- 2026-04-13 05:43 CDT: Patched `scripts/detect-cd-affected-apps.js` so deploy-infrastructure changes fan out to every hosted app, added `scripts/detect-cd-affected-apps.test.cjs`, and re-verified with `node --test scripts/detect-cd-affected-apps.test.cjs ecosystem.topology.test.cjs scripts/deploy-app.test.cjs`, `bash -n scripts/deploy-app.sh`, `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/cd.yml")'`, and a direct detector run for `scripts/deploy-app.sh`.
