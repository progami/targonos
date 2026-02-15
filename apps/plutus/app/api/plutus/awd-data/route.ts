import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const uploads = await db.awdDataUpload.findMany({
    orderBy: { uploadedAt: 'desc' },
    select: {
      id: true,
      reportType: true,
      marketplace: true,
      filename: true,
      startDate: true,
      endDate: true,
      rowCount: true,
      skuCount: true,
      minDate: true,
      maxDate: true,
      uploadedAt: true,
    },
  });

  return NextResponse.json({
    uploads: uploads.map((upload) => ({
      ...upload,
      uploadedAt: upload.uploadedAt.toISOString(),
    })),
  });
}
