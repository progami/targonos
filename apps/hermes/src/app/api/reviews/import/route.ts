import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiLogging } from "@/server/api-logging";
import { maybeAutoMigrate } from "@/server/db/migrate";
import { importManualReviews, parseManualReviewText } from "@/server/reviews/manual-ingest";

export const runtime = "nodejs";

const reviewInputSchema = z.object({
  externalReviewId: z.string().min(1).optional(),
  reviewDate: z.string().min(1).optional(),
  rating: z.number().min(0).max(5).optional(),
  title: z.string().min(1).optional(),
  body: z.string().min(1),
  raw: z.unknown().optional(),
});

async function handlePost(req: Request) {
  await maybeAutoMigrate();

  const body = await req.json().catch(() => null);

  const schema = z.object({
    connectionId: z.string().min(1),
    marketplaceId: z.string().min(1),
    asin: z.string().min(1),
    source: z.string().min(1).optional().default("manual"),
    reviews: z.array(reviewInputSchema).max(1000).optional(),
    rawText: z.string().min(1).optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const rawReviews = parsed.data.rawText ? parseManualReviewText(parsed.data.rawText) : [];
  const explicitReviews = parsed.data.reviews ?? [];
  const mergedReviews = explicitReviews.concat(rawReviews);

  if (mergedReviews.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Provide reviews[] or rawText with at least one review." },
      { status: 400 }
    );
  }

  const result = await importManualReviews({
    connectionId: parsed.data.connectionId,
    marketplaceId: parsed.data.marketplaceId,
    asin: parsed.data.asin,
    source: parsed.data.source,
    reviews: mergedReviews,
  });

  return NextResponse.json({
    ok: true,
    connectionId: parsed.data.connectionId,
    marketplaceId: parsed.data.marketplaceId,
    asin: parsed.data.asin.trim().toUpperCase(),
    source: parsed.data.source,
    result,
  });
}

export const POST = withApiLogging("POST /api/reviews/import", handlePost);
