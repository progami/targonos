import { unzipSync, strFromU8 } from 'fflate';
import * as XLSX from 'xlsx';
import { parseAwdFeeCsv } from '@/lib/awd/fee-report-csv';

export type AwdMarketplace = 'amazon.com' | 'amazon.co.uk';

export const MAX_AWD_UPLOAD_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

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

export function requireMarketplace(value: unknown): AwdMarketplace {
  if (typeof value !== 'string') {
    throw new Error('marketplace must be a string');
  }
  const trimmed = value.trim();
  if (trimmed === 'amazon.com' || trimmed === 'amazon.co.uk') {
    return trimmed;
  }
  throw new Error('marketplace must be amazon.com or amazon.co.uk');
}

export function allowedCountriesForMarketplace(marketplace: AwdMarketplace): string[] {
  if (marketplace === 'amazon.com') {
    return ['United States', 'US', 'USA', 'United States of America'];
  }
  if (marketplace === 'amazon.co.uk') {
    return ['United Kingdom', 'UK', 'GB', 'Great Britain'];
  }
  const exhaustive: never = marketplace;
  throw new Error(`Unsupported marketplace: ${exhaustive}`);
}

export async function readAwdCsvText(file: File): Promise<{ csvText: string; sourceFilename: string }> {
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

export function parseAwdCsvForMarketplace(csvText: string, marketplace: AwdMarketplace) {
  return parseAwdFeeCsv(csvText, {
    maxRows: MAX_CSV_ROWS,
    allowedCountries: allowedCountriesForMarketplace(marketplace),
  });
}
