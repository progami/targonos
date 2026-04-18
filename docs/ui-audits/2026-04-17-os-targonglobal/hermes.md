# Hermes Audit

Created: 2026-04-17 14:11:09 CDT

## Review Surface

- Live insights page reviewed in Computer Use at `os.targonglobal.com/hermes/insights`
- Live orders page reviewed in Computer Use at `os.targonglobal.com/hermes/orders`
- Live reviews page reviewed in Computer Use at `os.targonglobal.com/hermes/reviews`
- Live messaging page reviewed in Computer Use at `os.targonglobal.com/hermes/messaging`
- Live accounts page reviewed in Computer Use at `os.targonglobal.com/hermes/accounts`
- Live logs page reviewed in Computer Use at `os.targonglobal.com/hermes/logs`

## Findings

- `High` Hosted request-review attempts are failing with `WORKER_EXCEPTION` because the deployed Hermes runtime is missing `SPAPI_LWA_CLIENT_ID`. This is a deployment/config blocker, not a repo logic defect: the current code already hard-fails when the required SP-API env is absent, and the hosted logs page is surfacing that exact failure.
- `Low` The insights, orders, reviews, and messaging routes all rendered correctly on live retest. The main hosted problem is the missing SP-API runtime configuration behind dispatch/test flows.

## Fix Targets

- Hosted Hermes SP-API env parity (`SPAPI_LWA_CLIENT_ID` and companion SP-API secrets)

## Notes

- Screenshot evidence retained in `screenshots/hermes-insights.png`, `screenshots/hermes-orders-failed-review-v1.362.3.png`, and `screenshots/hermes-log-missing-lwa-client-id-v1.362.3.png`.
- No repo patch was applied for Hermes in this pass because the failing hosted path is already behaving correctly for a missing required env var; the remaining action is deployment configuration.
