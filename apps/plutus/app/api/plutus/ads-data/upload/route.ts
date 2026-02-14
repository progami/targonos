import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  latestAllowedReportMaxDateIso,
  MAX_ADS_REPORT_RECENCY_DAYS,
  MAX_ADS_UPLOAD_FILE_SIZE_BYTES,
  parseAdsCsvForMarketplace,
  readAdsCsvText,
  requireIsoDate,
  requireMarketplace,
  toIsoDayUtc,
  type AdsMarketplace,
} from '@/lib/amazon-ads/upload-helpers';

export const runtime = 'nodejs';

const REPORT_TYPE = 'SP_ADVERTISED_PRODUCT';

class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadValidationError';
  }
}

type UploadTarget = {
  marketplace: AdsMarketplace;
  startDate: string;
  endDate: string;
};

function parseUploadTargets(formData: FormData): UploadTarget[] {
  const targetsRaw = formData.get('targets');
  if (typeof targetsRaw !== 'string' || targetsRaw.trim() === '') {
    const marketplace = requireMarketplace(formData.get('marketplace'));
    const startDate = requireIsoDate(formData.get('startDate'), 'startDate');
    const endDate = requireIsoDate(formData.get('endDate'), 'endDate');
    if (startDate > endDate) {
      throw new Error('startDate must be <= endDate');
    }
    return [{ marketplace, startDate, endDate }];
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(targetsRaw);
  } catch {
    throw new Error('targets must be valid JSON');
  }

  if (!Array.isArray(parsedJson) || parsedJson.length === 0) {
    throw new Error('targets must be a non-empty array');
  }

  const seen = new Set<AdsMarketplace>();
  const targets: UploadTarget[] = [];
  for (const item of parsedJson) {
    if (!item || typeof item !== 'object') {
      throw new Error('targets entries must be objects');
    }
    const row = item as Record<string, unknown>;
    const marketplace = requireMarketplace(row.marketplace);
    const startDate = requireIsoDate(row.startDate, 'startDate');
    const endDate = requireIsoDate(row.endDate, 'endDate');
    if (startDate > endDate) {
      throw new Error('startDate must be <= endDate');
    }
    if (seen.has(marketplace)) {
      throw new Error(`Duplicate marketplace target: ${marketplace}`);
    }
    seen.add(marketplace);
    targets.push({ marketplace, startDate, endDate });
  }

  return targets;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    if (file.size > MAX_ADS_UPLOAD_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed size is 25MB.` },
        { status: 400 },
      );
    }

    let targets: UploadTarget[];
    try {
      targets = parseUploadTargets(formData);
    } catch (error) {
      throw new UploadValidationError(error instanceof Error ? error.message : String(error));
    }

    let csvText: string;
    let sourceFilename: string;
    try {
      const parsedFile = await readAdsCsvText(file);
      csvText = parsedFile.csvText;
      sourceFilename = parsedFile.sourceFilename;
    } catch (error) {
      throw new UploadValidationError(error instanceof Error ? error.message : String(error));
    }

    const parsedByMarketplace = new Map<AdsMarketplace, ReturnType<typeof parseAdsCsvForMarketplace>>();
    try {
      for (const target of targets) {
        if (parsedByMarketplace.has(target.marketplace)) {
          continue;
        }
        parsedByMarketplace.set(target.marketplace, parseAdsCsvForMarketplace(csvText, target.marketplace));
      }
    } catch (error) {
      throw new UploadValidationError(error instanceof Error ? error.message : String(error));
    }

    const now = new Date();
    const latestAllowedDate = latestAllowedReportMaxDateIso(now);
    const todayUtc = toIsoDayUtc(now);

    for (const target of targets) {
      const parsed = parsedByMarketplace.get(target.marketplace);
      if (!parsed) {
        throw new UploadValidationError(`Missing parsed rows for ${target.marketplace}`);
      }

      if (parsed.minDate < target.startDate || parsed.maxDate > target.endDate) {
        throw new UploadValidationError(
          `${target.marketplace} rows include dates outside declared range (${target.startDate}–${target.endDate}). Parsed range: ${parsed.minDate}–${parsed.maxDate}.`,
        );
      }

      if (parsed.maxDate > latestAllowedDate) {
        throw new UploadValidationError(
          `${target.marketplace} latest row date ${parsed.maxDate} is too recent. With a ${MAX_ADS_REPORT_RECENCY_DAYS}-day buffer, max allowed is ${latestAllowedDate} (today UTC ${todayUtc}).`,
        );
      }
    }

    const uploads = await db.$transaction(async (tx) => {
      const created = [];
      for (const target of targets) {
        const parsed = parsedByMarketplace.get(target.marketplace);
        if (!parsed) {
          throw new Error(`Missing parsed rows for ${target.marketplace}`);
        }

        const upload = await tx.adsDataUpload.create({
          data: {
            reportType: REPORT_TYPE,
            marketplace: target.marketplace,
            filename: sourceFilename,
            startDate: target.startDate,
            endDate: target.endDate,
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
        created.push(upload);
      }
      return created;
    });

    return NextResponse.json({
      uploads: uploads.map((upload) => {
        const parsed = parsedByMarketplace.get(upload.marketplace as AdsMarketplace);
        if (!parsed) {
          throw new Error(`Missing parsed rows for ${upload.marketplace}`);
        }
        return {
          ...upload,
          uploadedAt: upload.uploadedAt.toISOString(),
          rawRowCount: parsed.rawRowCount,
        };
      }),
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
