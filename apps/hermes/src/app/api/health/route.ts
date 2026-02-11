import { NextResponse } from "next/server";

import { withApiLogging } from "@/server/api-logging";
import { isHermesDryRun } from "@/server/env/flags";

async function handleGet(_req: Request) {
  const dryRun = isHermesDryRun();
  return NextResponse.json({
    ok: true,
    app: "hermes",
    dryRun,
    ts: new Date().toISOString(),
  });
}

export const GET = withApiLogging("GET /api/health", handleGet);
