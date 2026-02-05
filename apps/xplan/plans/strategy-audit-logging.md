# Strategy audit logging

## Background

On Feb 4, 2026 we had seeded US strategies (e.g. `cmjiwt2c50000xv40iug75zzw`) deleted from the
`portal_db.xplan` schema. Because the DB relationships are `ON DELETE CASCADE`, deleting the
strategy row also deletes its child data (products, purchase orders, weeks, etc).

Nginx access logs confirmed the HTTP `DELETE /xplan/api/v1/xplan/strategies` call, but:
- the request body (strategy id) is not logged
- the actor (user email/id) is not logged
- the real client IP is not visible (requests arrive via `cloudflared` → `nginx`, so `$remote_addr`
  is `127.0.0.1`)

## Current status

- Implemented: app-level console audit log for strategy deletes (includes actor + request metadata).
- Implemented: manual Sellerboard sync routes log actor + strategyId + duration + update counts.
- Missing: nginx access log format that captures forwarded client IP + CF request id.
- Missing: DB-backed audit table (optional).

## Goals

Be able to answer “who deleted strategy X?” quickly and confidently, with:
- Actor: user id + email
- Strategy: id + name + region
- Timestamp: ISO + server local time
- Request metadata: user-agent + forwarded client IP + CF request id (if available)

Constraints:
- Do not log secrets (cookies, auth headers, OAuth codes, request bodies).

## Proposed work

### 1) App-level audit events (XPlan)

Add structured logging to XPlan API routes for destructive changes:
- Strategy create / update / delete
- Product create / update / delete
- Purchase order create / update / delete

Minimum event payload for strategy delete:
- `actor`: `{ id, email, isSuperAdmin }`
- `strategy`: `{ id, name, region, createdByEmail, assigneeEmail }`
- `request`: `{ userAgent, xForwardedFor, cfConnectingIp, cfRay }`

Implementation sketch:
- Emit a single line JSON event (e.g. `console.info(JSON.stringify({ ... }))`) after the action is
  authorized and before/after the DB transaction.

### 2) Nginx access log format (server)

Switch from the default `combined` access log format to a custom format that includes forwarded
client IP and Cloudflare request metadata:
- `$http_cf_connecting_ip` (real client IP from Cloudflare)
- `$http_x_forwarded_for` (proxy chain)
- `$http_cf_ray` (Cloudflare request id)
- `$request_time` and `$upstream_response_time`

Explicitly do **not** include `$http_cookie` or authorization headers in the access log format.

### 3) Optional: DB-backed audit table

If we need long-lived querying without log access, add a DB table in `portal_db.xplan` such as:
- `AuditEvent` (generic) or `StrategyAuditLog` (specific)

Recommended columns:
- `id`, `createdAt`, `action`, `actorEmail`, `actorId`, `strategyId`, `strategyName`, `ip`,
  `userAgent`

Add a retention policy (e.g. 90 days) and index by `(strategyId, createdAt)`.

## Acceptance criteria

- After a delete, we can identify the actor email and strategy id from logs within ~1 minute.
- Nginx access logs show the real client IP (via CF/XFF), not only `127.0.0.1`.
