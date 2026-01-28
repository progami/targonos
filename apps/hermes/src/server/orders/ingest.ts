import { getPgPool } from "../db/pool";
import { queueRequestReview } from "../dispatch/ledger";

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
  policyAnchor: "delivery" | "purchase" | "unknown";
} {
  const delayDays = clamp(cfg.delayDays, 5, 30);

  const latestDelivery = parseDate(order.latestDeliveryDate);
  const earliestDelivery = parseDate(order.earliestDeliveryDate);
  const purchase = parseDate(order.purchaseDate);

  const deliveryAnchor = latestDelivery ?? earliestDelivery;

  // Scheduled at: (delivery + delay) when we have a delivery estimate; otherwise now.
  const base = deliveryAnchor ?? new Date();
  const scheduledBase = deliveryAnchor ? addDays(base, delayDays) : base;
  let scheduledAt = applySendWindow(scheduledBase, cfg);
  scheduledAt = applySpread(scheduledAt, cfg);

  // Expiry: Amazon policy window is 30 days after delivery. If we only have purchase date,
  // use +60d as a conservative approximation (covers longer shipping scenarios).
  let expiresAt: Date | null = null;
  if (deliveryAnchor) {
    expiresAt = endOfDay(addDays(deliveryAnchor, 30));
  } else if (purchase) {
    expiresAt = endOfDay(addDays(purchase, 60));
  }

  return {
    scheduledAt,
    expiresAt,
    policyAnchor: deliveryAnchor ? "delivery" : purchase ? "purchase" : "unknown",
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
  let enqueued = 0;
  let skippedExpired = 0;
  let alreadyExists = 0;

  for (const o of params.orders) {
    const { scheduledAt, expiresAt, policyAnchor } = computeScheduleForOrder(o, params.schedule);

    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      skippedExpired += 1;
      continue;
    }

    const metadata = {
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
    };

    const res = await queueRequestReview({
      connectionId: params.connectionId,
      orderId: o.orderId,
      marketplaceId: o.marketplaceId,
      scheduledAt,
      expiresAt,
      campaignId: params.campaignId ?? null,
      experimentId: params.experimentId ?? null,
      variantId: params.variantId ?? null,
      metadata,
    });

    if (res.kind === "queued") enqueued += 1;
    else alreadyExists += 1;
  }

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
