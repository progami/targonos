// Buyer-Seller Messaging dispatcher logic (shared by API + worker)
//
// NOTE: use relative imports so this module can run both in Next.js and in a standalone worker.
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
  getMessagingActionsForOrder,
  sendMessagingMessage,
  type MessagingKind,
} from "../sp-api/messaging";

function isExpired(expiresAtIso: string | null | undefined): boolean {
  if (!expiresAtIso) return false;
  const t = Date.parse(expiresAtIso);
  if (!Number.isFinite(t)) return false;
  return t <= Date.now();
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
    (c.includes("too") && c.includes("many")) ||
    (c.includes("rate") && c.includes("limit"))
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

function extractActions(body: any): Array<{ name?: string; href?: string }> {
  const payload = body?.payload ?? body;
  const actions = payload?._links?.actions ?? payload?.actions ?? [];
  if (!Array.isArray(actions)) return [];
  return actions.map((a: any) => ({
    name: typeof a?.name === "string" ? a.name : undefined,
    href: typeof a?.href === "string" ? a.href : undefined,
  }));
}

function hasActionForKind(actions: Array<{ name?: string; href?: string }>, kind: string): boolean {
  for (const a of actions) {
    if (a?.name === kind) return true;
    if (typeof a?.href === "string" && a.href.includes(`/messages/${kind}`)) return true;
  }
  return false;
}

function getBodyFromMetadata(row: DispatchRow): any {
  const m = (row as any).metadata;
  const message = m?.message ?? m?.buyerMessage ?? null;
  if (!message) return undefined;
  if (message?.body) return message.body;
  if (typeof message?.text === "string") return { text: message.text };
  return undefined;
}

export async function processBuyerMessageDispatch(row: DispatchRow, opts: {
  maxHardFailures: number;
}): Promise<void> {
  if (row.type !== "buyer_message") {
    throw new Error(`processBuyerMessageDispatch got wrong type: ${row.type}`);
  }

  const claimed = await claimDispatchForSending(row.id);
  if (!claimed) return;

  // Window safety
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

  const kind = row.message_kind as MessagingKind | null;
  if (!kind) {
    await appendAttempt({
      dispatchId: row.id,
      attemptNo,
      status: "failed",
      errorCode: "MISSING_MESSAGE_KIND",
      errorMessage: "buyer_message dispatch missing message_kind",
    });
    await markDispatchFailed(row.id, "missing_message_kind");
    return;
  }

  const client = new SpApiClient(loadSpApiConfigForConnection(row.connection_id));

  const requestIdFrom = (headers?: Record<string, string>) =>
    headers?.["x-amzn-requestid"] ?? headers?.["x-amzn-request-id"];

  // 1) Preflight eligibility (actions)
  const pre = await getMessagingActionsForOrder({
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
    await rescheduleDispatch({ dispatchId: row.id, delayMs: backoff, note: "throttled_preflight" });
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
    if (pre.status >= 500) {
      const backoff = Math.min(120_000, 1000 * 2 ** (attemptNo - 1)) + Math.floor(Math.random() * 250);
      await rescheduleDispatch({ dispatchId: row.id, delayMs: backoff, note: "preflight_5xx" });
      return;
    }
    await markDispatchFailed(row.id, `preflight_status_${pre.status}`);
    return;
  }

  const actions = extractActions(pre.body);
  if (!hasActionForKind(actions, kind)) {
    await appendAttempt({
      dispatchId: row.id,
      attemptNo,
      status: "ineligible",
      httpStatus: pre.status,
      spapiRequestId: requestIdFrom(pre.headers),
      errorCode: "NO_ACTION",
      errorMessage: `No action present for kind=${kind}`,
      responseJson: pre.body,
    });
    await markDispatchSkipped(row.id, `no_action_${kind}`);
    return;
  }

  // 2) Send
  const body = getBodyFromMetadata(row);
  const send = await sendMessagingMessage({
    client,
    orderId: row.order_id,
    marketplaceId: row.marketplace_id,
    kind,
    body,
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

  await markDispatchSkipped(row.id, `send_status_${send.status}`);
}

export async function requeueStuckBuyerMessages(stuckMinutes: number): Promise<number> {
  const pool = getPgPool();
  const res = await pool.query(
    `
    UPDATE hermes_dispatches
       SET state = 'queued',
           updated_at = NOW(),
           last_error = 'requeued_stuck_sending'
     WHERE state = 'sending'
       AND type = 'buyer_message'
       AND updated_at < NOW() - ($1 * INTERVAL '1 minute')
    `,
    [stuckMinutes]
  );
  return res.rowCount ?? 0;
}

export async function fetchDueBuyerMessages(limit: number): Promise<DispatchRow[]> {
  const pool = getPgPool();
  const res = await pool.query<DispatchRow>(
    `
    SELECT id, connection_id, order_id, marketplace_id, type, message_kind, state,
           scheduled_at::text, expires_at::text, sent_at::text, last_error, metadata
      FROM hermes_dispatches
     WHERE state = 'queued'
       AND type = 'buyer_message'
       AND scheduled_at <= NOW()
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY scheduled_at ASC
     LIMIT $1;
    `,
    [limit]
  );
  return res.rows;
}
