import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiLogging } from "@/server/api-logging";
import { maybeAutoMigrate } from "@/server/db/migrate";
import { getPgPool } from "@/server/db/pool";

export const runtime = "nodejs";

function encodeCursor(cursor: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(raw: string): { createdAt: string; id: string } {
  const json = Buffer.from(raw, "base64url").toString("utf8");
  const parsed = JSON.parse(json);
  const schema = z.object({
    createdAt: z.string().min(1),
    id: z.string().min(1),
  });
  return schema.parse(parsed);
}

async function handleGet(req: Request) {
  await maybeAutoMigrate();

  const url = new URL(req.url);

  const schema = z.object({
    connectionId: z.string().min(1),
    type: z.enum(["request_review", "buyer_message"]).optional(),
    status: z.enum(["sent", "ineligible", "throttled", "failed"]).optional(),
    orderIdQuery: z.string().min(1).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  });

  const parsed = schema.safeParse({
    connectionId: url.searchParams.get("connectionId") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    orderIdQuery: url.searchParams.get("orderIdQuery") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const pool = getPgPool();
  const limit = parsed.data.limit ?? 200;
  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;

  const values: any[] = [parsed.data.connectionId];
  const where: string[] = ["d.connection_id = $1"];

  if (parsed.data.type) {
    values.push(parsed.data.type);
    where.push(`d.type = $${values.length}`);
  }

  if (parsed.data.status) {
    values.push(parsed.data.status);
    where.push(`a.status = $${values.length}`);
  }

  if (parsed.data.orderIdQuery) {
    values.push(parsed.data.orderIdQuery);
    where.push(`d.order_id ILIKE ('%' || $${values.length} || '%')`);
  }

  if (cursor) {
    values.push(cursor.createdAt);
    const createdAtParam = `$${values.length}::timestamptz`;

    values.push(cursor.id);
    const idParam = `$${values.length}`;

    where.push(
      `
      (
        a.created_at < ${createdAtParam}
        OR (a.created_at = ${createdAtParam} AND a.id < ${idParam})
      )
      `.trim()
    );
  }

  values.push(limit + 1);
  const limitParam = `$${values.length}`;

  const res = await pool.query(
    `
    SELECT
      a.id,
      a.dispatch_id,
      a.attempt_no,
      a.status,
      a.http_status,
      a.spapi_request_id,
      a.error_code,
      a.error_message,
      a.created_at::text AS created_at,
      d.order_id,
      d.marketplace_id,
      d.type,
      d.message_kind
    FROM hermes_dispatch_attempts a
    JOIN hermes_dispatches d ON d.id = a.dispatch_id
    WHERE ${where.join("\n      AND ")}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ${limitParam};
    `,
    values
  );

  const rows = res.rows as Array<{
    id: string;
    dispatch_id: string;
    attempt_no: number;
    status: string;
    http_status: number | null;
    spapi_request_id: string | null;
    error_code: string | null;
    error_message: string | null;
    created_at: string;
    order_id: string;
    marketplace_id: string;
    type: string;
    message_kind: string | null;
  }>;

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const last = pageRows[pageRows.length - 1];
  const nextCursor = (hasMore && last)
    ? encodeCursor({ createdAt: last.created_at, id: last.id })
    : null;

  return NextResponse.json({
    ok: true,
    attempts: pageRows.map((r) => ({
      id: r.id,
      dispatchId: r.dispatch_id,
      attemptNo: r.attempt_no,
      status: r.status,
      httpStatus: r.http_status,
      spapiRequestId: r.spapi_request_id,
      errorCode: r.error_code,
      errorMessage: r.error_message,
      createdAt: r.created_at,
      orderId: r.order_id,
      marketplaceId: r.marketplace_id,
      type: r.type,
      messageKind: r.message_kind,
    })),
    nextCursor,
  });
}

export const GET = withApiLogging("GET /api/logs/attempts", handleGet);

