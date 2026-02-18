import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiLogging } from "@/server/api-logging";
import { maybeAutoMigrate } from "@/server/db/migrate";
import { listManualReviews } from "@/server/reviews/query";

export const runtime = "nodejs";

function csvEscape(value: string | null): string {
  if (value === null) return "";
  const escaped = value.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

async function handleGet(req: Request) {
  await maybeAutoMigrate();

  const url = new URL(req.url);
  const schema = z.object({
    connectionId: z.string().min(1),
    marketplaceId: z.string().min(1),
    sku: z.string().min(1),
  });

  const parsed = schema.safeParse({
    connectionId: url.searchParams.get("connectionId") ?? undefined,
    marketplaceId: url.searchParams.get("marketplaceId") ?? undefined,
    sku: url.searchParams.get("sku") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const rows = await listManualReviews({
    connectionId: parsed.data.connectionId,
    marketplaceId: parsed.data.marketplaceId,
    sku: parsed.data.sku,
    limit: 5000,
  });

  const lines = [
    ["sku", "asin", "rating", "review_date", "imported_at", "title", "body"]
      .map((value) => csvEscape(value))
      .join(","),
  ];

  for (const row of rows) {
    lines.push(
      [
        row.sku,
        row.asin,
        row.rating === null ? "" : row.rating.toString(),
        row.reviewDate,
        row.importedAt,
        row.title,
        row.body,
      ]
        .map((value) => csvEscape(value))
        .join(",")
    );
  }

  const csv = lines.join("\n");
  const safeSku = parsed.data.sku.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "_");
  const fileName = `reviews_${safeSku}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename=\"${fileName}\"`,
    },
  });
}

export const GET = withApiLogging("GET /api/reviews/export", handleGet);
