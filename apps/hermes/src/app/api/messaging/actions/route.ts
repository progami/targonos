import { NextResponse } from "next/server";
import { z } from "zod";

import { maybeAutoMigrate } from "@/server/db/migrate";
import { SpApiClient } from "@/server/sp-api/client";
import { loadSpApiConfigForConnection } from "@/server/sp-api/connection-config";
import {
  getMessagingActionsForOrder,
  getMessagingOrderAttributes,
} from "@/server/sp-api/messaging";
import { withApiLogging } from "@/server/api-logging";

export const runtime = "nodejs";

function extractActions(body: any): Array<{ name?: string; href?: string }> {
  const payload = body?.payload ?? body;
  const actions = payload?._links?.actions ?? payload?.actions ?? [];
  if (!Array.isArray(actions)) return [];
  return actions
    .map((a: any) => ({
      name: typeof a?.name === "string" ? a.name : undefined,
      href: typeof a?.href === "string" ? a.href : undefined,
    }))
    .filter((a) => a.name || a.href);
}

/**
 * GET /api/messaging/actions?connectionId=...&orderId=...&marketplaceId=...
 *
 * Returns:
 * - allowed message types (HAL _links.actions)
 * - buyer locale attributes (when available)
 */
async function handleGet(req: Request) {
  await maybeAutoMigrate();

  const url = new URL(req.url);
  const schema = z.object({
    connectionId: z.string().min(1),
    orderId: z.string().min(1),
    marketplaceId: z.string().min(1),
  });

  const parsed = schema.safeParse({
    connectionId: url.searchParams.get("connectionId"),
    orderId: url.searchParams.get("orderId"),
    marketplaceId: url.searchParams.get("marketplaceId"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const client = new SpApiClient(loadSpApiConfigForConnection(parsed.data.connectionId));

    const [actionsResp, attrsResp] = await Promise.all([
      getMessagingActionsForOrder({
        client,
        orderId: parsed.data.orderId,
        marketplaceId: parsed.data.marketplaceId,
      }),
      getMessagingOrderAttributes({
        client,
        orderId: parsed.data.orderId,
        marketplaceId: parsed.data.marketplaceId,
      }).catch((e) => ({ status: 0, body: { error: String(e) }, headers: {} as any })),
    ]);

    return NextResponse.json({
      ok: true,
      actions: extractActions(actionsResp.body),
      rawActions: actionsResp.body,
      attributesStatus: attrsResp.status,
      attributes: attrsResp.body,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to fetch messaging actions" },
      { status: 500 }
    );
  }
}

export const GET = withApiLogging("GET /api/messaging/actions", handleGet);
