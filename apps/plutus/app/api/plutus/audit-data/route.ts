import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { MarketplaceId } from '@/lib/plutus/audit-invoice-matching';

export const runtime = 'nodejs';

export async function GET() {
  const uploads = await db.auditDataUpload.findMany({
    orderBy: { uploadedAt: 'desc' },
    select: {
      id: true,
      filename: true,
      rowCount: true,
      invoiceCount: true,
      uploadedAt: true,
    },
  });

  // Get per-invoice row counts and date ranges
  const invoiceSummaries = await db.$queryRaw<
    Array<{ invoiceId: string; marketplaceId: string | null; rowCount: bigint; minDate: string; maxDate: string; markets: string[] }>
  >`
    SELECT "invoiceId",
           CASE
             WHEN LOWER("market") = 'us' OR LOWER("market") LIKE '%amazon.com%' THEN 'amazon.com'
             WHEN LOWER("market") = 'uk' OR LOWER("market") LIKE '%amazon.co.uk%' THEN 'amazon.co.uk'
             ELSE NULL
           END AS "marketplaceId",
           COUNT(*)::bigint AS "rowCount",
           MIN("date") AS "minDate",
           MAX("date") AS "maxDate",
           ARRAY_AGG(DISTINCT "market") AS markets
    FROM plutus."AuditDataRow"
    GROUP BY "invoiceId", "marketplaceId"
    ORDER BY "invoiceId", "marketplaceId"
  `;

  const invoices = invoiceSummaries.map((s) => {
    if (s.marketplaceId !== 'amazon.com' && s.marketplaceId !== 'amazon.co.uk') {
      throw new Error(`Unrecognized audit marketplace: ${s.marketplaceId === null ? 'null' : s.marketplaceId}`);
    }
    return {
      invoiceId: s.invoiceId,
      marketplace: s.marketplaceId as MarketplaceId,
      rowCount: Number(s.rowCount),
      minDate: s.minDate,
      maxDate: s.maxDate,
      markets: s.markets,
    };
  });

  const invoiceIds = invoices.map((inv) => `${inv.marketplace}:${inv.invoiceId}`);

  return NextResponse.json({
    uploads: uploads.map((u) => ({
      ...u,
      uploadedAt: u.uploadedAt.toISOString(),
    })),
    invoiceIds,
    invoices,
  });
}
