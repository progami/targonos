import { NextResponse } from "next/server";

import { withApiLogging } from "@/server/api-logging";

async function handleGet(_req: Request) {
  const dryRun = process.env.HERMES_DRY_RUN === "1" || process.env.HERMES_DRY_RUN === "true";
  return NextResponse.json({
    ok: true,
    app: "hermes",
    dryRun,
    ts: new Date().toISOString(),
  });
}

export const GET = withApiLogging("GET /api/health", handleGet);
