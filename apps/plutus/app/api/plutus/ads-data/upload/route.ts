import { NextResponse } from 'next/server';
import { unzipSync, strFromU8 } from 'fflate';
import { db } from '@/lib/db';
import { parseSpAdvertisedProductCsv } from '@/lib/amazon-ads/sp-advertised-product-csv';

export const runtime = 'nodejs';

const REPORT_TYPE = 'SP_ADVERTISED_PRODUCT';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
const MAX_CSV_ROWS = 500_000;

class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadValidationError';
  }
}

function toUint8Array(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}

function requireIsoDate(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new UploadValidationError(`${label} must be a string`);
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new UploadValidationError(`${label} must be YYYY-MM-DD`);
  }
  return trimmed;
}

function requireMarketplace(value: unknown): 'amazon.com' | 'amazon.co.uk' {
  if (typeof value !== 'string') {
    throw new UploadValidationError('marketplace must be a string');
  }
  const trimmed = value.trim();
  if (trimmed === 'amazon.com' || trimmed === 'amazon.co.uk') {
    return trimmed;
  }
  throw new UploadValidationError('marketplace must be amazon.com or amazon.co.uk');
}

function readCsvText(file: File): Promise<{ csvText: string; sourceFilename: string }> {
  return (async () => {
    const bytes = toUint8Array(await file.arrayBuffer());
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.zip')) {
      const unzipped = unzipSync(bytes);
      const csvEntries = Object.entries(unzipped).filter(([name]) => name.toLowerCase().endsWith('.csv'));
      if (csvEntries.length !== 1) {
        throw new UploadValidationError(`ZIP must contain exactly one .csv (found ${csvEntries.length})`);
      }

      const entry = csvEntries[0];
      if (!entry) {
        throw new UploadValidationError('ZIP is missing CSV entry');
      }

      return { csvText: strFromU8(entry[1]), sourceFilename: file.name };
    }

    if (lowerName.endsWith('.csv')) {
      return { csvText: strFromU8(bytes), sourceFilename: file.name };
    }

    if (lowerName.endsWith('.xlsx')) {
      throw new UploadValidationError('Unsupported file type: .xlsx. Export as CSV and upload .csv or .zip.');
    }

    throw new UploadValidationError('Unsupported file type. Upload a .csv or .zip');
  })();
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed size is 25MB.` },
        { status: 400 },
      );
    }

    const marketplace = requireMarketplace(formData.get('marketplace'));
    const startDate = requireIsoDate(formData.get('startDate'), 'startDate');
    const endDate = requireIsoDate(formData.get('endDate'), 'endDate');
    if (startDate > endDate) {
      return NextResponse.json({ error: 'startDate must be <= endDate' }, { status: 400 });
    }

    const { csvText, sourceFilename } = await readCsvText(file);
    let parsed;
    try {
      parsed = parseSpAdvertisedProductCsv(csvText, { maxRows: MAX_CSV_ROWS });
    } catch (error) {
      throw new UploadValidationError(error instanceof Error ? error.message : String(error));
    }

    if (parsed.minDate < startDate || parsed.maxDate > endDate) {
      return NextResponse.json(
        {
          error: `CSV rows include dates outside the declared range (${startDate}–${endDate}). Parsed range: ${parsed.minDate}–${parsed.maxDate}.`,
        },
        { status: 400 },
      );
    }

    const upload = await db.adsDataUpload.create({
      data: {
        reportType: REPORT_TYPE,
        marketplace,
        filename: sourceFilename,
        startDate,
        endDate,
        rowCount: parsed.rows.length,
        skuCount: parsed.skuCount,
        minDate: parsed.minDate,
        maxDate: parsed.maxDate,
        rows: {
          createMany: {
            data: parsed.rows.map((row) => ({
              date: row.date,
              sku: row.sku,
              spendCents: row.spendCents,
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
      ...upload,
      uploadedAt: upload.uploadedAt.toISOString(),
      rawRowCount: parsed.rawRowCount,
    });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to upload Ads report',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
