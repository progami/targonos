import { NextResponse } from "next/server";
import { z } from "zod";

import { maybeAutoMigrate } from "@/server/db/migrate";
import { countOrders } from "@/server/orders/ingest";
import { withApiLogging } from "@/server/api-logging";

export const runtime = "nodejs";

async function handleGet(req: Request) {
  await maybeAutoMigrate();

  const url = new URL(req.url);
  const marketplaceIdRaw = url.searchParams.get("marketplaceId");
  const orderStatusRaw = url.searchParams.get("orderStatus");
  const orderIdQueryRaw = url.searchParams.get("orderIdQuery");
  const deliveryRaw = url.searchParams.get("delivery");
  const reviewStateRaw = url.searchParams.get("reviewState");

  const schema = z.object({
    connectionId: z.string().min(1),
    marketplaceId: z.string().min(1).optional(),
    orderStatus: z.string().min(1).optional(),
    orderIdQuery: z.string().min(1).optional(),
    delivery: z.enum(["any", "has", "missing"]).optional(),
    reviewState: z.enum(["any", "not_queued", "queued", "sending", "sent", "failed", "skipped"]).optional(),
  });

  const parsed = schema.safeParse({
    connectionId: url.searchParams.get("connectionId"),
    marketplaceId: marketplaceIdRaw === null ? undefined : marketplaceIdRaw,
    orderStatus: orderStatusRaw === null ? undefined : orderStatusRaw,
    orderIdQuery: orderIdQueryRaw === null ? undefined : orderIdQueryRaw,
    delivery: deliveryRaw === null ? undefined : deliveryRaw,
    reviewState: reviewStateRaw === null ? undefined : reviewStateRaw,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const delivery = parsed.data.delivery === "any" ? undefined : parsed.data.delivery;
  const reviewState = parsed.data.reviewState === "any" ? undefined : parsed.data.reviewState;

  const total = await countOrders({
    connectionId: parsed.data.connectionId,
    marketplaceId: parsed.data.marketplaceId,
    orderStatus: parsed.data.orderStatus,
    orderIdQuery: parsed.data.orderIdQuery,
    delivery,
    reviewState,
  });

  return NextResponse.json({ ok: true, total });
}

export const GET = withApiLogging("GET /api/orders/count", handleGet);
