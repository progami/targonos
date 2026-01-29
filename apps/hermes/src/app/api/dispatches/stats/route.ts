import { NextResponse } from "next/server";

import { withApiLogging } from "@/server/api-logging";
import { maybeAutoMigrate } from "@/server/db/migrate";
import { getDispatchStats } from "@/server/dispatch/stats";

export const runtime = "nodejs";

async function handleGet() {
  await maybeAutoMigrate();
  const stats = await getDispatchStats();
  return NextResponse.json({ ok: true, stats });
}

export const GET = withApiLogging("GET /api/dispatches/stats", handleGet);
