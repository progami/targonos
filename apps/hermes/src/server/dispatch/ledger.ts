import crypto from "crypto";

// NOTE: use relative imports so this module can run both in Next.js and in a standalone worker.
import { getPgPool } from "../db/pool";

export type DispatchType = "request_review" | "buyer_message";

export type DispatchState =
  | "queued"
  | "sending"
  | "sent"
  | "skipped"
  | "failed";

export type DispatchRow = {
  id: string;
  connection_id: string;
  order_id: string;
  marketplace_id: string;
  type: DispatchType;
  message_kind: string | null;
  state: DispatchState;
  scheduled_at: string;
  expires_at: string | null;
  sent_at: string | null;
  last_error: string | null;
  campaign_id?: string | null;
  experiment_id?: string | null;
  variant_id?: string | null;
  template_id?: string | null;
  metadata?: any;
};

export type QueueResult =
  | { kind: "queued"; dispatch: DispatchRow }
  | { kind: "already_sent"; dispatch: DispatchRow }
  | { kind: "already_queued"; dispatch: DispatchRow };

function newId(): string {
  // url-safe base64 id (no padding)
  return crypto.randomBytes(16).toString("base64url");
}

function normalizeMessageKind(kind: string): string {
  return kind.trim();
}

/**
 * Hard safety: this is the ONLY way to create a request-review dispatch.
 *
 * Idempotency:
 * - enforced by DB unique index: (connection_id, order_id) WHERE type='request_review'
 */
export async function queueRequestReview(params: {
  connectionId: string;
  orderId: string;
  marketplaceId: string;
  scheduledAt?: Date;
  expiresAt?: Date | null;
  campaignId?: string | null;
  experimentId?: string | null;
  variantId?: string | null;
  templateId?: string | null;
  metadata?: unknown;
}): Promise<QueueResult> {
  const pool = getPgPool();
  const id = newId();
  const scheduledAt = params.scheduledAt ?? new Date();
  const expiresAt = params.expiresAt ?? null;

  const insert = await pool.query<DispatchRow>(
    `
    INSERT INTO hermes_dispatches (
      id, connection_id, order_id, marketplace_id, type, message_kind, state, scheduled_at,
      expires_at, campaign_id, experiment_id, variant_id, template_id, metadata
    ) VALUES ($1, $2, $3, $4, 'request_review', NULL, 'queued', $5,
              $6, $7, $8, $9, $10, $11::jsonb)
    ON CONFLICT (connection_id, order_id) WHERE type = 'request_review' DO NOTHING
    RETURNING id, connection_id, order_id, marketplace_id, type, message_kind, state,
              scheduled_at::text, expires_at::text, sent_at::text, last_error,
              campaign_id, experiment_id, variant_id, template_id, metadata;
    `,
    [
      id,
      params.connectionId,
      params.orderId,
      params.marketplaceId,
      scheduledAt,
      expiresAt,
      params.campaignId ?? null,
      params.experimentId ?? null,
      params.variantId ?? null,
      params.templateId ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ]
  );

  if (insert.rows[0]) {
    return { kind: "queued", dispatch: insert.rows[0] };
  }

  // Exists already: load current state and respond idempotently.
  const existing = await pool.query<DispatchRow>(
    `
    SELECT id, connection_id, order_id, marketplace_id, type, message_kind, state,
           scheduled_at::text, expires_at::text, sent_at::text, last_error,
           campaign_id, experiment_id, variant_id, template_id, metadata
      FROM hermes_dispatches
     WHERE connection_id = $1 AND order_id = $2 AND type = 'request_review'
     LIMIT 1;
    `,
    [params.connectionId, params.orderId]
  );

  if (!existing.rows[0]) {
    // Extremely unlikely unless the row was deleted between queries.
    // Treat as queued via retry.
    return queueRequestReview(params);
  }

  const row = existing.rows[0];
  if (row.state === "sent") return { kind: "already_sent", dispatch: row };
  return { kind: "already_queued", dispatch: row };
}

/**
 * Buyer-Seller Messaging (Messaging API)
 *
 * Idempotency:
 * - enforced by DB unique index: (connection_id, order_id, message_kind) WHERE type='buyer_message'
 */
export async function queueBuyerMessage(params: {
  connectionId: string;
  orderId: string;
  marketplaceId: string;
  messageKind: string;
  scheduledAt?: Date;
  expiresAt?: Date | null;
  campaignId?: string | null;
  experimentId?: string | null;
  variantId?: string | null;
  templateId?: string | null;
  metadata?: unknown;
}): Promise<QueueResult> {
  const pool = getPgPool();
  const id = newId();
  const scheduledAt = params.scheduledAt ?? new Date();
  const expiresAt = params.expiresAt ?? null;
  const kind = normalizeMessageKind(params.messageKind);
  if (!kind) throw new Error("messageKind is required");

  const insert = await pool.query<DispatchRow>(
    `
    INSERT INTO hermes_dispatches (
      id, connection_id, order_id, marketplace_id, type, message_kind, state, scheduled_at,
      expires_at, campaign_id, experiment_id, variant_id, template_id, metadata
    ) VALUES ($1, $2, $3, $4, 'buyer_message', $5, 'queued', $6,
              $7, $8, $9, $10, $11, $12::jsonb)
    ON CONFLICT (connection_id, order_id, message_kind) WHERE type = 'buyer_message' DO NOTHING
    RETURNING id, connection_id, order_id, marketplace_id, type, message_kind, state,
              scheduled_at::text, expires_at::text, sent_at::text, last_error,
              campaign_id, experiment_id, variant_id, template_id, metadata;
    `,
    [
      id,
      params.connectionId,
      params.orderId,
      params.marketplaceId,
      kind,
      scheduledAt,
      expiresAt,
      params.campaignId ?? null,
      params.experimentId ?? null,
      params.variantId ?? null,
      params.templateId ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ]
  );

  if (insert.rows[0]) {
    return { kind: "queued", dispatch: insert.rows[0] };
  }

  const existing = await pool.query<DispatchRow>(
    `
    SELECT id, connection_id, order_id, marketplace_id, type, message_kind, state,
           scheduled_at::text, expires_at::text, sent_at::text, last_error,
           campaign_id, experiment_id, variant_id, template_id, metadata
      FROM hermes_dispatches
     WHERE connection_id = $1
       AND order_id = $2
       AND type = 'buyer_message'
       AND message_kind = $3
     LIMIT 1;
    `,
    [params.connectionId, params.orderId, kind]
  );

  if (!existing.rows[0]) {
    return queueBuyerMessage(params);
  }

  const row = existing.rows[0];
  if (row.state === "sent") return { kind: "already_sent", dispatch: row };
  return { kind: "already_queued", dispatch: row };
}

/**
 * Concurrency guard for workers/API:
 * claim a queued dispatch so that only ONE process can send it.
 */
export async function claimDispatchForSending(dispatchId: string): Promise<boolean> {
  const pool = getPgPool();
  const res = await pool.query(
    `
    UPDATE hermes_dispatches
       SET state = 'sending', updated_at = NOW()
     WHERE id = $1 AND state = 'queued'
     RETURNING id;
    `,
    [dispatchId]
  );
  return res.rowCount === 1;
}

export async function markDispatchSent(dispatchId: string): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `
    UPDATE hermes_dispatches
       SET state = 'sent', sent_at = NOW(), last_error = NULL, updated_at = NOW()
     WHERE id = $1;
    `,
    [dispatchId]
  );
}

export async function markDispatchSkipped(dispatchId: string, reason: string): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `
    UPDATE hermes_dispatches
       SET state = 'skipped', last_error = $2, updated_at = NOW()
     WHERE id = $1;
    `,
    [dispatchId, reason]
  );
}

export async function markDispatchFailed(dispatchId: string, err: string): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `
    UPDATE hermes_dispatches
       SET state = 'failed', last_error = $2, updated_at = NOW()
     WHERE id = $1;
    `,
    [dispatchId, err]
  );
}

export async function appendAttempt(params: {
  dispatchId: string;
  attemptNo: number;
  status: "sent" | "ineligible" | "throttled" | "failed";
  httpStatus?: number;
  spapiRequestId?: string;
  errorCode?: string;
  errorMessage?: string;
  responseJson?: unknown;
}): Promise<void> {
  const pool = getPgPool();
  const id = newId();
  await pool.query(
    `
    INSERT INTO hermes_dispatch_attempts (
      id, dispatch_id, attempt_no, status, http_status, spapi_request_id,
      error_code, error_message, response_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb);
    `,
    [
      id,
      params.dispatchId,
      params.attemptNo,
      params.status,
      params.httpStatus ?? null,
      params.spapiRequestId ?? null,
      params.errorCode ?? null,
      params.errorMessage ?? null,
      params.responseJson ? JSON.stringify(params.responseJson) : null,
    ]
  );
}
