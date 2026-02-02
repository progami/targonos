/**
 * Hermes worker: Hourly Orders sync (backfill/keep-up)
 *
 * Run:
 *   pnpm worker:orders-sync
 *
 * What it does:
 * - Every N minutes (default 60), for each configured connection:
 *   - Calls Orders API (getOrders) using LastUpdatedAfter (incremental)
 *   - Upserts into hermes_orders
 *   - Optionally enqueues Request-a-Review dispatches (deduped by DB UNIQUE)
 *
 * Safety:
 * - Uses a DB advisory lock so only ONE orders-sync worker runs at a time.
 * - Review requests are idempotent: UNIQUE(connection_id, order_id, type) prevents duplicates.
 */

import { maybeAutoMigrate } from "../db/migrate";
import { getPgPool } from "../db/pool";
import { SpApiClient } from "../sp-api/client";
import { loadSpApiConfigForConnection } from "../sp-api/connection-config";
import { listConnectionTargets } from "../sp-api/connection-list";
import { getOrders } from "../sp-api/orders";
import {
  extractOrdersFromGetOrdersResponse,
  enqueueRequestReviewsForOrders,
  upsertOrders,
  type ScheduleConfig,
} from "../orders/ingest";
import { deleteJobState, getJobState, setJobState } from "./job-state";
import { loadHermesEnv } from "./load-env";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function getBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

function csv(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isoHoursAgo(hours: number): string {
  const d = new Date(Date.now() - hours * 60 * 60 * 1000);
  return d.toISOString();
}

function pickNextToken(body: any): string | null {
  const payload = body?.payload ?? body;
  return payload?.NextToken ?? payload?.nextToken ?? payload?.next_token ?? null;
}

function maxDateIso(a: string, b?: string | null): string {
  const ta = Date.parse(a);
  const tb = b ? Date.parse(b) : NaN;
  if (!Number.isFinite(tb)) return a;
  if (!Number.isFinite(ta)) return b ?? a;
  return tb > ta ? (b as string) : a;
}

function buildScheduleFromEnv(): ScheduleConfig {
  const delayDays = getInt("HERMES_DEFAULT_DELAY_DAYS", 10);
  const windowEnabled = getBool("HERMES_DEFAULT_WINDOW_ENABLED", true);
  const startHour = getInt("HERMES_DEFAULT_SEND_WINDOW_START_HOUR", 9);
  const endHour = getInt("HERMES_DEFAULT_SEND_WINDOW_END_HOUR", 18);
  const spreadEnabled = getBool("HERMES_DEFAULT_SPREAD_ENABLED", true);
  const spreadMaxMinutes = getInt("HERMES_DEFAULT_SPREAD_MAX_MINUTES", 90);

  return {
    delayDays,
    windowEnabled,
    startHour,
    endHour,
    spreadEnabled,
    spreadMaxMinutes,
    timezone: process.env.HERMES_DEFAULT_TIMEZONE || undefined,
  };
}

async function acquireAdvisoryLock(lockKey: number): Promise<{ ok: boolean; release: () => Promise<void> }> {
  const pool = getPgPool();
  const client = await pool.connect();
  const res = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked;", [
    lockKey,
  ]);
  const locked = Boolean(res.rows[0]?.locked);

  return {
    ok: locked,
    release: async () => {
      try {
        await client.query("SELECT pg_advisory_unlock($1);", [lockKey]);
      } finally {
        client.release();
      }
    },
  };
}

async function syncConnection(connectionId: string, marketplaceIds: string[]) {
  const lookbackHours = getInt("HERMES_ORDERS_SYNC_LOOKBACK_HOURS", 48);
  const overlapMinutes = getInt("HERMES_ORDERS_SYNC_OVERLAP_MINUTES", 5);
  const maxPages = getInt("HERMES_ORDERS_SYNC_MAX_PAGES_PER_RUN", 50);
  const maxResultsPerPage = Math.max(1, Math.min(getInt("HERMES_ORDERS_SYNC_MAX_RESULTS_PER_PAGE", 100), 100));

  const enqueue = getBool("HERMES_ORDERS_SYNC_ENQUEUE_REVIEW_REQUESTS", true);
  const schedule = buildScheduleFromEnv();

  const orderStatuses = csv(process.env.HERMES_ORDERS_SYNC_ORDER_STATUSES ?? "Shipped,PartiallyShipped");
  const fulfillmentChannels = csv(process.env.HERMES_ORDERS_SYNC_FULFILLMENT_CHANNELS ?? "");

  const keyLast = "orders_sync.last_updated_after";
  const keyNext = "orders_sync.next_token";

  const lastStored = await getJobState({ connectionId, key: keyLast });
  const nextStored = await getJobState({ connectionId, key: keyNext });

  const lastUpdatedAfter = lastStored ?? isoHoursAgo(lookbackHours);
  let nextToken: string | null = nextStored && nextStored.trim().length > 0 ? nextStored.trim() : null;

  const client = new SpApiClient(loadSpApiConfigForConnection(connectionId));

  let pages = 0;
  let fetched = 0;
  let upserted = 0;
  let enqueueStats = { enqueued: 0, skippedExpired: 0, alreadyExists: 0 };
  let maxLastUpdateIso = lastUpdatedAfter;

  while (true) {
    pages += 1;
    if (pages > maxPages) {
      // Save pagination state and resume next run.
      if (nextToken) {
        await setJobState({ connectionId, key: keyNext, value: nextToken });
      }
      await setJobState({ connectionId, key: keyLast, value: lastUpdatedAfter });
      console.log(
        `[orders-sync] ${connectionId}: paused after ${maxPages} pages (fetched=${fetched}) nextToken=${nextToken ? "yes" : "no"}`
      );
      break;
    }

    const resp = await getOrders({
      client,
      marketplaceIds,
      lastUpdatedAfter: nextToken ? undefined : lastUpdatedAfter,
      nextToken: nextToken ?? undefined,
      orderStatuses: orderStatuses.length > 0 ? orderStatuses : undefined,
      fulfillmentChannels: fulfillmentChannels.length > 0 ? fulfillmentChannels : undefined,
      maxResultsPerPage,
    });

    if (resp.status !== 200) {
      console.warn(
        `[orders-sync] ${connectionId}: getOrders failed status=${resp.status} nextToken=${nextToken ? "yes" : "no"}`
      );
      // If a stored nextToken becomes invalid, clear it so the next run can restart incrementally.
      if (nextToken) {
        await deleteJobState({ connectionId, key: keyNext });
      }
      break;
    }

    const orders = extractOrdersFromGetOrdersResponse(resp.body, marketplaceIds[0] ?? "UNKNOWN");
    fetched += orders.length;

    // Track max lastUpdateDate for incremental cursoring
    for (const o of orders) {
      if (o.lastUpdateDate) maxLastUpdateIso = maxDateIso(maxLastUpdateIso, o.lastUpdateDate);
      else if (o.purchaseDate) maxLastUpdateIso = maxDateIso(maxLastUpdateIso, o.purchaseDate);
    }

    const up = await upsertOrders({ connectionId, orders });
    upserted += up.upserted;

    if (enqueue && orders.length > 0) {
      const st = await enqueueRequestReviewsForOrders({
        connectionId,
        orders,
        schedule,
      });
      enqueueStats.enqueued += st.enqueued;
      enqueueStats.skippedExpired += st.skippedExpired;
      enqueueStats.alreadyExists += st.alreadyExists;
    }

    nextToken = pickNextToken(resp.body);

    if (!nextToken) {
      // Cursor bump with overlap buffer to reduce "edge" misses
      const bump = new Date(Date.parse(maxLastUpdateIso) - overlapMinutes * 60_000);
      const bumpIso = Number.isFinite(bump.getTime()) ? bump.toISOString() : new Date().toISOString();

      await setJobState({ connectionId, key: keyLast, value: bumpIso });
      await deleteJobState({ connectionId, key: keyNext });

      console.log(
        `[orders-sync] ${connectionId}: done pages=${pages} fetched=${fetched} upserted=${upserted} enq=${enqueueStats.enqueued} exists=${enqueueStats.alreadyExists} expired=${enqueueStats.skippedExpired}`
      );
      break;
    }
  }
}

async function syncAllConnectionsOnce(): Promise<void> {
  await maybeAutoMigrate();

  const targets = listConnectionTargets();
  if (targets.length === 0) {
    console.log(
      "[orders-sync] No connections configured. Set HERMES_CONNECTIONS_JSON with marketplaceIds, or set HERMES_DEFAULT_MARKETPLACE_IDS."
    );
    return;
  }

  const lockKey = getInt("HERMES_ORDERS_SYNC_LOCK_KEY", 707001);
  const lock = await acquireAdvisoryLock(lockKey);
  if (!lock.ok) {
    console.log("[orders-sync] Another orders-sync worker is already running (lock not acquired).");
    await lock.release();
    return;
  }

  try {
    for (const t of targets) {
      try {
        await syncConnection(t.connectionId, t.marketplaceIds);
      } catch (e: any) {
        console.warn(`[orders-sync] ${t.connectionId}: error ${e?.message ?? e}`);
      }
    }
  } finally {
    await lock.release();
  }
}

async function main() {
  loadHermesEnv();
  const once = getBool("HERMES_ORDERS_SYNC_ONCE", false);
  const intervalMinutes = getInt("HERMES_ORDERS_SYNC_INTERVAL_MINUTES", 60);

  if (once) {
    await syncAllConnectionsOnce();
    return;
  }

  console.log(`[orders-sync] Starting sync loop (every ${intervalMinutes} minutes)`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const started = Date.now();
    await syncAllConnectionsOnce();
    const elapsed = Date.now() - started;

    const sleepMs = Math.max(5_000, intervalMinutes * 60_000 - elapsed);
    await sleep(sleepMs);
  }
}

main().catch((e) => {
  console.error("[orders-sync] Fatal:", e);
  process.exitCode = 1;
});
