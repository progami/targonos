import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

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

  // Get unique invoice IDs that have audit data
  const invoiceIds = await db.auditDataRow.findMany({
    distinct: ['invoiceId'],
    select: { invoiceId: true },
  });

  // Get per-invoice row counts and date ranges
  const invoiceSummaries = await db.$queryRaw<
    Array<{ invoiceId: string; rowCount: bigint; minDate: string; maxDate: string }>
  >`
    SELECT "invoiceId",
           COUNT(*)::bigint AS "rowCount",
           MIN("date") AS "minDate",
           MAX("date") AS "maxDate"
    FROM plutus."AuditDataRow"
    GROUP BY "invoiceId"
    ORDER BY "invoiceId"
  `;

  return NextResponse.json({
    uploads: uploads.map((u) => ({
      ...u,
      uploadedAt: u.uploadedAt.toISOString(),
    })),
    invoiceIds: invoiceIds.map((r) => r.invoiceId),
    invoices: invoiceSummaries.map((s) => ({
      invoiceId: s.invoiceId,
      rowCount: Number(s.rowCount),
      minDate: s.minDate,
      maxDate: s.maxDate,
    })),
  });
}
