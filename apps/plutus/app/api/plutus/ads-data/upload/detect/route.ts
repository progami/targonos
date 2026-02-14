import { NextResponse } from 'next/server';
import {
  latestAllowedReportMaxDateIso,
  MAX_ADS_UPLOAD_FILE_SIZE_BYTES,
  parseAdsCsvForMarketplace,
  readAdsCsvText,
  toIsoDayUtc,
  type AdsMarketplace,
} from '@/lib/amazon-ads/upload-helpers';

export const runtime = 'nodejs';

class DetectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DetectValidationError';
  }
}

type DetectSuggestion = {
  marketplace: AdsMarketplace;
  startDate: string;
  endDate: string;
  rowCount: number;
  skuCount: number;
  rawRowCount: number;
  isRecentEnough: boolean;
};

const MARKETPLACES: AdsMarketplace[] = ['amazon.com', 'amazon.co.uk'];

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

    let csvText: string;
    let sourceFilename: string;
    try {
      const parsedFile = await readAdsCsvText(file);
      csvText = parsedFile.csvText;
      sourceFilename = parsedFile.sourceFilename;
    } catch (error) {
      throw new DetectValidationError(error instanceof Error ? error.message : String(error));
    }
    const now = new Date();
    const maxAllowedDate = latestAllowedReportMaxDateIso(now);

    const suggestions: DetectSuggestion[] = [];
    for (const marketplace of MARKETPLACES) {
      let parsed;
      try {
        parsed = parseAdsCsvForMarketplace(csvText, marketplace);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'CSV has no rows for selected marketplace') {
          continue;
        }
        throw new DetectValidationError(message);
      }

      suggestions.push({
        marketplace,
        startDate: parsed.minDate,
        endDate: parsed.maxDate,
        rowCount: parsed.rows.length,
        skuCount: parsed.skuCount,
        rawRowCount: parsed.rawRowCount,
        isRecentEnough: parsed.maxDate <= maxAllowedDate,
      });
    }

    if (suggestions.length === 0) {
      throw new DetectValidationError('No US or UK rows detected in this report');
    }

    return NextResponse.json({
      filename: sourceFilename,
      todayUtc: toIsoDayUtc(now),
      maxAllowedDate,
      suggestions,
    });
  } catch (error) {
    if (error instanceof DetectValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: 'Failed to inspect Ads report',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
