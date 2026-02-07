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

  return NextResponse.json({
    uploads: uploads.map((u) => ({
      ...u,
      uploadedAt: u.uploadedAt.toISOString(),
    })),
    invoiceIds: invoiceIds.map((r) => r.invoiceId),
  });
}
