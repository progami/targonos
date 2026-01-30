import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiLogging } from "@/server/api-logging";
import { loadSpApiConfigForConnection } from "@/server/sp-api/connection-config";
import { SpApiClient } from "@/server/sp-api/client";

export const runtime = "nodejs";

async function handlePost(req: Request) {
  const body = await req.json().catch(() => ({}));
  const schema = z.object({
    connectionId: z.string().min(1),
    marketplaceId: z.string().min(1),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { connectionId, marketplaceId } = parsed.data;

  let config;
  try {
    config = loadSpApiConfigForConnection(connectionId);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load connection config" },
      { status: 400 }
    );
  }

  const client = new SpApiClient(config);

  try {
    // Use getMarketplaceParticipations as a lightweight connectivity test.
    // It doesn't require any specific order/listing — just valid credentials.
    const res = await client.request({
      method: "GET",
      path: "/sellers/v1/marketplaceParticipations",
      rateLimitKey: "sellers.getMarketplaceParticipations",
      defaultRateLimit: { burst: 15, ratePerSecond: 0.0167 },
    });

    if (res.status >= 200 && res.status < 300) {
      const payload = res.body as any;
      const participations = payload?.payload ?? [];
      const marketplaceNames = participations
        .map((p: any) => p?.marketplace?.name)
        .filter(Boolean);

      return NextResponse.json({
        ok: true,
        status: res.status,
        marketplaces: marketplaceNames,
        message: `Connection healthy — ${marketplaceNames.length} marketplace(s) found`,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        status: res.status,
        error: `SP-API returned HTTP ${res.status}`,
        body: res.body,
      },
      { status: 502 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Connection test failed" },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging("POST /api/accounts/test", handlePost);
