import crypto from "crypto";

import { getPgPool } from "../db/pool";

export type HermesOrder = {
  orderId: string;
  marketplaceId: string;
  purchaseDate?: string | null;
  lastUpdateDate?: string | null;
  orderStatus?: string | null;
  fulfillmentChannel?: string | null;
  earliestDeliveryDate?: string | null;
  latestDeliveryDate?: string | null;
  latestShipDate?: string | null;
  raw?: unknown;
};

export type ScheduleConfig = {
  delayDays: number; // policy: 5..30
  windowEnabled: boolean;
  startHour: number; // 0..23
  endHour: number; // 0..23
  spreadEnabled: boolean;
  spreadMaxMinutes: number;
  timezone?: string; // stored for future use; scheduling is server-local for now
};

function newId(): string {
  // url-safe base64 id (no padding)
  return crypto.randomBytes(16).toString("base64url");
}

function parseDate(input?: string | null): Date | null {
  if (!input) return null;
  const t = Date.parse(input);
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function applySendWindow(d: Date, cfg: ScheduleConfig): Date {
  if (!cfg.windowEnabled) return d;

  const start = clamp(cfg.startHour, 0, 23);
  const end = clamp(cfg.endHour, 0, 23);

  const out = new Date(d);
  const h = out.getHours();

  // If end <= start, treat as "any time" (invalid window becomes no-op).
  if (end <= start) return out;

  if (h < start) {
    out.setHours(start, 0, 0, 0);
    return out;
  }
  if (h >= end) {
    out.setDate(out.getDate() + 1);
    out.setHours(start, 0, 0, 0);
    return out;
  }
  return out;
}

function applySpread(d: Date, cfg: ScheduleConfig): Date {
  if (!cfg.spreadEnabled) return d;
  const max = clamp(cfg.spreadMaxMinutes, 0, 24 * 60);
  if (max <= 0) return d;
  const jitterMs = Math.floor(Math.random() * max) * 60_000;
  return new Date(d.getTime() + jitterMs);
}

export function computeScheduleForOrder(order: HermesOrder, cfg: ScheduleConfig): {
  scheduledAt: Date;
  expiresAt: Date | null;
  policyAnchor: "delivery" | "ship" | "purchase" | "unknown";
} {
  const delayDays = clamp(cfg.delayDays, 5, 30);

  const latestDelivery = parseDate(order.latestDeliveryDate);
  const earliestDelivery = parseDate(order.earliestDeliveryDate);
  const latestShip = parseDate(order.latestShipDate);
  const purchase = parseDate(order.purchaseDate);

  const deliveryAnchor = latestDelivery ?? earliestDelivery;
  const anchor = deliveryAnchor ?? latestShip ?? purchase;

  // Scheduled at:
  // - prefer delivery estimate (delivery + delay)
  // - otherwise fall back to ship date (ship + delay)
  // - otherwise purchase date (purchase + delay)
  // - otherwise now (best effort)
  const base = anchor ?? new Date();
  const scheduledBase = anchor ? addDays(base, delayDays) : base;
  let scheduledAt = applySendWindow(scheduledBase, cfg);
  scheduledAt = applySpread(scheduledAt, cfg);

  // Expiry: Amazon policy window is 30 days after delivery. If we only have purchase date,
  // use +60d as a conservative approximation (covers longer shipping scenarios).
  let expiresAt: Date | null = null;
  if (deliveryAnchor) {
    expiresAt = endOfDay(addDays(deliveryAnchor, 30));
  } else if (latestShip) {
    expiresAt = endOfDay(addDays(latestShip, 45));
  } else if (purchase) {
    expiresAt = endOfDay(addDays(purchase, 60));
  }

  return {
    scheduledAt,
    expiresAt,
    policyAnchor: deliveryAnchor ? "delivery" : latestShip ? "ship" : purchase ? "purchase" : "unknown",
  };
}

export function extractOrdersFromGetOrdersResponse(body: any, marketplaceId: string): HermesOrder[] {
  const payload = body?.payload ?? body;
  const orders = payload?.Orders ?? payload?.orders ?? [];
  if (!Array.isArray(orders)) return [];

  return orders
    .map((o: any) => {
      const orderId = o?.AmazonOrderId ?? o?.amazonOrderId;
      if (typeof orderId !== "string" || !orderId) return null;

      return {
        orderId,
        marketplaceId: (typeof (o?.MarketplaceId ?? o?.marketplaceId) === "string" && (o?.MarketplaceId ?? o?.marketplaceId)) ? String(o?.MarketplaceId ?? o?.marketplaceId) : marketplaceId,
        purchaseDate: o?.PurchaseDate ?? o?.purchaseDate ?? null,
        lastUpdateDate: o?.LastUpdateDate ?? o?.lastUpdateDate ?? null,
        orderStatus: o?.OrderStatus ?? o?.orderStatus ?? null,
        fulfillmentChannel: o?.FulfillmentChannel ?? o?.fulfillmentChannel ?? null,
        earliestDeliveryDate: o?.EarliestDeliveryDate ?? o?.earliestDeliveryDate ?? null,
        latestDeliveryDate: o?.LatestDeliveryDate ?? o?.latestDeliveryDate ?? null,
        latestShipDate: o?.LatestShipDate ?? o?.latestShipDate ?? null,
        raw: o,
      } satisfies HermesOrder;
    })
    .filter(Boolean) as HermesOrder[];
}

export async function upsertOrders(params: {
  connectionId: string;
  orders: HermesOrder[];
}): Promise<{ upserted: number }> {
  const pool = getPgPool();

  let upserted = 0;
  for (const o of params.orders) {
    await pool.query(
      `
      INSERT INTO hermes_orders (
        connection_id, order_id, marketplace_id,
        purchase_date, last_update_date, order_status, fulfillment_channel,
        earliest_delivery_date, latest_delivery_date, latest_ship_date,
        raw, imported_at, updated_at
      ) VALUES (
        $1,$2,$3,
        $4::timestamptz,$5::timestamptz,$6,$7,
        $8::timestamptz,$9::timestamptz,$10::timestamptz,
        $11::jsonb, NOW(), NOW()
      )
      ON CONFLICT (connection_id, order_id) DO UPDATE
        SET marketplace_id = EXCLUDED.marketplace_id,
            purchase_date = COALESCE(EXCLUDED.purchase_date, hermes_orders.purchase_date),
            last_update_date = COALESCE(EXCLUDED.last_update_date, hermes_orders.last_update_date),
            order_status = COALESCE(EXCLUDED.order_status, hermes_orders.order_status),
            fulfillment_channel = COALESCE(EXCLUDED.fulfillment_channel, hermes_orders.fulfillment_channel),
            earliest_delivery_date = COALESCE(EXCLUDED.earliest_delivery_date, hermes_orders.earliest_delivery_date),
            latest_delivery_date = COALESCE(EXCLUDED.latest_delivery_date, hermes_orders.latest_delivery_date),
            latest_ship_date = COALESCE(EXCLUDED.latest_ship_date, hermes_orders.latest_ship_date),
            raw = COALESCE(EXCLUDED.raw, hermes_orders.raw),
            updated_at = NOW();
      `,
      [
        params.connectionId,
        o.orderId,
        o.marketplaceId,
        o.purchaseDate ?? null,
        o.lastUpdateDate ?? null,
        o.orderStatus ?? null,
        o.fulfillmentChannel ?? null,
        o.earliestDeliveryDate ?? null,
        o.latestDeliveryDate ?? null,
        o.latestShipDate ?? null,
        o.raw ? JSON.stringify(o.raw) : null,
      ]
    );
    upserted += 1;
  }

  return { upserted };
}

export async function enqueueRequestReviewsForOrders(params: {
  connectionId: string;
  orders: HermesOrder[];
  schedule: ScheduleConfig;
  campaignId?: string | null;
  experimentId?: string | null;
  variantId?: string | null;
}): Promise<{ enqueued: number; skippedExpired: number; alreadyExists: number }> {
  if (params.orders.length === 0) {
    return { enqueued: 0, skippedExpired: 0, alreadyExists: 0 };
  }

  const pool = getPgPool();

  let skippedExpired = 0;
  const rows: Array<{
    id: string;
    order_id: string;
    marketplace_id: string;
    scheduled_at: string;
    expires_at: string | null;
    metadata: unknown;
  }> = [];

  for (const o of params.orders) {
    if (typeof o.orderStatus === "string") {
      const s = o.orderStatus.trim();
      if (s !== "Shipped" && s !== "PartiallyShipped") {
        continue;
      }
    }

    const { scheduledAt, expiresAt, policyAnchor } = computeScheduleForOrder(o, params.schedule);

    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      skippedExpired += 1;
      continue;
    }

    rows.push({
      id: newId(),
      order_id: o.orderId,
      marketplace_id: o.marketplaceId,
      scheduled_at: scheduledAt.toISOString(),
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      metadata: {
        source: "orders_backfill",
        policyAnchor,
        schedule: {
          delayDays: clamp(params.schedule.delayDays, 5, 30),
          windowEnabled: params.schedule.windowEnabled,
          startHour: params.schedule.startHour,
          endHour: params.schedule.endHour,
          spreadEnabled: params.schedule.spreadEnabled,
          spreadMaxMinutes: params.schedule.spreadMaxMinutes,
          timezone: params.schedule.timezone,
        },
        order: {
          purchaseDate: o.purchaseDate ?? null,
          latestDeliveryDate: o.latestDeliveryDate ?? null,
          earliestDeliveryDate: o.earliestDeliveryDate ?? null,
        },
      },
    });
  }

  if (rows.length === 0) {
    return { enqueued: 0, skippedExpired, alreadyExists: 0 };
  }

  const insert = await pool.query(
    `
    INSERT INTO hermes_dispatches (
      id, connection_id, order_id, marketplace_id,
      type, message_kind, state, scheduled_at,
      expires_at, campaign_id, experiment_id, variant_id, template_id, metadata
    )
    SELECT
      x.id,
      $1,
      x.order_id,
      x.marketplace_id,
      'request_review',
      NULL,
      'queued',
      x.scheduled_at::timestamptz,
      x.expires_at::timestamptz,
      $2,
      $3,
      $4,
      NULL,
      x.metadata::jsonb
    FROM jsonb_to_recordset($5::jsonb) AS x(
      id text,
      order_id text,
      marketplace_id text,
      scheduled_at text,
      expires_at text,
      metadata jsonb
    )
    ON CONFLICT (connection_id, order_id) WHERE type = 'request_review' DO NOTHING;
    `,
    [
      params.connectionId,
      params.campaignId ?? null,
      params.experimentId ?? null,
      params.variantId ?? null,
      JSON.stringify(rows),
    ]
  );

  const enqueued = insert.rowCount ?? 0;
  const alreadyExists = rows.length - enqueued;

  return { enqueued, skippedExpired, alreadyExists };
}

export async function listRecentOrders(params: {
  connectionId: string;
  limit?: number;
}): Promise<
  Array<{
    orderId: string;
    marketplaceId: string;
    purchaseDate: string | null;
    latestDeliveryDate: string | null;
    orderStatus: string | null;
    fulfillmentChannel: string | null;
    dispatchState: string | null;
    dispatchScheduledAt: string | null;
    dispatchExpiresAt: string | null;
    dispatchSentAt: string | null;
  }>
> {
  const pool = getPgPool();
  const limit = Math.max(1, Math.min(params.limit ?? 25, 200));

  const res = await pool.query(
    `
    SELECT
      o.order_id,
      o.marketplace_id,
      o.purchase_date::text AS purchase_date,
      o.latest_delivery_date::text AS latest_delivery_date,
      o.order_status,
      o.fulfillment_channel,
      d.state AS dispatch_state,
      d.scheduled_at::text AS dispatch_scheduled_at,
      d.expires_at::text AS dispatch_expires_at,
      d.sent_at::text AS dispatch_sent_at
    FROM hermes_orders o
    LEFT JOIN hermes_dispatches d
      ON d.connection_id = o.connection_id
     AND d.order_id = o.order_id
     AND d.type = 'request_review'
    WHERE o.connection_id = $1
    ORDER BY o.purchase_date DESC NULLS LAST, o.imported_at DESC
    LIMIT $2;
    `,
    [params.connectionId, limit]
  );

  return res.rows.map((r: any) => ({
    orderId: r.order_id,
    marketplaceId: r.marketplace_id,
    purchaseDate: r.purchase_date ?? null,
    latestDeliveryDate: r.latest_delivery_date ?? null,
    orderStatus: r.order_status ?? null,
    fulfillmentChannel: r.fulfillment_channel ?? null,
    dispatchState: r.dispatch_state ?? null,
    dispatchScheduledAt: r.dispatch_scheduled_at ?? null,
    dispatchExpiresAt: r.dispatch_expires_at ?? null,
    dispatchSentAt: r.dispatch_sent_at ?? null,
  }));
}

export async function countOrders(params: {
  connectionId: string;
  marketplaceId?: string | null;
  orderStatus?: string | null;
  orderIdQuery?: string | null;
  delivery?: "has" | "missing";
  reviewState?: "not_queued" | "queued" | "sending" | "sent" | "failed" | "skipped";
}): Promise<number> {
  const pool = getPgPool();

  const values: any[] = [params.connectionId];
  const where: string[] = ["o.connection_id = $1"];

  if (params.marketplaceId) {
    values.push(params.marketplaceId);
    where.push(`o.marketplace_id = $${values.length}`);
  }

  if (params.orderStatus) {
    values.push(params.orderStatus);
    where.push(`o.order_status = $${values.length}`);
  }

  if (params.orderIdQuery) {
    values.push(params.orderIdQuery);
    where.push(`o.order_id ILIKE ('%' || $${values.length} || '%')`);
  }

  if (params.delivery === "has") {
    where.push("o.latest_delivery_date IS NOT NULL");
  }
  if (params.delivery === "missing") {
    where.push("o.latest_delivery_date IS NULL");
  }

  if (params.reviewState) {
    if (params.reviewState === "not_queued") {
      where.push("d.state IS NULL");
    } else {
      values.push(params.reviewState);
      where.push(`d.state = $${values.length}`);
    }
  }

  const res = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM hermes_orders o
    LEFT JOIN hermes_dispatches d
      ON d.connection_id = o.connection_id
     AND d.order_id = o.order_id
     AND d.type = 'request_review'
    WHERE ${where.join("\n      AND ")};
    `,
    values
  );

  const raw = res.rows?.[0]?.count;
  if (typeof raw !== "string") {
    throw new Error("Invalid count");
  }
  const count = Number(raw);
  if (!Number.isFinite(count)) {
    throw new Error("Invalid count");
  }
  return count;
}

export type HermesOrdersListCursor = {
  purchaseDate: string | null;
  importedAt: string;
  orderId: string;
};

export async function listOrdersPage(params: {
  connectionId: string;
  limit: number;
  cursor?: HermesOrdersListCursor | null;
  marketplaceId?: string | null;
  orderStatus?: string | null;
  orderIdQuery?: string | null;
  delivery?: "has" | "missing";
  reviewState?: "not_queued" | "queued" | "sending" | "sent" | "failed" | "skipped";
}): Promise<{
  orders: Array<{
    orderId: string;
    marketplaceId: string;
    purchaseDate: string | null;
    latestDeliveryDate: string | null;
    orderStatus: string | null;
    fulfillmentChannel: string | null;
    dispatchId: string | null;
    dispatchState: string | null;
    dispatchScheduledAt: string | null;
    dispatchExpiresAt: string | null;
    dispatchSentAt: string | null;
  }>;
  nextCursor: HermesOrdersListCursor | null;
}> {
  const pool = getPgPool();

  if (!Number.isFinite(params.limit) || params.limit < 1 || params.limit > 500) {
    throw new Error("limit must be between 1 and 500");
  }
  const limit = params.limit;
  const cursor = params.cursor;

  const values: any[] = [params.connectionId];
  const where: string[] = ["o.connection_id = $1"];

  if (params.marketplaceId) {
    values.push(params.marketplaceId);
    where.push(`o.marketplace_id = $${values.length}`);
  }

  if (params.orderStatus) {
    values.push(params.orderStatus);
    where.push(`o.order_status = $${values.length}`);
  }

  if (params.orderIdQuery) {
    values.push(params.orderIdQuery);
    where.push(`o.order_id ILIKE ('%' || $${values.length} || '%')`);
  }

  if (params.delivery === "has") {
    where.push("o.latest_delivery_date IS NOT NULL");
  }
  if (params.delivery === "missing") {
    where.push("o.latest_delivery_date IS NULL");
  }

  if (params.reviewState) {
    if (params.reviewState === "not_queued") {
      where.push("d.state IS NULL");
    } else {
      values.push(params.reviewState);
      where.push(`d.state = $${values.length}`);
    }
  }

  if (cursor) {
    const cursorHasPurchaseDate = cursor.purchaseDate !== null;

    if (cursorHasPurchaseDate) {
      values.push(cursor.purchaseDate);
      const purchaseDateParam = `$${values.length}::timestamptz`;

      values.push(cursor.importedAt);
      const importedAtParam = `$${values.length}::timestamptz`;

      values.push(cursor.orderId);
      const orderIdParam = `$${values.length}`;

      where.push(
        `
        (
          o.purchase_date IS NULL
          OR (
            o.purchase_date IS NOT NULL
            AND (
              o.purchase_date < ${purchaseDateParam}
              OR (o.purchase_date = ${purchaseDateParam} AND o.imported_at < ${importedAtParam})
              OR (o.purchase_date = ${purchaseDateParam} AND o.imported_at = ${importedAtParam} AND o.order_id < ${orderIdParam})
            )
          )
        )
        `.trim()
      );
    } else {
      values.push(cursor.importedAt);
      const importedAtParam = `$${values.length}::timestamptz`;

      values.push(cursor.orderId);
      const orderIdParam = `$${values.length}`;

      where.push(
        `
        (
          o.purchase_date IS NULL
          AND (
            o.imported_at < ${importedAtParam}
            OR (o.imported_at = ${importedAtParam} AND o.order_id < ${orderIdParam})
          )
        )
        `.trim()
      );
    }
  }

  values.push(limit + 1);
  const limitParam = `$${values.length}`;

  const res = await pool.query(
    `
    SELECT
      o.order_id,
      o.marketplace_id,
      o.purchase_date::text AS purchase_date,
      o.latest_delivery_date::text AS latest_delivery_date,
      o.order_status,
      o.fulfillment_channel,
      o.imported_at::text AS imported_at,
      d.id AS dispatch_id,
      d.state AS dispatch_state,
      d.scheduled_at::text AS dispatch_scheduled_at,
      d.expires_at::text AS dispatch_expires_at,
      d.sent_at::text AS dispatch_sent_at
    FROM hermes_orders o
    LEFT JOIN hermes_dispatches d
      ON d.connection_id = o.connection_id
     AND d.order_id = o.order_id
     AND d.type = 'request_review'
    WHERE ${where.join("\n      AND ")}
    ORDER BY (o.purchase_date IS NULL) ASC, o.purchase_date DESC, o.imported_at DESC, o.order_id DESC
    LIMIT ${limitParam};
    `,
    values
  );

  const rows = res.rows as Array<{
    order_id: string;
    marketplace_id: string;
    purchase_date: string | null;
    latest_delivery_date: string | null;
    order_status: string | null;
    fulfillment_channel: string | null;
    imported_at: string;
    dispatch_id: string | null;
    dispatch_state: string | null;
    dispatch_scheduled_at: string | null;
    dispatch_expires_at: string | null;
    dispatch_sent_at: string | null;
  }>;

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const orders = pageRows.map((r) => ({
    orderId: r.order_id,
    marketplaceId: r.marketplace_id,
    purchaseDate: r.purchase_date,
    latestDeliveryDate: r.latest_delivery_date,
    orderStatus: r.order_status,
    fulfillmentChannel: r.fulfillment_channel,
    dispatchId: r.dispatch_id,
    dispatchState: r.dispatch_state,
    dispatchScheduledAt: r.dispatch_scheduled_at,
    dispatchExpiresAt: r.dispatch_expires_at,
    dispatchSentAt: r.dispatch_sent_at,
  }));

  const last = pageRows[pageRows.length - 1];
  const nextCursor = (hasMore && last)
    ? {
        purchaseDate: last.purchase_date,
        importedAt: last.imported_at,
        orderId: last.order_id,
      }
    : null;

  return { orders, nextCursor };
}
