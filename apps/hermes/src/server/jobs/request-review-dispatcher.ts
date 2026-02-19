/**
 * Hermes worker skeleton: Request-a-Review dispatcher
 *
 * Run locally (dev):
 *   pnpm worker:request-review
 *
 * What this does:
 * - scans for due dispatches (state=queued, scheduled_at <= now)
 * - claims each job (queued -> sending) so ONLY ONE worker can send
 * - preflights Amazon eligibility via getSolicitationActionsForOrder
 * - sends via createProductReviewAndSellerFeedbackSolicitation
 * - records every attempt in hermes_dispatch_attempts
 * - never creates duplicates (UNIQUE + claim step)
 *
 * IMPORTANT
 * - This worker uses Hermes' SP-API client (LWA + SigV4) and an in-process
 *   token-bucket limiter. For multiple workers/processes, move rate limiting
 *   to a shared store (Redis) so all workers cooperate.
 */

import { maybeAutoMigrate } from "../db/migrate";
import { getPgPool } from "../db/pool";
import {
  appendAttempt,
  claimDispatchForSending,
  markDispatchFailed,
  markDispatchSent,
  markDispatchSkipped,
  type DispatchRow,
} from "../dispatch/ledger";
import { SpApiClient } from "../sp-api/client";
import { loadSpApiConfigForConnection } from "../sp-api/connection-config";
import {
  createProductReviewAndSellerFeedbackSolicitation,
  getSolicitationActionsForOrder,
} from "../sp-api/solicitations";
import { isHermesDryRun } from "../env/flags";
import { loadHermesEnv } from "./load-env";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function isExpired(expiresAtIso: string | null | undefined): boolean {
  if (!expiresAtIso) return false;
  const t = Date.parse(expiresAtIso);
  if (!Number.isFinite(t)) return false;
  return t <= Date.now();
}

function getInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

// loadSpApiConfigForConnection lives in ../sp-api/connection-config.ts

function hasReviewActionFromResponseBody(body: any): boolean {
  // Amazon can return actions in different shapes:
  // - Orders-style: { payload: { actions: [...] } }
  // - Direct: { actions: [...] }
  // - Solicitations HAL: { _embedded: { actions: [...] } }
  let actions: any[] | null = null;
  if (Array.isArray(body?.payload?.actions)) actions = body.payload.actions;
  else if (Array.isArray(body?.actions)) actions = body.actions;
  else if (Array.isArray(body?._embedded?.actions)) actions = body._embedded.actions;
  if (!actions) return false;

  for (const a of actions) {
    const name = a?.name;
    const href = a?.href;
    if (name === "productReviewAndSellerFeedback") return true;
    if (typeof href === "string" && href.includes("productReviewAndSellerFeedback")) return true;
  }
  return false;
}

function isThrottled(status: number, body: any): boolean {
  if (status === 429) return true;
  const code =
    body?.errors?.[0]?.code ??
    body?.code ??
    body?.errorCode ??
    body?.error_code;
  if (typeof code !== "string") return false;
  const c = code.toLowerCase();
  return (
    c.includes("thrott") ||
    c.includes("quota") ||
    c.includes("too") && c.includes("many") ||
    c.includes("rate") && c.includes("limit")
  );
}

async function getAttemptNo(dispatchId: string): Promise<number> {
  const pool = getPgPool();
  const res = await pool.query<{ max: number }>(
    `SELECT COALESCE(MAX(attempt_no), 0) AS max FROM hermes_dispatch_attempts WHERE dispatch_id = $1;`,
    [dispatchId]
  );
  return (res.rows[0]?.max ?? 0) + 1;
}

async function getHardFailureCount(dispatchId: string): Promise<number> {
  const pool = getPgPool();
  const res = await pool.query<{ n: number }>(
    `SELECT COUNT(1)::int AS n FROM hermes_dispatch_attempts WHERE dispatch_id = $1 AND status = 'failed';`,
    [dispatchId]
  );
  return res.rows[0]?.n ?? 0;
}

async function getIneligibleInfo(dispatchId: string): Promise<{ count: number; daysSinceFirst: number | null }> {
  const pool = getPgPool();
  const res = await pool.query<{ n: number; first_at: Date | null }>(
    `SELECT COUNT(1)::int AS n, MIN(created_at) AS first_at FROM hermes_dispatch_attempts WHERE dispatch_id = $1 AND status = 'ineligible' AND error_code = 'NO_ACTION';`,
    [dispatchId]
  );
  const count = res.rows[0]?.n ?? 0;
  const firstAt = res.rows[0]?.first_at;
  const daysSinceFirst = firstAt ? (Date.now() - new Date(firstAt).getTime()) / (24 * 60 * 60 * 1000) : null;
  return { count, daysSinceFirst };
}

async function hasSentAttempt(dispatchId: string): Promise<boolean> {
  const pool = getPgPool();
  const res = await pool.query<{ n: number }>(
    `SELECT COUNT(1)::int AS n FROM hermes_dispatch_attempts WHERE dispatch_id = $1 AND status = 'sent';`,
    [dispatchId]
  );
  return (res.rows[0]?.n ?? 0) > 0;
}

async function rescheduleDispatch(params: {
  dispatchId: string;
  delayMs: number;
  note?: string;
}): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `
    UPDATE hermes_dispatches
       SET state = 'queued',
           scheduled_at = NOW() + ($2 * INTERVAL '1 millisecond'),
           last_error = COALESCE($3, last_error),
           updated_at = NOW()
     WHERE id = $1;
    `,
    [params.dispatchId, params.delayMs, params.note ?? null]
  );
}

async function requeueStuckSending(stuckMinutes: number): Promise<number> {
  const pool = getPgPool();
  const res = await pool.query(
    `
    UPDATE hermes_dispatches
       SET state = 'queued',
           updated_at = NOW(),
           last_error = 'requeued_stuck_sending'
     WHERE state = 'sending'
       AND type = 'request_review'
       AND updated_at < NOW() - ($1 * INTERVAL '1 minute')
    `,
    [stuckMinutes]
  );
  return res.rowCount ?? 0;
}

async function fetchDueDispatches(limit: number): Promise<DispatchRow[]> {
  const pool = getPgPool();
  const res = await pool.query<DispatchRow>(
    `
    SELECT id, connection_id, order_id, marketplace_id, type, state,
           scheduled_at::text, expires_at::text, sent_at::text, last_error
     FROM hermes_dispatches
     WHERE state = 'queued'
       AND type = 'request_review'
       AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC
     LIMIT $1;
    `,
    [limit]
  );
  return res.rows;
}

async function processDispatch(row: DispatchRow, opts: {
  maxHardFailures: number;
  ineligibleWindowDays: number;
}): Promise<void> {
  const claimed = await claimDispatchForSending(row.id);
  if (!claimed) return; // Another worker got it.

  // Window safety: don't attempt outside your allowed policy window.
  if (isExpired(row.expires_at)) {
    const attemptNo = await getAttemptNo(row.id);
    await appendAttempt({
      dispatchId: row.id,
      attemptNo,
      status: "ineligible",
      errorCode: "EXPIRED",
      errorMessage: "Dispatch expired before send window",
    });
    await markDispatchSkipped(row.id, "expired");
    return;
  }

  // Extra safety: if we ever successfully sent but crashed before marking the dispatch row,
  // never attempt to send again.
  if (await hasSentAttempt(row.id)) {
    await markDispatchSent(row.id);
    return;
  }

  const attemptNo = await getAttemptNo(row.id);
  const hardFailures = await getHardFailureCount(row.id);
  if (hardFailures >= opts.maxHardFailures) {
    await appendAttempt({
      dispatchId: row.id,
      attemptNo,
      status: "failed",
      errorCode: "MAX_HARD_FAILURES",
      errorMessage: `Max hard failures (${opts.maxHardFailures}) reached`,
    });
    await markDispatchFailed(row.id, `max_hard_failures_${opts.maxHardFailures}`);
    return;
  }

  // Amazon's solicitation window is 5-30 days after delivery. If we've been
  // getting NO_ACTION for over 30 days the window has almost certainly closed.
  const ineligible = await getIneligibleInfo(row.id);
  if (ineligible.count > 0 && ineligible.daysSinceFirst !== null && ineligible.daysSinceFirst >= opts.ineligibleWindowDays) {
    await appendAttempt({
      dispatchId: row.id,
      attemptNo,
      status: "ineligible",
      errorCode: "INELIGIBLE_WINDOW_EXPIRED",
      errorMessage: `Skipped after ${ineligible.count} ineligible attempts over ${Math.round(ineligible.daysSinceFirst)}d — outside Amazon's 5-30 day solicitation window`,
    });
    await markDispatchSkipped(row.id, `ineligible_window_expired_${ineligible.count}`);
    return;
  }

  const client = new SpApiClient(loadSpApiConfigForConnection(row.connection_id));

  const requestIdFrom = (headers?: Record<string, string>) =>
    headers?.["x-amzn-requestid"] ?? headers?.["x-amzn-request-id"];

  // 1) Preflight eligibility
  const pre = await getSolicitationActionsForOrder({
    client,
    orderId: row.order_id,
    marketplaceId: row.marketplace_id,
  });

  if (isThrottled(pre.status, pre.body)) {
    await appendAttempt({
      dispatchId: row.id,
      attemptNo,
      status: "throttled",
      httpStatus: pre.status,
      spapiRequestId: requestIdFrom(pre.headers),
      errorCode: "THROTTLED_PREFLIGHT",
      responseJson: pre.body,
    });
    const backoff = Math.min(60_000, 1000 * 2 ** (attemptNo - 1)) + Math.floor(Math.random() * 250);
    await rescheduleDispatch({
      dispatchId: row.id,
      delayMs: backoff,
      note: "throttled_preflight",
    });
    return;
  }

  if (pre.status !== 200) {
    await appendAttempt({
      dispatchId: row.id,
      attemptNo,
      status: "failed",
      httpStatus: pre.status,
      spapiRequestId: requestIdFrom(pre.headers),
      errorCode: "PREFLIGHT_FAILED",
      errorMessage: `Unexpected status ${pre.status}`,
      responseJson: pre.body,
    });
    // Retry transient errors; fail hard on obvious client errors.
    if (pre.status >= 500) {
      const backoff = Math.min(120_000, 1000 * 2 ** (attemptNo - 1)) + Math.floor(Math.random() * 250);
      await rescheduleDispatch({ dispatchId: row.id, delayMs: backoff, note: "preflight_5xx" });
      return;
    }
    await markDispatchFailed(row.id, `preflight_status_${pre.status}`);
    return;
  }

  const eligible = hasReviewActionFromResponseBody(pre.body);
  if (!eligible) {
    // Likely too early / not eligible; reschedule a conservative retry.
    await appendAttempt({
      dispatchId: row.id,
      attemptNo,
      status: "ineligible",
      httpStatus: pre.status,
      spapiRequestId: requestIdFrom(pre.headers),
      errorCode: "NO_ACTION",
      errorMessage: "No productReviewAndSellerFeedback action present",
      responseJson: pre.body,
    });
    await rescheduleDispatch({
      dispatchId: row.id,
      delayMs: 24 * 60 * 60 * 1000, // 24 hours
      note: "ineligible_retry",
    });
    return;
  }

  // 2) Send (rate-limited by SpApiClient's token bucket)

  const send = await createProductReviewAndSellerFeedbackSolicitation({
    client,
    orderId: row.order_id,
    marketplaceId: row.marketplace_id,
  });

  if (isThrottled(send.status, send.body)) {
    await appendAttempt({
      dispatchId: row.id,
      attemptNo,
      status: "throttled",
      httpStatus: send.status,
      spapiRequestId: requestIdFrom(send.headers),
      errorCode: "THROTTLED_SEND",
      responseJson: send.body,
    });
    const backoff = Math.min(60_000, 1000 * 2 ** (attemptNo - 1)) + Math.floor(Math.random() * 250);
    await rescheduleDispatch({ dispatchId: row.id, delayMs: backoff, note: "throttled_send" });
    return;
  }

  if (send.status >= 200 && send.status < 300) {
    await appendAttempt({
      dispatchId: row.id,
      attemptNo,
      status: "sent",
      httpStatus: send.status,
      spapiRequestId: requestIdFrom(send.headers),
      responseJson: send.body,
    });
    await markDispatchSent(row.id);
    return;
  }

  await appendAttempt({
    dispatchId: row.id,
    attemptNo,
    status: "failed",
    httpStatus: send.status,
    spapiRequestId: requestIdFrom(send.headers),
    errorCode: "SEND_FAILED",
    errorMessage: `Unexpected status ${send.status}`,
    responseJson: send.body,
  });

  if (send.status >= 500) {
    const backoff = Math.min(120_000, 1000 * 2 ** (attemptNo - 1)) + Math.floor(Math.random() * 250);
    await rescheduleDispatch({ dispatchId: row.id, delayMs: backoff, note: "send_5xx" });
    return;
  }

  // Auth/config errors should be surfaced as failed (not skipped).
  if (send.status === 401 || send.status === 403) {
    await markDispatchFailed(row.id, `auth_status_${send.status}`);
    return;
  }

  // If Amazon says it's now invalid, don't hammer it.
  await markDispatchSkipped(row.id, `send_status_${send.status}`);
}

async function main() {
  loadHermesEnv();

  if (isHermesDryRun()) {
    console.log(`[${nowIso()}] HERMES_DRY_RUN is enabled — request-review dispatcher will not process dispatches.`);
    // Keep the process alive so monitoring sees it as running, but do nothing.
    setInterval(() => {}, 60_000);
    return;
  }

  await maybeAutoMigrate();

  const loopMs = getInt("HERMES_WORKER_LOOP_MS", 1500);
  const batchSize = getInt("HERMES_WORKER_BATCH_SIZE", 10);
  const maxHardFailures = getInt("HERMES_MAX_HARD_FAILURES", getInt("HERMES_MAX_ATTEMPTS", 5));
  const ineligibleWindowDays = getInt("HERMES_INELIGIBLE_WINDOW_DAYS", 30);
  const stuckMinutes = getInt("HERMES_STUCK_SENDING_MINUTES", 15);

  console.log(`[${nowIso()}] Hermes worker started (request_review)`);
  console.log(
    JSON.stringify(
      { loopMs, batchSize, maxHardFailures, ineligibleWindowDays, stuckMinutes },
      null,
      2
    )
  );

  let stop = false;
  process.on("SIGINT", () => {
    stop = true;
    console.log(`[${nowIso()}] SIGINT received; shutting down...`);
  });
  process.on("SIGTERM", () => {
    stop = true;
    console.log(`[${nowIso()}] SIGTERM received; shutting down...`);
  });

  // eslint-disable-next-line no-constant-condition
  while (!stop) {
    try {
      const requeued = await requeueStuckSending(stuckMinutes);
      if (requeued > 0) {
        console.log(`[${nowIso()}] Re-queued ${requeued} stuck dispatch(es)`);
      }

      const due = await fetchDueDispatches(batchSize);
      if (due.length === 0) {
        await sleep(loopMs);
        continue;
      }

      for (const row of due) {
        try {
          await processDispatch(row, { maxHardFailures, ineligibleWindowDays });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[${nowIso()}] Dispatch ${row.id} error: ${message}`);
          try {
            const attemptNo = await getAttemptNo(row.id);
            await appendAttempt({
              dispatchId: row.id,
              attemptNo,
              status: "failed",
              errorCode: "WORKER_EXCEPTION",
              errorMessage: message,
            });
            await markDispatchFailed(row.id, message);
          } catch {
            // If DB is down, we can't do much.
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${nowIso()}] Loop error: ${message}`);
      await sleep(loopMs);
    }
  }

  console.log(`[${nowIso()}] Hermes worker stopped`);
}

main().catch((e) => {
  console.error(`[${nowIso()}] Fatal:`, e);
  process.exit(1);
});
