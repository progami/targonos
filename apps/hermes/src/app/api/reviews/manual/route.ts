import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiLogging } from "@/server/api-logging";
import { maybeAutoMigrate } from "@/server/db/migrate";
import { listManualReviews } from "@/server/reviews/query";

export const runtime = "nodejs";

async function handleGet(req: Request) {
  await maybeAutoMigrate();

  const url = new URL(req.url);
  const schema = z.object({
    connectionId: z.string().min(1),
    marketplaceId: z.string().min(1).optional(),
    asin: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  });

  const parsed = schema.safeParse({
    connectionId: url.searchParams.get("connectionId") ?? undefined,
    marketplaceId: url.searchParams.get("marketplaceId") ?? undefined,
    asin: url.searchParams.get("asin") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const rows = await listManualReviews({
    connectionId: parsed.data.connectionId,
    marketplaceId: parsed.data.marketplaceId ?? null,
    asin: parsed.data.asin ?? null,
    limit: parsed.data.limit ?? 200,
  });

  return NextResponse.json({ ok: true, rows });
}

export const GET = withApiLogging("GET /api/reviews/manual", handleGet);
