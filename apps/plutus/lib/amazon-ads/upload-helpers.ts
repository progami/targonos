import { unzipSync, strFromU8 } from 'fflate';
import * as XLSX from 'xlsx';
import { parseSpAdvertisedProductCsv } from '@/lib/amazon-ads/sp-advertised-product-csv';

export type AdsMarketplace = 'amazon.com' | 'amazon.co.uk';

export const MAX_ADS_UPLOAD_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
export const MAX_ADS_REPORT_RECENCY_DAYS = 3;

const MAX_CSV_ROWS = 500_000;

function csvEscapeCell(value: unknown): string {
  const stringValue = value === null || value === undefined ? '' : String(value);
  if (stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('\r')) {
    return `"${stringValue}"`;
  }
  return stringValue;
}

function toUint8Array(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}

function xlsxToCsv(bytes: Uint8Array): string {
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('XLSX has no sheets');
  }
  const firstSheet = workbook.Sheets[firstSheetName];
  if (!firstSheet) {
    throw new Error('XLSX first sheet is missing');
  }

  const rows = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    raw: true,
    defval: '',
  }) as unknown[][];

  if (rows.length === 0) {
    throw new Error('XLSX has no rows');
  }

  return rows
    .map((row: unknown[]) => row.map((cell: unknown) => csvEscapeCell(cell)).join(','))
    .join('\n');
}

export function requireIsoDate(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return trimmed;
}

export function requireMarketplace(value: unknown): AdsMarketplace {
  if (typeof value !== 'string') {
    throw new Error('marketplace must be a string');
  }
  const trimmed = value.trim();
  if (trimmed === 'amazon.com' || trimmed === 'amazon.co.uk') {
    return trimmed;
  }
  throw new Error('marketplace must be amazon.com or amazon.co.uk');
}

export function allowedCountriesForMarketplace(marketplace: AdsMarketplace): string[] {
  if (marketplace === 'amazon.com') {
    return ['United States', 'US', 'USA', 'United States of America'];
  }
  if (marketplace === 'amazon.co.uk') {
    return ['United Kingdom', 'UK', 'GB', 'Great Britain'];
  }
  const exhaustive: never = marketplace;
  throw new Error(`Unsupported marketplace: ${exhaustive}`);
}

export function toIsoDayUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function latestAllowedReportMaxDateIso(now: Date): string {
  const midnightUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  midnightUtc.setUTCDate(midnightUtc.getUTCDate() - MAX_ADS_REPORT_RECENCY_DAYS);
  return toIsoDayUtc(midnightUtc);
}

export async function readAdsCsvText(file: File): Promise<{ csvText: string; sourceFilename: string }> {
  const bytes = toUint8Array(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.zip')) {
    const unzipped = unzipSync(bytes);
    const csvEntries = Object.entries(unzipped).filter(([name]) => name.toLowerCase().endsWith('.csv'));
    if (csvEntries.length !== 1) {
      throw new Error(`ZIP must contain exactly one .csv (found ${csvEntries.length})`);
    }

    const entry = csvEntries[0];
    if (!entry) {
      throw new Error('ZIP is missing CSV entry');
    }

    return { csvText: strFromU8(entry[1]), sourceFilename: file.name };
  }

  if (lowerName.endsWith('.csv')) {
    return { csvText: strFromU8(bytes), sourceFilename: file.name };
  }

  if (lowerName.endsWith('.xlsx')) {
    return { csvText: xlsxToCsv(bytes), sourceFilename: file.name };
  }

  throw new Error('Unsupported file type. Upload a .csv, .zip, or .xlsx');
}

export function parseAdsCsvForMarketplace(csvText: string, marketplace: AdsMarketplace) {
  return parseSpAdvertisedProductCsv(csvText, {
    maxRows: MAX_CSV_ROWS,
    allowedCountries: allowedCountriesForMarketplace(marketplace),
  });
}
