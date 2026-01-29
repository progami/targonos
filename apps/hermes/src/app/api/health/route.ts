import { NextResponse } from "next/server";

import { withApiLogging } from "@/server/api-logging";

async function handleGet(_req: Request) {
  return NextResponse.json({
    ok: true,
    app: "hermes",
    ts: new Date().toISOString(),
  });
}

export const GET = withApiLogging("GET /api/health", handleGet);
