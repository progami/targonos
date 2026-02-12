import { normalizeSku } from '@/lib/plutus/settlement-validation';

export type SpAdvertisedProductSpendRow = {
  date: string; // YYYY-MM-DD
  sku: string; // normalized
  spendCents: number;
};

type ParsedSpAdvertisedProductCsv = {
  rawRowCount: number;
  rows: SpAdvertisedProductSpendRow[];
  minDate: string;
  maxDate: string;
  skuCount: number;
};

type ParseSpAdvertisedProductCsvOptions = {
  maxRows?: number;
  allowedCountries?: string[];
};

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeCountryValue(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function dateFromExcelSerial(serial: number): string {
  if (!Number.isFinite(serial) || !Number.isInteger(serial)) {
    throw new Error(`Invalid Excel date serial: ${serial}`);
  }
  if (serial < 1 || serial > 100_000) {
    throw new Error(`Invalid Excel date serial: ${serial}`);
  }
  const excelEpochUtc = Date.UTC(1899, 11, 30);
  const millis = excelEpochUtc + serial * 24 * 60 * 60 * 1000;
  return new Date(millis).toISOString().slice(0, 10);
}

function parseIsoDay(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{8}$/.test(trimmed)) {
    const year = trimmed.slice(0, 4);
    const month = trimmed.slice(4, 6);
    const day = trimmed.slice(6, 8);
    return `${year}-${month}-${day}`;
  }

  if (/^\d+(\.0+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    return dateFromExcelSerial(serial);
  }

  throw new Error(`Invalid date value (expected YYYY-MM-DD, YYYYMMDD, or Excel serial): ${trimmed}`);
}

function parseMoneyToCents(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') return 0;

  const normalized = trimmed.replace(/,/g, '');
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid spend value: ${trimmed}`);
  }
  if (amount < 0) {
    throw new Error(`Spend cannot be negative: ${trimmed}`);
  }

  const cents = Math.round(amount * 100);
  if (!Number.isInteger(cents)) {
    throw new Error(`Spend cents must be an integer: ${trimmed}`);
  }
  return cents;
}

function findHeaderLine(lines: string[]): { headerIndex: number; columns: string[] } {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;

    const cols = splitCsvLine(line).map((c) => c.trim());
    if (cols.length < 3) continue;

    const normalized = cols.map((c) => normalizeHeader(c));
    const hasDate = normalized.includes('date') || normalized.includes('day');
    const hasSku = normalized.includes('advertisedsku');
    const hasSpend = normalized.includes('spend') || normalized.includes('cost');

    if (hasDate && hasSku && hasSpend) {
      return { headerIndex: i, columns: cols };
    }
  }

  throw new Error('Could not find required header row (need Date, Advertised SKU, Spend/Cost)');
}

function getRequiredColumnIndex(headers: string[], options: { names: string[]; label: string }): number {
  const normalizedHeaders = headers.map((h) => normalizeHeader(h));
  const nameSet = new Set(options.names);

  for (let i = 0; i < normalizedHeaders.length; i += 1) {
    const h = normalizedHeaders[i];
    if (h && nameSet.has(h)) {
      return i;
    }
  }

  throw new Error(`Missing required column: ${options.label}`);
}

function getOptionalColumnIndex(headers: string[], options: { names: string[] }): number | null {
  const normalizedHeaders = headers.map((h) => normalizeHeader(h));
  const nameSet = new Set(options.names);

  for (let i = 0; i < normalizedHeaders.length; i += 1) {
    const h = normalizedHeaders[i];
    if (h && nameSet.has(h)) {
      return i;
    }
  }

  return null;
}

export function parseSpAdvertisedProductCsv(csvText: string, options?: ParseSpAdvertisedProductCsvOptions): ParsedSpAdvertisedProductCsv {
  const maxRows = options?.maxRows ?? 500_000;
  const allowedCountriesSet =
    options?.allowedCountries && options.allowedCountries.length > 0
      ? new Set(options.allowedCountries.map((c) => normalizeCountryValue(c)).filter((c) => c !== ''))
      : null;

  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.replace(/^\uFEFF/, '').trim())
    .filter((l) => l !== '');

  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row');
  }

  const { headerIndex, columns } = findHeaderLine(lines);

  const dateIdx = getRequiredColumnIndex(columns, { names: ['date', 'day'], label: 'Date' });
  const skuIdx = getRequiredColumnIndex(columns, { names: ['advertisedsku'], label: 'Advertised SKU' });
  const spendIdx = getRequiredColumnIndex(columns, { names: ['spend', 'cost'], label: 'Spend' });
  const countryIdx = getOptionalColumnIndex(columns, { names: ['country'] });
  if (allowedCountriesSet !== null && countryIdx === null) {
    throw new Error('Missing required column: Country');
  }

  let rawRowCount = 0;
  let marketplaceRowCount = 0;

  const spendByDaySku = new Map<string, number>();
  const skuSet = new Set<string>();
  let minDate: string | undefined;
  let maxDate: string | undefined;

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    if (rawRowCount >= maxRows) {
      throw new Error(`CSV has more than ${maxRows.toLocaleString()} rows`);
    }

    const cols = splitCsvLine(lines[i]!);
    rawRowCount += 1;

    const dateRaw = cols[dateIdx];
    const skuRaw = cols[skuIdx];
    const spendRaw = cols[spendIdx];
    const countryRaw = countryIdx === null ? '' : cols[countryIdx];

    if (allowedCountriesSet !== null) {
      const country = normalizeCountryValue(countryRaw ? countryRaw : '');
      if (!allowedCountriesSet.has(country)) {
        continue;
      }
      marketplaceRowCount += 1;
    }

    const date = parseIsoDay(dateRaw ? dateRaw : '');
    if (minDate === undefined || date < minDate) minDate = date;
    if (maxDate === undefined || date > maxDate) maxDate = date;

    const skuTrimmed = skuRaw ? skuRaw.trim() : '';
    if (skuTrimmed === '') {
      continue;
    }
    const sku = normalizeSku(skuTrimmed);
    if (sku === '') {
      continue;
    }

    const spendCents = parseMoneyToCents(spendRaw ? spendRaw : '');
    if (spendCents <= 0) {
      continue;
    }

    const key = `${date}::${sku}`;
    const current = spendByDaySku.get(key);
    spendByDaySku.set(key, (current === undefined ? 0 : current) + spendCents);
    skuSet.add(sku);
  }

  if (rawRowCount === 0) {
    throw new Error('CSV has no data rows');
  }

  if (allowedCountriesSet !== null && marketplaceRowCount === 0) {
    throw new Error('CSV has no rows for selected marketplace');
  }

  if (minDate === undefined || maxDate === undefined) {
    throw new Error('CSV has no parsable dates');
  }

  const rows: SpAdvertisedProductSpendRow[] = [];
  for (const [key, spendCents] of spendByDaySku.entries()) {
    const sep = key.indexOf('::');
    if (sep === -1) {
      throw new Error(`Invalid aggregation key: ${key}`);
    }
    rows.push({
      date: key.slice(0, sep),
      sku: key.slice(sep + 2),
      spendCents,
    });
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.sku.localeCompare(b.sku);
  });

  return {
    rawRowCount,
    rows,
    minDate,
    maxDate,
    skuCount: skuSet.size,
  };
}
