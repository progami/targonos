import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiLogging } from "@/server/api-logging";
import { maybeAutoMigrate } from "@/server/db/migrate";
import { getPgPool } from "@/server/db/pool";

export const runtime = "nodejs";

async function handleGet(req: Request) {
  await maybeAutoMigrate();

  const url = new URL(req.url);

  const schema = z.object({
    connectionId: z.string().min(1),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  });

  const parsed = schema.safeParse({
    connectionId: url.searchParams.get("connectionId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const pool = getPgPool();
  const limit = parsed.data.limit ?? 10;

  const res = await pool.query<{
    order_id: string;
    marketplace_id: string;
    sent_at: string;
  }>(
    `
    SELECT order_id, marketplace_id, sent_at::text AS sent_at
      FROM hermes_dispatches
     WHERE connection_id = $1
       AND type = 'request_review'
       AND state = 'sent'
       AND sent_at IS NOT NULL
     ORDER BY sent_at DESC
     LIMIT $2;
    `,
    [parsed.data.connectionId, limit]
  );

  return NextResponse.json({
    ok: true,
    samples: res.rows.map((r) => ({ orderId: r.order_id, marketplaceId: r.marketplace_id, sentAt: r.sent_at })),
  });
}

export const GET = withApiLogging("GET /api/reviews/samples", handleGet);

