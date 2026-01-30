import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import { withApiLogging } from "@/server/api-logging";
import { maybeAutoMigrate } from "@/server/db/migrate";
import { listExperiments, createExperiment } from "@/server/experiments/crud";

export const runtime = "nodejs";

async function handleGet() {
  await maybeAutoMigrate();
  const experiments = await listExperiments();
  return NextResponse.json({ ok: true, experiments });
}

async function handlePost(req: Request) {
  await maybeAutoMigrate();

  const body = await req.json().catch(() => ({}));
  const schema = z.object({
    name: z.string().min(1),
    campaignId: z.string().min(1),
    allocations: z
      .array(z.object({ variantId: z.string(), pct: z.number() }))
      .default([]),
    primaryMetric: z.string().default("amazon_review_submitted_rate"),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const experiment = await createExperiment({
    id: `exp_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    ...parsed.data,
  });

  return NextResponse.json({ ok: true, experiment }, { status: 201 });
}

export const GET = withApiLogging("GET /api/experiments", handleGet);
export const POST = withApiLogging("POST /api/experiments", handlePost);
