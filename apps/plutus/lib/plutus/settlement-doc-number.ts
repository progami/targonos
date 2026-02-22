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

const SETTLEMENT_DOC_NUMBER_RE = /\b(?:US|UK)-\d{2}(?:[A-Z]{3})?-\d{2}[A-Z]{3}-\d{2,4}-\d+\b/i;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function getMarketplaceFromRegion(region: string): SettlementMarketplace {
  if (region === 'US') return { id: 'amazon.com', label: 'Amazon.com', currency: 'USD', region: 'US' };
  if (region === 'UK') return { id: 'amazon.co.uk', label: 'Amazon.co.uk', currency: 'GBP', region: 'UK' };
  throw new Error(`Unsupported settlement region: ${region}`);
}

export function isSettlementDocNumber(docNumber: string): boolean {
  return SETTLEMENT_DOC_NUMBER_RE.test(docNumber.trim());
}

export function normalizeSettlementDocNumber(docNumber: string): string {
  const trimmed = docNumber.trim();
  const match = trimmed.match(SETTLEMENT_DOC_NUMBER_RE);
  if (!match) {
    throw new Error(`DocNumber is not a settlement id: ${docNumber}`);
  }

  return match[0].toUpperCase();
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

function parseSettlementPeriod(normalizedDocNumber: string): SettlementDocMeta {
  const tokens = normalizedDocNumber.split('-').map((t) => t.trim());

  const region = tokens[0];
  if (region !== 'US' && region !== 'UK') {
    throw new Error(`Missing settlement region in doc number: ${normalizedDocNumber}`);
  }

  const marketplace = getMarketplaceFromRegion(region);

  if (tokens.length < 5) {
    return { marketplace, periodStart: null, periodEnd: null };
  }

  const yearToken = tokens[tokens.length - 2];
  const rangeTokens = tokens.slice(1, tokens.length - 2);

  if (!yearToken) {
    throw new Error(`Invalid settlement doc number format: ${normalizedDocNumber}`);
  }

  if (rangeTokens.length !== 2) {
    return { marketplace, periodStart: null, periodEnd: null };
  }

  const startToken = rangeTokens[0];
  const endToken = rangeTokens[1];
  if (!startToken || !endToken) {
    return { marketplace, periodStart: null, periodEnd: null };
  }

  const endYear = yearToken.length === 2 ? 2000 + Number(yearToken) : Number(yearToken);
  if (!Number.isFinite(endYear)) {
    throw new Error(`Invalid year in settlement doc number: ${normalizedDocNumber}`);
  }

  const start = parseDayMonth(startToken);
  const end = parseDayMonth(endToken);

  const endMonth = end.month;
  const startMonth = start.month === null ? endMonth : start.month;

  if (startMonth === null || endMonth === null) {
    return { marketplace, periodStart: null, periodEnd: null };
  }

  const startYear = startMonth > endMonth ? endYear - 1 : endYear;

  const periodStart = `${startYear}-${pad2(startMonth)}-${pad2(start.day)}`;
  const periodEnd = `${endYear}-${pad2(endMonth)}-${pad2(end.day)}`;

  return { marketplace, periodStart, periodEnd };
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

