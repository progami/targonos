# Hermes

Hermes is a TargonOS app that automates **Amazon post‑purchase outreach** using the **Selling Partner API (SP‑API)**. It behaves like an email automation system, but the “recipients” are **Amazon orders**, and Amazon strictly controls what can be sent and when.

Hermes has two operational modules:

1) **Request‑a‑Review** (Solicitations API)
- Queues and sends Amazon’s “Request a Review” solicitation when an order is eligible.
- Guarantees **at most one** send per order.

2) **Buyer‑Seller Messaging** (Messaging API)
- Lets you send allowed, order‑related messages (only when Amazon exposes an allowed action for that order).
- Guarantees **at most one** send per message kind per order.

---

## The core idea: Orders → Dispatches → Attempts

Hermes is built around a small set of concepts:

- **Connection**: an Amazon seller account configuration (region + marketplace IDs + credentials). In this standalone version, connections are provided via environment variables.
- **Order cache**: Hermes keeps a local copy of orders it has seen, so the UI and schedulers can work without repeatedly hitting the Orders API.
- **Dispatch queue**: every outbound action (review request or buyer message) becomes a **dispatch** with a `scheduled_at` time and an optional `expires_at` deadline.
- **Attempt log**: every send attempt (sent / ineligible / throttled / failed) is recorded as an immutable audit entry.

This means Hermes can be run with “at‑least once” worker semantics (retries, restarts, multiple processes) while still avoiding duplicate sends.

---

## Reading Hermes metrics (avoid confusion)

Hermes tracks two different things:

- **Dispatches**: one row per order action (unique by DB constraints). This is the closest thing to “how many orders were requested”.
- **Attempts**: retries against a dispatch (immutable log). A single order can produce many attempts (e.g. “ineligible” retries) before it becomes sendable.

If you see large “ineligible” numbers, that is usually **attempts** (retries), not unique orders.

---

## How Request‑a‑Review works (end‑to‑end)

1) **Orders are ingested** into the local order cache (either via the Orders UI backfill or the orders‑sync worker).
2) Hermes **computes a schedule** per order (delay + optional time window + optional jitter) and enqueues a `request_review` dispatch.
3) The **request‑review worker** continuously:
   - finds due dispatches (`queued` + `scheduled_at <= now`)
   - **claims** them (`queued → sending`) so only one worker can process the row
   - calls Amazon to **preflight eligibility** (actions for the order)
   - sends the solicitation only if eligible
   - writes an attempt row and marks the dispatch `sent`, or reschedules / skips / fails based on the outcome

---

## How Buyer‑Seller Messaging works (end‑to‑end)

1) You pick an order in the Messaging UI.
2) Hermes calls Amazon to fetch the order’s **allowed messaging actions**.
3) You choose a supported message type and provide content.
4) Hermes runs **content safety checks** (blocks links, contact info, and obvious review/feedback solicitation phrases).
5) Hermes enqueues a `buyer_message` dispatch and (optionally) sends immediately, using the same claim + attempt logging flow as the worker.
6) The **buyer‑message worker** can also process queued message dispatches on a loop.

---

## Safety guarantees (what Hermes enforces)

- **No duplicate sends (hard DB safety)**:
  - Request‑a‑Review: one per `(connection_id, order_id)`
  - Buyer message: one per `(connection_id, order_id, message_kind)`
- **Concurrency‑safe sending**: dispatches are processed via a claim step (`queued → sending`) so only one worker instance sends.
- **Immutable audit trail**: every outcome is recorded in the attempt log.
- **Eligibility validation at send time**: Hermes checks Amazon “allowed actions” right before sending.
- **Expiry windows**: dispatches can expire; expired dispatches are skipped instead of being sent late.
- **Rate‑limit aware behavior**: throttled calls are recorded and the dispatch is rescheduled with backoff.

---

## Verification (Hermes ↔ Amazon)

To verify a specific order:

- **In Hermes**
  - `Orders`: filter by order id → check Review state (`sent` / `queued` / `not queued`)
  - `Logs`: filter by order id → look for `request_review` attempts with `status=sent` (the row includes `spapiRequestId`)
- **In Seller Central**
  - Open the order details page → the “Request a Review” action should be unavailable/disabled after it has been sent.
  - If Amazon’s “Request a Review” action is not available, Hermes will record attempts as `ineligible` and reschedule (no duplicate sends).

---

## What you can do in the UI today

- **Insights (landing page)**: daily sent vs queued, plus per-account summaries.
- **Orders**: browse/filter the local order cache and review-request state; run backfill/sync when needed.
- **Messaging**: fetch allowed actions for an order and send a safe buyer message; view recent message dispatches.
- **Accounts**: view configured connections and run a lightweight SP‑API connectivity test.
- **Logs**: attempt log for review requests and buyer messages (sent / ineligible / throttled / failed).
- **Settings**: UI defaults (account + Insights range + Orders rows/page).

Notes:
- Pages like Campaigns / Experiments / Templates are scaffolding; dispatch generation is currently driven by order ingest + scheduling.

---

## Running Hermes (local dev)

- Web: `pnpm dev` (default port `3014`)
- Orders backfill (CLI): `pnpm orders:backfill -- --days 45` (use `--schema main_hermes` for main/prod)
- Workers:
  - `pnpm worker:orders-sync`
  - `pnpm worker:request-review`
  - `pnpm worker:buyer-message`

---

## Configuration (what Hermes needs)

- **Base path**: Hermes is meant to run behind a base path (default `/hermes`).
  - Set `BASE_PATH` for Next.js routing and `NEXT_PUBLIC_BASE_PATH` for client API calls (they should match).
- **Database**: `DATABASE_URL` is required (Hermes uses Postgres to enforce idempotency and store audit logs).
  - Optional: set `HERMES_DB_SCHEMA` to force a schema/search_path (e.g. `main_hermes`) without changing `DATABASE_URL`.
  - Dev convenience: set `HERMES_AUTO_MIGRATE=1` to auto‑create tables from `db/schema.sql` on boot.
- **Connections**: provide one or more connection targets (connectionId + marketplaces + region) plus SP‑API credentials.
  - See `.env.example` for all knobs and examples.

---

## Policy note

Hermes is designed to follow Amazon’s constraints by:
- sending solicitations only when Amazon exposes the eligible action for that order
- sending buyer messages only when Amazon exposes the allowed action for that order
- blocking obvious high‑risk message content in the Messaging UI/API

You are still responsible for compliance with Amazon Communication Guidelines and marketplace rules.
