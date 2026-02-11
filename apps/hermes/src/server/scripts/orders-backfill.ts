/**
 * One-off Orders API backfill (for initial ingestion).
 *
 * Example:
 *   pnpm -C apps/hermes orders:backfill -- --days 45 --schema main_hermes
 */

import { maybeAutoMigrate } from "../db/migrate";
import { SpApiClient } from "../sp-api/client";
import { loadSpApiConfigForConnection } from "../sp-api/connection-config";
import { listConnectionTargets } from "../sp-api/connection-list";
import { getOrders } from "../sp-api/orders";
import {
  extractOrdersFromGetOrdersResponse,
  upsertOrders,
  enqueueRequestReviewsForOrders,
  type ScheduleConfig,
} from "../orders/ingest";
import { loadHermesEnv } from "../jobs/load-env";

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

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function pickNextToken(body: any): string | null {
  const payload = body?.payload ?? body;
  return payload?.NextToken ?? payload?.nextToken ?? payload?.next_token ?? null;
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
    timezone: process.env.HERMES_DEFAULT_TIMEZONE ?? undefined,
  };
}

type CliOpts = {
  days: number;
  schema: string | null;
  maxResultsPerPage: number;
  enqueueReviewRequests: boolean;
};

function parseArgs(argv: string[]): CliOpts {
  const out: CliOpts = {
    days: 45,
    schema: null,
    maxResultsPerPage: 100,
    enqueueReviewRequests: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--help" || a === "-h") {
      // eslint-disable-next-line no-console
      console.log(
        [
          "Hermes Orders backfill",
          "",
          "Usage:",
          "  pnpm -C apps/hermes orders:backfill -- [options]",
          "",
          "Options:",
          "  --days <n>            Backfill window (default 45)",
          "  --schema <name>       Override DB schema via HERMES_DB_SCHEMA",
          "  --enqueue             Enqueue request_review dispatches for imported orders",
          "  --maxResults <n>      Orders API MaxResultsPerPage (default 100)",
        ].join("\n")
      );
      process.exit(0);
    }

    if (a === "--days") {
      const v = argv[i + 1];
      if (!v) throw new Error("--days requires a value");
      const n = Number.parseInt(v, 10);
      if (!Number.isFinite(n) || n <= 0) throw new Error("--days must be a positive integer");
      out.days = n;
      i += 1;
      continue;
    }

    if (a === "--schema") {
      const v = argv[i + 1];
      if (!v) throw new Error("--schema requires a value");
      out.schema = v;
      i += 1;
      continue;
    }

    if (a === "--enqueue") {
      out.enqueueReviewRequests = true;
      continue;
    }

    if (a === "--maxResults") {
      const v = argv[i + 1];
      if (!v) throw new Error("--maxResults requires a value");
      const n = Number.parseInt(v, 10);
      if (!Number.isFinite(n) || n < 1 || n > 100) throw new Error("--maxResults must be 1..100");
      out.maxResultsPerPage = n;
      i += 1;
      continue;
    }

    throw new Error(`Unknown arg: ${a}`);
  }

  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  loadHermesEnv();
  if (opts.schema) process.env.HERMES_DB_SCHEMA = opts.schema;

  await maybeAutoMigrate();

  const targets = listConnectionTargets();
  if (targets.length === 0) {
    throw new Error(
      "No Hermes connections configured. Set HERMES_CONNECTIONS_JSON (or HERMES_DEFAULT_MARKETPLACE_IDS)."
    );
  }

  const schedule = buildScheduleFromEnv();
  const createdAfter = isoDaysAgo(opts.days);
  const createdBefore = isoMinutesAgo(5);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        schema: process.env.HERMES_DB_SCHEMA ?? null,
        days: opts.days,
        createdAfter,
        createdBefore,
        maxResultsPerPage: opts.maxResultsPerPage,
        enqueueReviewRequests: opts.enqueueReviewRequests,
        schedule: opts.enqueueReviewRequests ? schedule : null,
        targets: targets.map((t) => ({ connectionId: t.connectionId, marketplaceIds: t.marketplaceIds })),
      },
      null,
      2
    )
  );

  for (const t of targets) {
    const client = new SpApiClient(loadSpApiConfigForConnection(t.connectionId));

    for (const marketplaceId of t.marketplaceIds) {
      let page = 0;
      let nextToken: string | null = null;
      let imported = 0;
      let enqueued = 0;
      let alreadyExists = 0;
      let skippedExpired = 0;

      // eslint-disable-next-line no-console
      console.log(`[orders-backfill] ${t.connectionId} ${marketplaceId}: starting`);

      // eslint-disable-next-line no-constant-condition
      while (true) {
        page += 1;

        let attempt = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          attempt += 1;
          const resp = await getOrders({
            client,
            marketplaceIds: [marketplaceId],
            createdAfter: nextToken ? undefined : createdAfter,
            createdBefore: nextToken ? undefined : createdBefore,
            nextToken: nextToken ?? undefined,
            maxResultsPerPage: opts.maxResultsPerPage,
          });

          if (resp.status === 200) {
            const orders = extractOrdersFromGetOrdersResponse(resp.body, marketplaceId);
            const up = await upsertOrders({ connectionId: t.connectionId, orders });
            imported += up.upserted;

            if (opts.enqueueReviewRequests && orders.length > 0) {
              const st = await enqueueRequestReviewsForOrders({
                connectionId: t.connectionId,
                orders,
                schedule,
              });
              enqueued += st.enqueued;
              alreadyExists += st.alreadyExists;
              skippedExpired += st.skippedExpired;
            }

            nextToken = pickNextToken(resp.body);

            // eslint-disable-next-line no-console
            console.log(
              `[orders-backfill] ${t.connectionId} ${marketplaceId}: page=${page} imported=${imported}` +
                (opts.enqueueReviewRequests ? ` enq=${enqueued} exists=${alreadyExists} expired=${skippedExpired}` : "") +
                ` nextToken=${nextToken ? "yes" : "no"}`
            );

            break;
          }

          // Minimal retry for throttles/transient gateway errors.
          if (resp.status === 429 || resp.status >= 500) {
            const backoff = Math.min(60_000, 1000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
            // eslint-disable-next-line no-console
            console.log(
              `[orders-backfill] ${t.connectionId} ${marketplaceId}: status=${resp.status} retrying in ${Math.ceil(backoff / 1000)}s (attempt ${attempt})`
            );
            await sleep(backoff);
            continue;
          }

          throw new Error(
            `[orders-backfill] ${t.connectionId} ${marketplaceId}: getOrders failed status=${resp.status}`
          );
        }

        if (!nextToken) break;
      }

      // eslint-disable-next-line no-console
      console.log(`[orders-backfill] ${t.connectionId} ${marketplaceId}: done pages=${page} imported=${imported}`);
    }
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[orders-backfill] Fatal:", e);
  process.exitCode = 1;
});
