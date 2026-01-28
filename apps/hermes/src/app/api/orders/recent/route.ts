import { NextResponse } from "next/server";
import { z } from "zod";

import { maybeAutoMigrate } from "@/server/db/migrate";
import { listRecentOrders } from "@/server/orders/ingest";

export const runtime = "nodejs";

export async function GET(req: Request) {
  await maybeAutoMigrate();

  const url = new URL(req.url);
  const schema = z.object({
    connectionId: z.string().min(1),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  });

  const parsed = schema.safeParse({
    connectionId: url.searchParams.get("connectionId"),
    limit: url.searchParams.get("limit"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const orders = await listRecentOrders({
      connectionId: parsed.data.connectionId,
      limit: parsed.data.limit,
    });
    return NextResponse.json({ ok: true, orders });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load orders" },
      { status: 500 }
    );
  }
}
