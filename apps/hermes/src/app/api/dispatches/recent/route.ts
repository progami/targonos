import { NextResponse } from "next/server";

import { withApiLogging } from "@/server/api-logging";
import { maybeAutoMigrate } from "@/server/db/migrate";
import { listRecentDispatches } from "@/server/dispatch/stats";

export const runtime = "nodejs";

async function handleGet() {
  await maybeAutoMigrate();
  const dispatches = await listRecentDispatches(10);
  return NextResponse.json({ ok: true, dispatches });
}

export const GET = withApiLogging("GET /api/dispatches/recent", handleGet);
