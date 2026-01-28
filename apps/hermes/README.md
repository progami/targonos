# Hermes

Hermes is the TargonOS email-style automation app for Amazon Seller Central, built on **Selling Partner API (SP-API)**.

It currently ships **two separate modules**:

1) **Request-a-Review** (Solicitations API)
- Fully automated review-request dispatching (eligible-window aware)
- Strict dedupe: never sends more than once per order

2) **Buyer-Seller Messaging** (Messaging API)
- Sends allowed order-related messages using Amazon's Messaging API
- Strict dedupe: never sends the same *message kind* more than once per order

This folder is meant to be copied into:

`~/targonos-main/apps/hermes`

---

## Why Hermes exists

Amazon allows limited post-purchase buyer contact. Hermes focuses on:
- **automation with safety** (idempotency + audit logs)
- **timing optimization levers** (delay windows, time windows, jitter, holdouts)
- **analytics** (send volume, eligibility, throttling, lift scaffolding)

---

## What’s implemented

### UI
- Dashboard shell (shadcn/ui)
- Campaigns / Experiments / Templates / Accounts / Orders / Insights / Logs / Settings
- **Messaging module** UI (`/messaging`) to:
  - pick an order
  - fetch *allowed messaging actions* for that order
  - send a buyer message (with built-in content safety checks)

### Backend
- Postgres schema (`db/schema.sql`) with:
  - `hermes_orders` (local order cache)
  - `hermes_dispatches` (send queue)
  - `hermes_dispatch_attempts` (immutable audit log)
- SP-API client:
  - LWA token handling
  - SigV4 signing
  - token-bucket rate limiter

### Workers
- **Orders sync** (hourly): `pnpm worker:orders-sync`
  - fetches and upserts orders
  - can auto-enqueue request-a-review dispatches
- **Request-a-Review dispatcher**: `pnpm worker:request-review`
  - sends solicitations when due
  - preflights eligibility via `GetSolicitationActionsForOrder`
- **Buyer message dispatcher**: `pnpm worker:buyer-message`
  - sends Messaging API dispatches when due
  - preflights eligibility via `getMessagingActionsForOrder`

---

## Marketplace support (UK / US / any marketplace)

Hermes is marketplace-agnostic.

Each connection config contains:
- `region`: `NA` | `EU` | `FE`
- `marketplaceIds`: one or more marketplace IDs (US, UK, DE, etc.)

Orders sync can request multiple marketplaces at once. Messaging/Solicitations calls require a **single marketplaceId per request**, and Hermes always uses the marketplaceId stored on the order.

---

## Safety guarantees (hard requirements)

### 1) Never send the same Request-a-Review twice
Enforced at the database layer with a **partial unique index**:
- `UNIQUE(connection_id, order_id) WHERE type='request_review'`

### 2) Never send the same Buyer-Seller message type twice
Enforced at the database layer with a **partial unique index**:
- `UNIQUE(connection_id, order_id, message_kind) WHERE type='buyer_message'`

### 3) Concurrency-safe dispatching
Both dispatcher workers use:
- a **claim step** (`queued -> sending`) so only one worker can process a dispatch
- attempt logging in `hermes_dispatch_attempts` for every outcome

### 4) Built-in content safety checks (Messaging UI/API)
Buyer messages are blocked if they include obvious policy-risk content, including:
- review / feedback solicitation phrases
- links
- phone numbers / email addresses
- HTML/markup

These checks are intentionally conservative.

---

## Orders backfill ("all previous orders")

Hermes can backfill orders via the UI:
- Orders → **Backfill**
- preset includes **"2y"**

Important: Amazon may archive older orders; the Orders API typically exposes up to ~2 years depending on marketplace/account settings.

---

## Dev

```bash
pnpm install
pnpm dev
```

Default port is `3014`.

---

## Database

Set:

```bash
DATABASE_URL=postgresql://...
```

### Schema/migrations
Hermes supports a dev-only auto-migrate mode:

```bash
HERMES_AUTO_MIGRATE=1
```

Production recommendation: run `db/schema.sql` using your normal migration tooling.

---

## Workers

### Request-a-Review dispatcher

```bash
pnpm worker:request-review
```

### Buyer message dispatcher

```bash
pnpm worker:buyer-message
```

### Orders sync (hourly)

```bash
pnpm worker:orders-sync
```

---

## Connection configuration

This standalone package reads connections from env.

### Multiple connections

```bash
HERMES_CONNECTIONS_JSON='[
  {"connectionId":"conn_us","region":"NA","marketplaceIds":["ATVPDKIKX0DER"],"lwaRefreshToken":"..."},
  {"connectionId":"conn_uk","region":"EU","marketplaceIds":["A1F83G8C2ARO7P"],"lwaRefreshToken":"..."}
]'
```

### Or single default connection
Use `SPAPI_*` variables plus `HERMES_DEFAULT_MARKETPLACE_IDS`.

See `.env.example` for all knobs.

---

## Base path

Hermes is designed to run under a base path.

```bash
BASE_PATH=/hermes
```

---

## Notes on Amazon policies

Hermes is built to respect:
- Solicitations API eligibility windows
- Messaging API per-order allowed actions
- "no duplicate review requests" safety

You are still responsible for complying with Amazon Communication Guidelines and any marketplace-specific rules.
