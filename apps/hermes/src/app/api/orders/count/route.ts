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

  const schema = z.object({
    connectionId: z.string().min(1),
    marketplaceId: z.string().min(1).optional(),
  });

  const parsed = schema.safeParse({
    connectionId: url.searchParams.get("connectionId"),
    marketplaceId: marketplaceIdRaw === null ? undefined : marketplaceIdRaw,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const total = await countOrders({
    connectionId: parsed.data.connectionId,
    marketplaceId: parsed.data.marketplaceId,
  });

  return NextResponse.json({ ok: true, total });
}

export const GET = withApiLogging("GET /api/orders/count", handleGet);

