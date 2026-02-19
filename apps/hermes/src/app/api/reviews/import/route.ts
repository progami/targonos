import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiLogging } from "@/server/api-logging";
import { maybeAutoMigrate } from "@/server/db/migrate";
import { parseReviewsFile } from "@/server/reviews/file-parser";
import { importManualReviews } from "@/server/reviews/manual-ingest";

export const runtime = "nodejs";

function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  return value;
}

async function handlePost(req: Request) {
  await maybeAutoMigrate();

  const formData = await req.formData().catch(() => null);
  if (formData === null) {
    return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 });
  }

  const schema = z.object({
    connectionId: z.string().min(1),
    marketplaceId: z.string().min(1),
    sku: z.string().min(1),
    asin: z.string().min(1).optional(),
  });

  const parsed = schema.safeParse({
    connectionId: formString(formData, "connectionId"),
    marketplaceId: formString(formData, "marketplaceId"),
    sku: formString(formData, "sku"),
    asin: formString(formData, "asin"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid form fields", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Upload a file in field 'file'" }, { status: 400 });
  }

  const fileName = file.name.trim();
  if (fileName.length === 0) {
    return NextResponse.json({ ok: false, error: "Uploaded file has no name" }, { status: 400 });
  }

  const content = await file.text();
  const reviews = parseReviewsFile({
    fileName,
    content,
  });

  if (reviews.length === 0) {
    return NextResponse.json({ ok: false, error: "No reviews found in uploaded file" }, { status: 400 });
  }

  const result = await importManualReviews({
    connectionId: parsed.data.connectionId,
    marketplaceId: parsed.data.marketplaceId,
    sku: parsed.data.sku,
    asin: parsed.data.asin,
    source: "file_upload",
    reviews,
  });

  return NextResponse.json({
    ok: true,
    connectionId: parsed.data.connectionId,
    marketplaceId: parsed.data.marketplaceId,
    sku: parsed.data.sku.trim().toUpperCase(),
    asin: parsed.data.asin ? parsed.data.asin.trim().toUpperCase() : null,
    fileName,
    result,
  });
}

export const POST = withApiLogging("POST /api/reviews/import", handlePost);
