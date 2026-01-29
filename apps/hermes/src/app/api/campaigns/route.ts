import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import { withApiLogging } from "@/server/api-logging";
import { maybeAutoMigrate } from "@/server/db/migrate";
import { listCampaigns, createCampaign } from "@/server/campaigns/crud";

export const runtime = "nodejs";

async function handleGet() {
  await maybeAutoMigrate();
  const campaigns = await listCampaigns();
  return NextResponse.json({ ok: true, campaigns });
}

async function handlePost(req: Request) {
  await maybeAutoMigrate();

  const body = await req.json().catch(() => ({}));
  const schema = z.object({
    name: z.string().min(1),
    channel: z.string().default("amazon_solicitations"),
    status: z.enum(["draft", "live", "paused", "archived"]).default("draft"),
    connectionId: z.string().min(1),
    schedule: z.record(z.unknown()).default({}),
    controlHoldoutPct: z.number().int().min(0).max(100).default(5),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const campaign = await createCampaign({
    id: `camp_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    ...parsed.data,
  });

  return NextResponse.json({ ok: true, campaign }, { status: 201 });
}

export const GET = withApiLogging("GET /api/campaigns", handleGet);
export const POST = withApiLogging("POST /api/campaigns", handlePost);
