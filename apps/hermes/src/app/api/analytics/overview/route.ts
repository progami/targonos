import { NextResponse } from "next/server";
import { z } from "zod";

import { maybeAutoMigrate } from "@/server/db/migrate";
import { getAnalyticsOverview } from "@/server/analytics/overview";
import { withApiLogging } from "@/server/api-logging";

export const runtime = "nodejs";

async function handleGet(req: Request) {
  await maybeAutoMigrate();

  const url = new URL(req.url);

  const schema = z.object({
    connectionId: z.string().min(1).optional(),
    rangeDays: z.coerce.number().int().min(1).max(365).optional(),
  });

  const parsed = schema.safeParse({
    connectionId: url.searchParams.get("connectionId") ?? undefined,
    rangeDays: url.searchParams.get("rangeDays") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const overview = await getAnalyticsOverview({
      connectionId: parsed.data.connectionId,
      rangeDays: parsed.data.rangeDays ?? 30,
    });

    return NextResponse.json({ ok: true, overview });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to compute analytics" },
      { status: 500 }
    );
  }
}

export const GET = withApiLogging("GET /api/analytics/overview", handleGet);
