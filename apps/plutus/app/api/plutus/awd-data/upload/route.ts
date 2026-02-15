import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  MAX_AWD_UPLOAD_FILE_SIZE_BYTES,
  parseAwdCsvForMarketplace,
  readAwdCsvText,
  requireMarketplace,
} from '@/lib/awd/upload-helpers';

export const runtime = 'nodejs';

const REPORT_TYPE = 'AWD_FEE_MONTHLY';

class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadValidationError';
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const marketplaceRaw = formData.get('marketplace');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    if (file.size > MAX_AWD_UPLOAD_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed size is 25MB.` },
        { status: 400 },
      );
    }

    let marketplace: 'amazon.com' | 'amazon.co.uk';
    try {
      marketplace = requireMarketplace(marketplaceRaw);
    } catch (error) {
      throw new UploadValidationError(error instanceof Error ? error.message : String(error));
    }

    let csvText: string;
    let sourceFilename: string;
    try {
      const parsedFile = await readAwdCsvText(file);
      csvText = parsedFile.csvText;
      sourceFilename = parsedFile.sourceFilename;
    } catch (error) {
      throw new UploadValidationError(error instanceof Error ? error.message : String(error));
    }

    let parsed;
    try {
      parsed = parseAwdCsvForMarketplace(csvText, marketplace);
    } catch (error) {
      throw new UploadValidationError(error instanceof Error ? error.message : String(error));
    }

    const upload = await db.awdDataUpload.create({
      data: {
        reportType: REPORT_TYPE,
        marketplace,
        filename: sourceFilename,
        startDate: parsed.minDate,
        endDate: parsed.maxDate,
        rowCount: parsed.rows.length,
        skuCount: parsed.skuCount,
        minDate: parsed.minDate,
        maxDate: parsed.maxDate,
        rows: {
          createMany: {
            data: parsed.rows.map((row) => ({
              monthStartDate: row.monthStartDate,
              monthEndDate: row.monthEndDate,
              sku: row.sku,
              feeType: row.feeType,
              feeCents: row.feeCents,
              currency: row.currency,
            })),
          },
        },
      },
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
      upload: {
        ...upload,
        uploadedAt: upload.uploadedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: 'Failed to upload AWD report',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
