import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiLogging } from "@/server/api-logging";
import { maybeAutoMigrate } from "@/server/db/migrate";
import { getPgPool } from "@/server/db/pool";

export const runtime = "nodejs";

/**
 * POST /api/dispatches/cancel
 *
 * Cancels (skips) a dispatch so the worker will not process it anymore.
 * Notes:
 * - This is only meant for queued/failed/skipped dispatches (never "sending" or "sent").
 * - We do NOT delete rows, so audit history is preserved.
 */
async function handlePost(req: Request) {
  await maybeAutoMigrate();

  const schema = z.object({
    connectionId: z.string().min(1),
    dispatchId: z.string().min(1),
  });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const pool = getPgPool();
  const res = await pool.query<{
    id: string;
    state: string;
    scheduled_at: string;
    expires_at: string | null;
    sent_at: string | null;
    last_error: string | null;
  }>(
    `
    UPDATE hermes_dispatches
       SET state = 'skipped',
           last_error = 'canceled_by_user',
           updated_at = NOW()
     WHERE id = $1
       AND connection_id = $2
       AND type = 'request_review'
       AND state IN ('queued','failed','skipped')
     RETURNING id, state, scheduled_at::text AS scheduled_at, expires_at::text AS expires_at, sent_at::text AS sent_at, last_error;
    `,
    [parsed.data.dispatchId, parsed.data.connectionId]
  );

  const row = res.rows[0];
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "Dispatch is not cancelable (must be queued/failed/skipped and not sent/sending)." },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    dispatch: {
      id: row.id,
      state: row.state,
      scheduledAt: row.scheduled_at,
      expiresAt: row.expires_at,
      sentAt: row.sent_at,
      lastError: row.last_error,
    },
  });
}

export const POST = withApiLogging("POST /api/dispatches/cancel", handlePost);

