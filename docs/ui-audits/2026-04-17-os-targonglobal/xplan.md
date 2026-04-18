# xPlan Audit

Created: 2026-04-17 14:11:09 CDT

## Review Surface

- Live setup sheet reviewed in Computer Use at `os.targonglobal.com/xplan/1-setup`
- Live ops-planning sheet reviewed in Computer Use at `os.targonglobal.com/xplan/3-ops-planning`
- Live PO profitability sheet reviewed in Computer Use at `os.targonglobal.com/xplan/6-po-profitability`
- Live cashflow sheet reviewed in Computer Use at `os.targonglobal.com/xplan/7-fin-planning-cash-flow`

## Findings

- `Low` The live setup page rendered correctly on first pass. The main issue was upstream in the portal entrypoint, which pointed at a legacy xPlan slug. Fixed in the SSO hosted app configs.
- `High` The live PO P&L sheet could show a large `Unattributed` revenue / profit note while the table totals still read as zero because the summary math only included visible attributed rows. Fixed by folding the unattributed bucket into the default all-status / all-SKU totals so the table matches the live ledger output.
- `Low` The live cashflow sheet rendered correctly on retest after navigation through the workbook tabs.

## Fix Targets

- Portal -> xPlan launch URL consistency
- PO P&L total-row math when unattributed sales exist

## Notes

- Screenshot evidence retained in `screenshots/xplan-setup.png`, `screenshots/xplan-po-pnl-unattributed.png`, and `screenshots/xplan-cashflow-hosted.png`.
- During verification, `apps/xplan/app/api/v1/xplan/purchase-orders/talos/route.ts` also needed a contract refresh for current Talos data shapes so type-check matched the live purchase-order payloads again.
