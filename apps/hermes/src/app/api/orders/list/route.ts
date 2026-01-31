import { NextResponse } from "next/server";
import { z } from "zod";

import { maybeAutoMigrate } from "@/server/db/migrate";
import { listOrdersPage, type HermesOrdersListCursor } from "@/server/orders/ingest";
import { withApiLogging } from "@/server/api-logging";

export const runtime = "nodejs";

function encodeCursor(cursor: HermesOrdersListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(raw: string): HermesOrdersListCursor {
  const json = Buffer.from(raw, "base64url").toString("utf8");
  const parsed = JSON.parse(json);

  const schema = z.object({
    purchaseDate: z.string().nullable(),
    importedAt: z.string().min(1),
    orderId: z.string().min(1),
  });
  return schema.parse(parsed);
}

async function handleGet(req: Request) {
  await maybeAutoMigrate();

  const url = new URL(req.url);
  const marketplaceIdRaw = url.searchParams.get("marketplaceId");
  const orderStatusRaw = url.searchParams.get("orderStatus");
  const deliveryRaw = url.searchParams.get("delivery");
  const reviewStateRaw = url.searchParams.get("reviewState");
  const cursorRaw = url.searchParams.get("cursor");
  const limitRaw = url.searchParams.get("limit");

  const schema = z.object({
    connectionId: z.string().min(1),
    marketplaceId: z.string().min(1).optional(),
    orderStatus: z.string().min(1).optional(),
    delivery: z.enum(["any", "has", "missing"]).optional(),
    reviewState: z.enum(["any", "not_queued", "queued", "sending", "sent", "failed", "skipped"]).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500),
  });

  const parsed = schema.safeParse({
    connectionId: url.searchParams.get("connectionId"),
    marketplaceId: marketplaceIdRaw === null ? undefined : marketplaceIdRaw,
    orderStatus: orderStatusRaw === null ? undefined : orderStatusRaw,
    delivery: deliveryRaw === null ? undefined : deliveryRaw,
    reviewState: reviewStateRaw === null ? undefined : reviewStateRaw,
    cursor: cursorRaw === null ? undefined : cursorRaw,
    limit: limitRaw === null ? undefined : limitRaw,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  const delivery = parsed.data.delivery === "any" ? undefined : parsed.data.delivery;
  const reviewState = parsed.data.reviewState === "any" ? undefined : parsed.data.reviewState;

  const { orders, nextCursor } = await listOrdersPage({
    connectionId: parsed.data.connectionId,
    marketplaceId: parsed.data.marketplaceId,
    orderStatus: parsed.data.orderStatus,
    delivery,
    reviewState,
    cursor,
    limit: parsed.data.limit,
  });

  return NextResponse.json({
    ok: true,
    orders,
    nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
  });
}

export const GET = withApiLogging("GET /api/orders/list", handleGet);
