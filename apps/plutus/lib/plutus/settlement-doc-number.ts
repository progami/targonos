import type { QboAccount, QboJournalEntry } from '@/lib/qbo/api';

export type SettlementMarketplace = {
  id: 'amazon.com' | 'amazon.co.uk';
  label: 'Amazon.com' | 'Amazon.co.uk';
  currency: 'USD' | 'GBP';
  region: 'US' | 'UK';
};

type SettlementDocMeta = {
  marketplace: SettlementMarketplace;
  periodStart: string | null;
  periodEnd: string | null;
};

type SettlementDocParts = {
  region: 'US' | 'UK';
  startIsoDay: string;
  endIsoDay: string;
  seq: number;
};

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

// Canonical settlement DocNumber format (no prefix/suffix; entire string is the settlement id).
// Example: UK-260116-260130-S1 (YYMMDD start/end).
const SETTLEMENT_DOC_NUMBER_CANONICAL_EXACT_RE = /^(US|UK)-(\d{6})-(\d{6})-S(\d+)$/i;
// Legacy settlement DocNumber format kept for backwards compatibility.
// Example: UK-16-30JAN-26-1
const SETTLEMENT_DOC_NUMBER_LEGACY_EXACT_RE = /^(US|UK)-(\d{2}(?:[A-Z]{3})?)-(\d{2}[A-Z]{3})-(\d{2,4})-(\d+)$/i;
const SETTLEMENT_DOC_NUMBER_EXACT_RE = /^(?:US|UK)-(?:\d{6}-\d{6}-S\d+|\d{2}(?:[A-Z]{3})?-\d{2}[A-Z]{3}-\d{2,4}-\d+)$/i;

// Settlement ids can appear inside prefixed DocNumbers (e.g. "LMB-UK-16-30JAN-26-1").
// We still normalize/parse based on the embedded settlement id.
const SETTLEMENT_DOC_NUMBER_MATCH_RE = /\b(?:US|UK)-(?:\d{6}-\d{6}-S\d+|\d{2}(?:[A-Z]{3})?-\d{2}[A-Z]{3}-\d{2,4}-\d+)\b/i;
const PLUTUS_DOC_PREFIX = 'PLT-';

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function getMarketplaceFromRegion(region: string): SettlementMarketplace {
  if (region === 'US') return { id: 'amazon.com', label: 'Amazon.com', currency: 'USD', region: 'US' };
  if (region === 'UK') return { id: 'amazon.co.uk', label: 'Amazon.co.uk', currency: 'GBP', region: 'UK' };
  throw new Error(`Unsupported settlement region: ${region}`);
}

export function isSettlementDocNumber(docNumber: string): boolean {
  const trimmed = stripPlutusDocPrefix(docNumber).trim();
  return SETTLEMENT_DOC_NUMBER_MATCH_RE.test(trimmed);
}

export function stripPlutusDocPrefix(docNumber: string): string {
  const trimmed = docNumber.trim();
  if (trimmed.toUpperCase().startsWith(PLUTUS_DOC_PREFIX)) {
    return trimmed.slice(PLUTUS_DOC_PREFIX.length);
  }
  return trimmed;
}

export function normalizeSettlementDocNumber(docNumber: string): string {
  const trimmedUpper = stripPlutusDocPrefix(docNumber).trim().toUpperCase();

  const exact = trimmedUpper.match(SETTLEMENT_DOC_NUMBER_EXACT_RE);
  if (exact) {
    const parsed = parseSettlementDocNumberExact(exact[0]);
    return buildCanonicalSettlementDocNumber(parsed);
  }

  const match = trimmedUpper.match(SETTLEMENT_DOC_NUMBER_MATCH_RE);
  if (!match) throw new Error(`DocNumber is not a settlement id: ${docNumber}`);

  const parsed = parseSettlementDocNumberExact(match[0]);
  return buildCanonicalSettlementDocNumber(parsed);
}

export function buildPlutusSettlementDocNumber(docNumber: string): string {
  const normalized = normalizeSettlementDocNumber(docNumber);
  const prefixed = `${PLUTUS_DOC_PREFIX}${normalized}`;

  // QBO DocNumber max length is 21; canonical settlement ids are 19 chars.
  // Keep canonical ids unprefixed when prefixing would exceed the limit.
  if (prefixed.length > 21) {
    return normalized;
  }

  return prefixed;
}

function isoDayToCompactToken(isoDay: string, context: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!match) {
    throw new Error(`Invalid ISO day for ${context}: ${isoDay}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Invalid ISO day for ${context}: ${isoDay}`);
  }

  if (year < 2000 || year > 2099) {
    throw new Error(`Settlement year out of supported range (2000-2099): ${isoDay}`);
  }

  return `${pad2(year % 100)}${pad2(month)}${pad2(day)}`;
}

function parseCompactIsoDay(token: string, context: string): string {
  const match = /^(\d{2})(\d{2})(\d{2})$/.exec(token);
  if (!match) {
    throw new Error(`Invalid compact settlement date token for ${context}: ${token}`);
  }

  const year = 2000 + Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return toIsoDay(year, month, day, context);
}

function toIsoDay(year: number, month: number, day: number, context: string): string {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Invalid settlement date for ${context}: ${year}-${month}-${day}`);
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error(`Invalid settlement date for ${context}: ${year}-${month}-${day}`);
  }

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseDayMonth(token: string): { day: number; month: number | null } {
  const trimmed = token.trim().toUpperCase();

  const dayOnly = trimmed.match(/^\d{2}$/);
  if (dayOnly) {
    return { day: Number(trimmed), month: null };
  }

  const dayMonth = trimmed.match(/^(\d{2})([A-Z]{3})$/);
  if (!dayMonth) {
    throw new Error(`Unrecognized settlement date token: ${token}`);
  }

  const monthRaw = dayMonth[2];
  const month = MONTHS[monthRaw];
  if (!month) {
    throw new Error(`Unrecognized month in settlement date token: ${token}`);
  }

  return { day: Number(dayMonth[1]), month };
}

function parseCanonicalSettlementDocNumber(docNumber: string): SettlementDocParts | null {
  const match = docNumber.match(SETTLEMENT_DOC_NUMBER_CANONICAL_EXACT_RE);
  if (!match) return null;

  const region = match[1]!.toUpperCase();
  if (region !== 'US' && region !== 'UK') {
    throw new Error(`Invalid settlement region in doc number: ${docNumber}`);
  }

  const startIsoDay = parseCompactIsoDay(match[2]!, `${docNumber} start`);
  const endIsoDay = parseCompactIsoDay(match[3]!, `${docNumber} end`);
  const seq = Number(match[4]);
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`Invalid settlement sequence in doc number: ${docNumber}`);
  }

  return { region, startIsoDay, endIsoDay, seq };
}

function parseLegacySettlementDocNumber(docNumber: string): SettlementDocParts | null {
  const match = docNumber.match(SETTLEMENT_DOC_NUMBER_LEGACY_EXACT_RE);
  if (!match) return null;

  const region = match[1]!.toUpperCase();
  if (region !== 'US' && region !== 'UK') {
    throw new Error(`Missing settlement region in doc number: ${docNumber}`);
  }

  const startToken = match[2]!;
  const endToken = match[3]!;
  const yearToken = match[4]!;
  const seqToken = match[5]!;

  const endYear = yearToken.length === 2 ? 2000 + Number(yearToken) : Number(yearToken);
  if (!Number.isInteger(endYear)) {
    throw new Error(`Invalid year in settlement doc number: ${docNumber}`);
  }

  const start = parseDayMonth(startToken);
  const end = parseDayMonth(endToken);

  const endMonth = end.month;
  const startMonth = start.month === null ? endMonth : start.month;
  if (startMonth === null || endMonth === null) {
    throw new Error(`Invalid settlement date range in doc number: ${docNumber}`);
  }

  const startYear = startMonth > endMonth ? endYear - 1 : endYear;
  const startIsoDay = toIsoDay(startYear, startMonth, start.day, `${docNumber} start`);
  const endIsoDay = toIsoDay(endYear, endMonth, end.day, `${docNumber} end`);

  const seq = Number(seqToken);
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`Invalid settlement sequence in doc number: ${docNumber}`);
  }

  return { region, startIsoDay, endIsoDay, seq };
}

function parseSettlementDocNumberExact(docNumber: string): SettlementDocParts {
  const canonical = parseCanonicalSettlementDocNumber(docNumber);
  if (canonical) return canonical;

  const legacy = parseLegacySettlementDocNumber(docNumber);
  if (legacy) return legacy;

  throw new Error(`Invalid settlement doc number format: ${docNumber}`);
}

export function buildCanonicalSettlementDocNumber(input: {
  region: 'US' | 'UK';
  startIsoDay: string;
  endIsoDay: string;
  seq: number;
}): string {
  if (input.region !== 'US' && input.region !== 'UK') {
    throw new Error(`Unsupported settlement region: ${input.region}`);
  }
  if (!Number.isInteger(input.seq) || input.seq < 1) {
    throw new Error(`Invalid settlement sequence: ${input.seq}`);
  }

  const startToken = isoDayToCompactToken(input.startIsoDay, `${input.region} settlement start`);
  const endToken = isoDayToCompactToken(input.endIsoDay, `${input.region} settlement end`);

  return `${input.region}-${startToken}-${endToken}-S${input.seq}`;
}

function parseSettlementPeriod(normalizedDocNumber: string): SettlementDocMeta {
  const parsed = parseCanonicalSettlementDocNumber(normalizedDocNumber);
  if (!parsed) {
    throw new Error(`Invalid normalized settlement doc number: ${normalizedDocNumber}`);
  }

  const marketplace = getMarketplaceFromRegion(parsed.region);

  return {
    marketplace,
    periodStart: parsed.startIsoDay,
    periodEnd: parsed.endIsoDay,
  };
}

export function parseSettlementDocNumber(docNumber: string): SettlementDocMeta & { normalizedDocNumber: string } {
  const normalizedDocNumber = normalizeSettlementDocNumber(docNumber);
  return { ...parseSettlementPeriod(normalizedDocNumber), normalizedDocNumber };
}

export function computeSettlementTotalFromJournalEntry(
  entry: QboJournalEntry,
  accountsById: Map<string, QboAccount>,
): number | null {
  let total = 0;
  let found = false;
  let hasAnyLine = false;

  for (const line of entry.Line) {
    const amount = line.Amount;
    if (amount === undefined) continue;

    const accountId = line.JournalEntryLineDetail.AccountRef.value;
    const account = accountsById.get(accountId);
    if (!account) continue;

    hasAnyLine = true;

    if (account.AccountType !== 'Bank' && account.AccountType !== 'Credit Card') continue;

    found = true;
    const signed = line.JournalEntryLineDetail.PostingType === 'Debit' ? amount : -amount;
    total += signed;
  }

  if (!found) {
    // JE has lines but no bank/CC entry — settlement balances to $0
    return hasAnyLine ? 0 : null;
  }

  return total;
}
