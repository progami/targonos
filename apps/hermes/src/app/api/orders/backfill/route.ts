import { NextResponse } from "next/server";
import { z } from "zod";

import { maybeAutoMigrate } from "@/server/db/migrate";
import { SpApiClient } from "@/server/sp-api/client";
import { loadSpApiConfigForConnection } from "@/server/sp-api/connection-config";
import { getOrders } from "@/server/sp-api/orders";
import {
  extractOrdersFromGetOrdersResponse,
  enqueueRequestReviewsForOrders,
  upsertOrders,
  type ScheduleConfig,
} from "@/server/orders/ingest";
import { withApiLogging } from "@/server/api-logging";

export const runtime = "nodejs";

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function pickNextToken(body: any): string | null {
  const payload = body?.payload ?? body;
  return (
    payload?.NextToken ??
    payload?.nextToken ??
    payload?.next_token ??
    null
  );
}

/**
 * POST /api/orders/backfill
 *
 * Fetches a single page from Orders API (getOrders) and upserts into hermes_orders.
 * Optionally enqueues request-a-review dispatches for each ingested order.
 */
async function handlePost(req: Request) {
  await maybeAutoMigrate();

  const schema = z.object({
    connectionId: z.string().min(1),
    marketplaceId: z.string().min(1),

    // Pagination
    nextToken: z.string().min(1).optional(),

    // Initial window (used only when nextToken is not present)
    createdAfter: z.string().min(1).optional(),
    createdBefore: z.string().min(1).optional(),
    orderStatuses: z.array(z.string().min(1)).optional(),
    fulfillmentChannels: z.array(z.string().min(1)).optional(),
    maxResultsPerPage: z.number().int().min(1).max(100).optional(),

    enqueueReviewRequests: z.boolean().optional().default(false),

    // Scheduling knobs (campaign defaults)
    schedule: z
      .object({
        delayDays: z.number().int().min(5).max(30).default(10),
        windowEnabled: z.boolean().default(true),
        startHour: z.number().int().min(0).max(23).default(9),
        endHour: z.number().int().min(0).max(23).default(18),
        spreadEnabled: z.boolean().default(true),
        spreadMaxMinutes: z.number().int().min(0).max(12 * 60).default(90),
        timezone: z.string().optional(),
      })
      .optional(),
  });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const {
    connectionId,
    marketplaceId,
    nextToken,
    createdAfter,
    createdBefore,
    orderStatuses,
    fulfillmentChannels,
    maxResultsPerPage,
    enqueueReviewRequests,
  } = parsed.data;

  // Policy-safe defaults: by default backfill only a recent window.
  // (Orders API may restrict how far back you can query; also reduces load.)
  const createdAfterFinal = createdAfter ?? isoDaysAgo(60);

  const schedule: ScheduleConfig = {
    delayDays: parsed.data.schedule?.delayDays ?? 10,
    windowEnabled: parsed.data.schedule?.windowEnabled ?? true,
    startHour: parsed.data.schedule?.startHour ?? 9,
    endHour: parsed.data.schedule?.endHour ?? 18,
    spreadEnabled: parsed.data.schedule?.spreadEnabled ?? true,
    spreadMaxMinutes: parsed.data.schedule?.spreadMaxMinutes ?? 90,
    timezone: parsed.data.schedule?.timezone,
  };

  try {
    const client = new SpApiClient(loadSpApiConfigForConnection(connectionId));

    const sp = await getOrders({
      client,
      marketplaceIds: [marketplaceId],
      createdAfter: createdAfterFinal,
      createdBefore,
      nextToken,
      orderStatuses,
      fulfillmentChannels,
      maxResultsPerPage,
      // Avoid gateway timeouts by never waiting too long for a limiter token.
      maxLimiterWaitMs: 25_000,
    });

    if (
      sp.status === 429 &&
      sp.body &&
      typeof sp.body === "object" &&
      "error" in sp.body &&
      (sp.body as any).error === "rate_limited"
    ) {
      const retryAfterMs = (sp.body as any).retryAfterMs;
      return NextResponse.json(
        {
          ok: false,
          error: "Rate limited",
          retryAfterMs: typeof retryAfterMs === "number" ? retryAfterMs : null,
        },
        { status: 429 }
      );
    }

    if (sp.status !== 200) {
      return NextResponse.json(
        {
          ok: false,
          error: "SP-API getOrders failed",
          status: sp.status,
          body: sp.body,
        },
        { status: 502 }
      );
    }

    const orders = extractOrdersFromGetOrdersResponse(sp.body, marketplaceId);
    const { upserted } = await upsertOrders({ connectionId, orders });

    let enqueue = { enqueued: 0, skippedExpired: 0, alreadyExists: 0 };
    if (enqueueReviewRequests && orders.length > 0) {
      enqueue = await enqueueRequestReviewsForOrders({
        connectionId,
        orders,
        schedule,
      });
    }

    return NextResponse.json({
      ok: true,
      imported: upserted,
      nextToken: pickNextToken(sp.body),
      sampleOrderIds: orders.slice(0, 10).map((o) => o.orderId),
      enqueue,
      rateLimit: sp.headers?.["x-amzn-ratelimit-limit"] ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Backfill failed",
        hint: "Verify SPAPI_* env vars and DATABASE_URL.",
      },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging("POST /api/orders/backfill", handlePost);
