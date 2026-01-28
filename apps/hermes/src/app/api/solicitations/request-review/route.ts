import { NextResponse } from "next/server";
import { z } from "zod";
import { maybeAutoMigrate } from "@/server/db/migrate";
import { queueRequestReview } from "@/server/dispatch/ledger";

export const runtime = "nodejs";

/**
 * POST /api/solicitations/request-review
 *
 * Body:
 * {
 *   "connectionId": "conn_01",
 *   "orderId": "112-...",
 *   "marketplaceId": "ATVPDKIKX0DER"
 * }
 *
 * Safety guarantees (implemented here):
 * - Hard idempotency: never create more than one request_review dispatch per (connectionId, orderId)
 *   (enforced by DB UNIQUE constraint).
 * - API is idempotent: repeated calls return "already_sent" / "already_queued".
 *
 * In production, your worker should:
 * - claim queued dispatches (queued -> sending)
 * - call GetSolicitationActionsForOrder before sending
 * - call CreateProductReviewAndSellerFeedbackSolicitation only if action exists
 * - mark sent + append audit attempts
 */
export async function POST(req: Request) {
  await maybeAutoMigrate();

  const schema = z.object({
    connectionId: z.string().min(1),
    orderId: z.string().min(1),
    marketplaceId: z.string().min(1),
  });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const res = await queueRequestReview({
      connectionId: parsed.data.connectionId,
      orderId: parsed.data.orderId,
      marketplaceId: parsed.data.marketplaceId,
    });

    // Note: we intentionally do NOT send here; sending belongs to the worker.
    return NextResponse.json({ ok: true, ...res });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Failed to queue request",
        hint: "Set DATABASE_URL and run db/schema.sql (or set HERMES_AUTO_MIGRATE=1 in dev).",
      },
      { status: 500 }
    );
  }
}
