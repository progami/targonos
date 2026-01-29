import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiLogging } from "@/server/api-logging";
import { maybeAutoMigrate } from "@/server/db/migrate";
import { getCampaign, updateCampaign } from "@/server/campaigns/crud";

export const runtime = "nodejs";

function extractId(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // /hermes/api/campaigns/[id] or /api/campaigns/[id]
  return parts[parts.length - 1];
}

async function handleGet(req: Request) {
  await maybeAutoMigrate();
  const id = extractId(req);
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, campaign });
}

async function handlePatch(req: Request) {
  await maybeAutoMigrate();
  const id = extractId(req);

  const body = await req.json().catch(() => ({}));
  const schema = z.object({
    name: z.string().min(1).optional(),
    status: z.enum(["draft", "live", "paused", "archived"]).optional(),
    schedule: z.record(z.unknown()).optional(),
    controlHoldoutPct: z.number().int().min(0).max(100).optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const campaign = await updateCampaign(id, parsed.data);
  if (!campaign) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, campaign });
}

export const GET = withApiLogging("GET /api/campaigns/[id]", handleGet);
export const PATCH = withApiLogging("PATCH /api/campaigns/[id]", handlePatch);
