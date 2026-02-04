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

  let mappingById: Map<string, any> | null = null;
  const mappingRaw = process.env.HERMES_CONNECTIONS_JSON;
  if (typeof mappingRaw === "string" && mappingRaw.trim().length > 0) {
    try {
      const parsed = JSON.parse(mappingRaw);
      if (Array.isArray(parsed)) {
        mappingById = new Map<string, any>();
        for (const x of parsed) {
          const id = typeof x?.connectionId === "string" ? x.connectionId : null;
          if (!id) continue;
          mappingById.set(id, x);
        }
      }
    } catch {
      // ignore
    }
  }

  const accounts = targets.map((t) => {
    let region: string = "NA";
    let status: "connected" | "needs_reauth" | "disconnected" = "connected";

    try {
      const cfg = loadSpApiConfigForConnection(t.connectionId);
      region = cfg.region;
    } catch {
      status = "disconnected";
    }

    const mapping = mappingById?.get(t.connectionId) ?? null;
    const explicitName = typeof mapping?.accountName === "string"
      ? mapping.accountName.trim()
      : typeof mapping?.name === "string"
        ? mapping.name.trim()
        : null;

    const accountName = explicitName && explicitName.length > 0 ? explicitName : deriveAccountName({ region, marketplaceIds: t.marketplaceIds });

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
