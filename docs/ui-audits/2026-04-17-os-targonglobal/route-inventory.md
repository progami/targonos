# TargonOS Route Inventory

Created: 2026-04-17 14:11:09 CDT

## Scope

- Portal: `/`
- Argus: `/argus`
- Atlas: `/atlas`
- Hermes: `/hermes`
- Kairos: `/kairos`
- Plutus: `/plutus`
- Talos: `/talos`
- xPlan: `/xplan`

## Portal

- `/`

## Argus

- `/argus/wpr`
- `/argus/wpr/sources`
- `/argus/wpr/compare`
- `/argus/wpr/changelog`
- `/argus/wpr/competitor`
- `/argus/monitoring`
- `/argus/listings`
- `/argus/cases/us`

Dynamic follow-up routes:

- `/argus/monitoring/[id]`
- `/argus/listings/[id]`
- `/argus/cases/[market]/[reportDate]`
- `/argus/tracking`
- `/argus/tracking/[id]`

## Atlas

- `/atlas/hub`
- `/atlas/organogram`
- `/atlas/calendar`
- `/atlas/policies`
- `/atlas/secrets`
- `/atlas/contractors`
- `/atlas/employees`
- `/atlas/hiring`
- `/atlas/hiring/schedule`
- `/atlas/leave`
- `/atlas/leave/request`
- `/atlas/performance/reviews`
- `/atlas/performance/reviews/add`
- `/atlas/performance/violations`
- `/atlas/performance/violations/add`

Permission-gated or detail routes:

- `/atlas/admin/access`
- `/atlas/employees/[id]`
- `/atlas/employees/[id]/edit`
- `/atlas/leave/[id]`
- `/atlas/leaves/[id]`
- `/atlas/tasks`
- `/atlas/tasks/add`
- `/atlas/tasks/[id]`
- `/atlas/policies/[id]`
- `/atlas/policies/[id]/edit`
- `/atlas/performance/reviews/[id]`
- `/atlas/performance/reviews/[id]/edit`
- `/atlas/performance/violations/[id]`
- `/atlas/performance/violations/[id]/edit`
- `/atlas/performance/disciplinary`
- `/atlas/performance/disciplinary/add`
- `/atlas/performance/disciplinary/[id]`
- `/atlas/performance/disciplinary/[id]/edit`
- `/atlas/onboarding`
- `/atlas/work`
- `/atlas/passwords`
- `/atlas/passwords/credit-cards`
- `/atlas/secrets/credit-cards`

## Hermes

- `/hermes/insights`
- `/hermes/orders`
- `/hermes/reviews`
- `/hermes/messaging`
- `/hermes/accounts`
- `/hermes/logs`
- `/hermes/settings`

Secondary routes:

- `/hermes/campaigns`
- `/hermes/campaigns/new`
- `/hermes/campaigns/[id]`
- `/hermes/experiments`
- `/hermes/templates`

## Kairos

- `/kairos/sources`
- `/kairos/models`
- `/kairos/forecasts`

Dynamic follow-up routes:

- `/kairos/sources/[seriesId]`
- `/kairos/forecasts/[forecastId]`

## Plutus

- `/plutus/settlements`
- `/plutus/transactions`
- `/plutus/cashflow`
- `/plutus/setup`
- `/plutus/settlement-mapping`
- `/plutus/chart-of-accounts`
- `/plutus/data-sources`
- `/plutus/settings`

Secondary routes:

- `/plutus/bills`
- `/plutus/settlements/[region]`
- `/plutus/settlements/[region]/[settlementId]`
- `/plutus/settlements/journal-entry/[id]`

## Talos

- `/talos/dashboard`
- `/talos/amazon/fba-fee-discrepancies`
- `/talos/amazon/fba-fee-tables`
- `/talos/operations/purchase-orders`
- `/talos/operations/purchase-orders/new`
- `/talos/operations/fulfillment-orders`
- `/talos/operations/fulfillment-orders/new`
- `/talos/operations/inventory`
- `/talos/operations/inventory/incomplete`
- `/talos/operations/storage-ledger`
- `/talos/operations/financial-ledger`
- `/talos/config/products`
- `/talos/config/suppliers`
- `/talos/config/warehouses`
- `/talos/config/warehouses/new`

Secondary or redirect routes:

- `/talos/operations/purchase-orders/[id]`
- `/talos/operations/fulfillment-orders/[id]`
- `/talos/operations/orders`
- `/talos/operations/orders/new`
- `/talos/operations/orders/[id]`
- `/talos/operations/transactions`
- `/talos/operations/transactions/[id]`
- `/talos/operations/cost-ledger`
- `/talos/config/warehouses/[id]/edit`
- `/talos/config/warehouses/[id]/rates`
- `/talos/config/permissions`
- `/talos/finance`
- `/talos/finance/cost-ledger`
- `/talos/finance/storage-ledger`
- `/talos/market`
- `/talos/market/orders`
- `/talos/market/reorder`
- `/talos/market/amazon`

## xPlan

- `/xplan/1-setup`
- `/xplan/3-ops-planning`
- `/xplan/4-sales-planning`
- `/xplan/5-fin-planning-pl`
- `/xplan/6-po-profitability`
- `/xplan/7-fin-planning-cash-flow`
