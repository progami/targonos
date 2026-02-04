import { NextResponse } from "next/server";

import { withApiLogging } from "@/server/api-logging";
import { listConnectionTargets } from "@/server/sp-api/connection-list";
import { loadSpApiConfigForConnection } from "@/server/sp-api/connection-config";

export const runtime = "nodejs";

const marketplaceCountryById: Record<string, string> = {
  ATVPDKIKX0DER: "US",
  A1F83G8C2ARO7P: "UK",
};

function deriveAccountName(params: { region: string; marketplaceIds: string[] }): string {
  const countries = params.marketplaceIds
    .map((id) => marketplaceCountryById[id])
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  if (countries.length > 0) {
    const label = Array.from(new Set(countries)).join("+");
    return `Amazon ${label}`;
  }

  return `Amazon ${params.region}`;
}

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

    const accountName = deriveAccountName({ region, marketplaceIds: t.marketplaceIds });

    return {
      id: t.connectionId,
      accountName,
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
