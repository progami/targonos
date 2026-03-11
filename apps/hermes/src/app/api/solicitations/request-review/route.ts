import { NextResponse } from "next/server";
import { z } from "zod";
import { maybeAutoMigrate } from "@/server/db/migrate";
import { getPgPool } from "@/server/db/pool";
import { queueRequestReview } from "@/server/dispatch/ledger";
import { withApiLogging } from "@/server/api-logging";
import { isHermesDryRun } from "@/server/env/flags";
import { isOrderRefundedOrReturned } from "@/server/orders/review-eligibility";
import { isReviewRequestMarketplaceEnabled } from "@/lib/amazon/policy";

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
async function handlePost(req: Request) {
  if (isHermesDryRun()) {
    return NextResponse.json(
      { ok: false, error: "Hermes is in dry-run mode. Dispatch queueing is disabled." },
      { status: 403 }
    );
  }

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
    if (!isReviewRequestMarketplaceEnabled(parsed.data.marketplaceId)) {
      return NextResponse.json(
        { ok: false, error: "Review requests are disabled for US marketplace orders." },
        { status: 409 }
      );
    }

    const pool = getPgPool();
    const orderRes = await pool.query<{ order_status: string | null; raw: unknown }>(
      `
      SELECT order_status, raw
        FROM hermes_orders
       WHERE connection_id = $1
         AND order_id = $2
       LIMIT 1;
      `,
      [parsed.data.connectionId, parsed.data.orderId]
    );
    const orderRow = orderRes.rows[0];
    if (
      orderRow &&
      isOrderRefundedOrReturned({
        orderStatus: orderRow.order_status,
        raw: orderRow.raw,
      })
    ) {
      return NextResponse.json(
        { ok: false, error: "Review requests are blocked for refunded or returned orders." },
        { status: 409 }
      );
    }

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

export const POST = withApiLogging("POST /api/solicitations/request-review", handlePost);
