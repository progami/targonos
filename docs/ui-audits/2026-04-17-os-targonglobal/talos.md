# Talos Audit

Created: 2026-04-17 14:11:09 CDT

## Review Surface

- Live US dashboard reviewed in Computer Use at `os.targonglobal.com/talos/dashboard`
- Live FBA fee discrepancy workflow reviewed against the hosted US tenant data
- Live purchase order workflow reviewed against legacy-status rows carried in the hosted dataset

## Findings

- `High` The US dashboard formatted monthly costs in GBP (`£0.00`) even though the selected region was US. Fixed by switching the dashboard summary and breakdown cards to tenant-aware currency formatting.
- `High` FBA fee discrepancy classification could mark a row as effectively fine when Amazon physical dimensions or size-tier metadata disagreed with the internal reference but the fee amount happened to match. Fixed by extracting the discrepancy classification logic and treating physical measurement mismatches as a real mismatch instead of silently passing them through.
- `Medium` Legacy purchase-order statuses in live data were no longer fully normalized by the current workflow mapping, which could leave rows in the wrong read-only/action state. Fixed by restoring the legacy status aliases used by hosted purchase-order data.

## Fix Targets

- Region-aware currency formatting
- FBA discrepancy classification on physical measurement mismatches
- Purchase-order workflow normalization for legacy statuses

## Notes

- The inventory chart rendered correctly on live retest, so the earlier blank-chart note was removed.
- Screenshot evidence retained in `screenshots/talos-dashboard-us.png`.
