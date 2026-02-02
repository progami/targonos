import { NextResponse } from "next/server";

import { withApiLogging } from "@/server/api-logging";
import { listConnectionTargets } from "@/server/sp-api/connection-list";
import { loadSpApiConfigForConnection } from "@/server/sp-api/connection-config";

export const runtime = "nodejs";

async function handleGet(_req: Request) {
  const targets = listConnectionTargets();
  const nowIso = new Date().toISOString();

  const accounts = targets.map((t) => {
    let region: string = "NA";
    let status: "connected" | "needs_reauth" | "disconnected" = "connected";

    try {
      const cfg = loadSpApiConfigForConnection(t.connectionId);
      region = cfg.region;
    } catch {
      status = "disconnected";
    }

    return {
      id: t.connectionId,
      accountName: t.connectionId,
      region,
      marketplaceIds: t.marketplaceIds,
      sellerId: "",
      status,
      createdAt: nowIso,
    };
  });

  return NextResponse.json({ ok: true, accounts });
}

export const GET = withApiLogging("GET /api/accounts", handleGet);
