# Hermes jobs (design)

Hermes needs a worker to run time-based jobs reliably.

Recommended:
- Redis + BullMQ (or your existing queue)
- A scheduler that can enqueue a job for a future timestamp
- A worker that:
  - revalidates eligibility at run time
  - calls SP-API
  - logs attempt results + reason codes
  - retries with exponential backoff + jitter when throttled

This folder is intentionally light; wire it to your existing infra.

## Runnable skeleton included

Hermes now includes a runnable worker skeleton:

    pnpm worker:request-review

File:
- `src/server/jobs/request-review-dispatcher.ts`

It uses:
- `UNIQUE(connection_id, order_id, type)` to prevent duplicate records
- `claimDispatchForSending()` to prevent duplicate sends under concurrency


## Duplicate-send prevention (required)

Even with a queue, you must assume:
- two workers can pick up the same job (retries, crashes, at-least-once semantics)
- a user can click "Send" twice

Hermes uses two layers of defense:
1) **Hard idempotency**: UNIQUE(connection_id, order_id, type) on `hermes_dispatches`.
2) **Claim step**: `claimDispatchForSending()` performs `queued -> sending` as a conditional UPDATE.
   If it returns false, another worker already claimed it.

You should also preflight Amazon's `getSolicitationActionsForOrder` right before sending.

## Hourly Orders sync worker

Hermes includes a second runnable worker:

    pnpm worker:orders-sync

File:
- `src/server/jobs/orders-sync-hourly.ts`

This worker:
- fetches recently updated orders via Orders API (incremental cursor)
- upserts into `hermes_orders`
- optionally auto-enqueues review requests (still deduped by UNIQUE constraint)
