import { NextResponse } from "next/server";
import { z } from "zod";

import { maybeAutoMigrate } from "@/server/db/migrate";
import { getPgPool } from "@/server/db/pool";
import { withApiLogging } from "@/server/api-logging";

export const runtime = "nodejs";

/**
 * GET /api/messaging/recent?connectionId=...&limit=20
 */
async function handleGet(req: Request) {
  await maybeAutoMigrate();

  const url = new URL(req.url);
  const schema = z.object({
    connectionId: z.string().optional(),
    limit: z.string().optional(),
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

  const limit = Math.max(1, Math.min(100, Number.parseInt(parsed.data.limit ?? "20", 10) || 20));

  try {
    const pool = getPgPool();

    const res = await pool.query(
      `
      SELECT id, connection_id, order_id, marketplace_id, type, message_kind, state,
             scheduled_at::text, expires_at::text, sent_at::text, last_error, updated_at::text
        FROM hermes_dispatches
       WHERE type = 'buyer_message'
         AND ($1::text IS NULL OR connection_id = $1)
       ORDER BY updated_at DESC
       LIMIT $2;
      `,
      [parsed.data.connectionId ?? null, limit]
    );

    return NextResponse.json({ ok: true, dispatches: res.rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load messaging logs" },
      { status: 500 }
    );
  }
}

export const GET = withApiLogging("GET /api/messaging/recent", handleGet);
