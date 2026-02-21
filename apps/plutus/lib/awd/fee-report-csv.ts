import { normalizeSku } from '@/lib/plutus/settlement-validation';

export type AwdFeeRow = {
  monthStartDate: string;
  monthEndDate: string;
  sku: string;
  feeType: string;
  chargeType: string | null;
  feeCents: number;
  currency: string;
};

export type ParsedAwdFeeCsv = {
  rawRowCount: number;
  rows: AwdFeeRow[];
  minDate: string;
  maxDate: string;
  skuCount: number;
};

type ParseAwdFeeCsvOptions = {
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

function monthNameToNumber(value: string): number {
  const normalized = value.trim().toLowerCase();
  const map: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };
  const result = map[normalized];
  if (result === undefined) {
    const asNumber = Number(normalized);
    if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= 12) {
      return asNumber;
    }
    throw new Error(`Invalid month value: ${value}`);
  }
  return result;
}

function parseYear(value: string): number {
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
    throw new Error(`Invalid year value: ${value}`);
  }
  return parsed;
}

function parseMoneyToCents(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 0;
  }
  const normalized = trimmed.replace(/,/g, '');
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid fee amount: ${value}`);
  }
  return Math.round(amount * 100);
}

function firstDayOfMonthIso(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonthIso(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 0));
  return date.toISOString().slice(0, 10);
}

function findHeaderLine(lines: string[]): { headerIndex: number; columns: string[] } {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const cols = splitCsvLine(line).map((cell) => cell.trim());
    if (cols.length < 4) continue;
    const normalized = cols.map((cell) => normalizeHeader(cell));
    const hasSku = normalized.includes('msku') || normalized.includes('sku');
    const hasMonth = normalized.includes('month') || normalized.includes('monthof') || normalized.includes('monthofcharge');
    const hasYear = normalized.includes('year') || normalized.includes('yearofch') || normalized.includes('yearofcharge');
    const hasFeeType = normalized.includes('feetype');
    const hasAmount =
      normalized.includes('totalchargedamount') ||
      normalized.includes('chargedamount') ||
      normalized.includes('feeamount') ||
      normalized.includes('feeamoun') ||
      normalized.includes('monthlyamount');
    if (hasSku && hasMonth && hasYear && hasFeeType && hasAmount) {
      return { headerIndex: i, columns: cols };
    }
  }
  throw new Error('Could not find AWD fee report header row');
}

function getRequiredColumnIndex(headers: string[], names: string[], label: string): number {
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  const accepted = new Set(names);
  for (let i = 0; i < normalizedHeaders.length; i += 1) {
    const header = normalizedHeaders[i];
    if (header && accepted.has(header)) {
      return i;
    }
  }
  throw new Error(`Missing required column: ${label}`);
}

function getOptionalColumnIndex(headers: string[], names: string[]): number | null {
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  const accepted = new Set(names);
  for (let i = 0; i < normalizedHeaders.length; i += 1) {
    const header = normalizedHeaders[i];
    if (header && accepted.has(header)) {
      return i;
    }
  }
  return null;
}

export function parseAwdFeeCsv(csvText: string, options?: ParseAwdFeeCsvOptions): ParsedAwdFeeCsv {
  const maxRows = options?.maxRows ?? 500_000;
  const allowedCountriesSet =
    options?.allowedCountries && options.allowedCountries.length > 0
      ? new Set(options.allowedCountries.map((country) => normalizeCountryValue(country)).filter((country) => country !== ''))
      : null;

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, '').trim())
    .filter((line) => line !== '');

  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row');
  }

  const { headerIndex, columns } = findHeaderLine(lines);
  const skuIdx = getRequiredColumnIndex(columns, ['msku', 'sku'], 'MSKU');
  const monthIdx = getRequiredColumnIndex(columns, ['month', 'monthof', 'monthofcharge'], 'Month');
  const yearIdx = getRequiredColumnIndex(columns, ['year', 'yearofch', 'yearofcharge'], 'Year');
  const feeTypeIdx = getRequiredColumnIndex(columns, ['feetype'], 'Fee Type');
  const chargeTypeIdx = getOptionalColumnIndex(columns, ['chargetype']);
  const totalChargedAmountIdx = getOptionalColumnIndex(columns, ['totalchargedamount']);
  const chargedAmountIdx = getOptionalColumnIndex(columns, ['chargedamount']);
  const feeAmountIdx = getOptionalColumnIndex(columns, ['feeamount', 'feeamoun', 'monthlyamount']);
  let amountIdx: number | null = null;
  if (totalChargedAmountIdx !== null) {
    amountIdx = totalChargedAmountIdx;
  } else if (chargedAmountIdx !== null) {
    amountIdx = chargedAmountIdx;
  } else if (feeAmountIdx !== null) {
    amountIdx = feeAmountIdx;
  }
  if (amountIdx === null) throw new Error('Missing required column: Total Charged Amount / Charged Amount / Fee Amount');
  const currencyIdx = getOptionalColumnIndex(columns, ['currency']);
  const countryIdx = getOptionalColumnIndex(columns, ['country', 'countryc', 'countrycode']);

  let rawRowCount = 0;
  let marketplaceRowCount = 0;
  const aggregated = new Map<string, AwdFeeRow>();
  const skuSet = new Set<string>();
  let minDate: string | undefined;
  let maxDate: string | undefined;

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    if (rawRowCount >= maxRows) {
      throw new Error(`CSV has more than ${maxRows.toLocaleString()} rows`);
    }

    const cols = splitCsvLine(lines[i]!);
    rawRowCount += 1;

    if (allowedCountriesSet !== null && countryIdx !== null) {
      const countryRaw = cols[countryIdx];
      const country = normalizeCountryValue(countryRaw ? countryRaw : '');
      if (!allowedCountriesSet.has(country)) {
        continue;
      }
      marketplaceRowCount += 1;
    }

    const skuRaw = cols[skuIdx];
    const skuTrimmed = skuRaw ? skuRaw.trim() : '';
    if (skuTrimmed === '') {
      continue;
    }
    const sku = normalizeSku(skuTrimmed);
    if (sku === '') {
      continue;
    }

    const monthRaw = cols[monthIdx];
    const yearRaw = cols[yearIdx];
    const month = monthNameToNumber(monthRaw ? monthRaw : '');
    const year = parseYear(yearRaw ? yearRaw : '');
    const monthStartDate = firstDayOfMonthIso(year, month);
    const monthEndDate = lastDayOfMonthIso(year, month);

    if (minDate === undefined || monthStartDate < minDate) minDate = monthStartDate;
    if (maxDate === undefined || monthEndDate > maxDate) maxDate = monthEndDate;

    const feeTypeRaw = cols[feeTypeIdx];
    const feeType = feeTypeRaw ? feeTypeRaw.trim().toUpperCase().replace(/[\s-]+/g, '_') : '';

    const chargeTypeRaw = chargeTypeIdx === null ? '' : cols[chargeTypeIdx];
    const chargeTypeValue = chargeTypeRaw ? chargeTypeRaw.trim() : '';
    const chargeType =
      chargeTypeValue === ''
        ? null
        : chargeTypeValue.toLowerCase() === 'inbound'
          ? 'Inbound'
          : chargeTypeValue.toLowerCase() === 'outbound'
            ? 'Outbound'
            : chargeTypeValue;

    const feeAmountRaw = cols[amountIdx];
    const feeCents = parseMoneyToCents(feeAmountRaw ? feeAmountRaw : '');
    if (feeCents <= 0) {
      continue;
    }

    const currencyRaw = currencyIdx === null ? 'USD' : cols[currencyIdx];
    const currency = currencyRaw ? currencyRaw.trim().toUpperCase() : 'USD';

    const key = `${monthStartDate}::${monthEndDate}::${sku}::${feeType}::${currency}::${chargeType ? chargeType : ''}`;
    const existing = aggregated.get(key);
    if (existing === undefined) {
      aggregated.set(key, {
        monthStartDate,
        monthEndDate,
        sku,
        feeType,
        chargeType,
        feeCents,
        currency,
      });
    } else {
      existing.feeCents += feeCents;
    }
    skuSet.add(sku);
  }

  if (rawRowCount === 0) {
    throw new Error('CSV has no data rows');
  }

  if (allowedCountriesSet !== null && countryIdx !== null && marketplaceRowCount === 0) {
    throw new Error('CSV has no rows for selected marketplace');
  }

  if (minDate === undefined || maxDate === undefined) {
    throw new Error('CSV has no parsable fee rows');
  }

  const rows = Array.from(aggregated.values()).sort((a, b) => {
    if (a.monthStartDate !== b.monthStartDate) return a.monthStartDate.localeCompare(b.monthStartDate);
    if (a.sku !== b.sku) return a.sku.localeCompare(b.sku);
    if (a.feeType !== b.feeType) return a.feeType.localeCompare(b.feeType);
    if (a.chargeType !== b.chargeType) return String(a.chargeType).localeCompare(String(b.chargeType));
    return a.currency.localeCompare(b.currency);
  });

  return {
    rawRowCount,
    rows,
    minDate,
    maxDate,
    skuCount: skuSet.size,
  };
}
