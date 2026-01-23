import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createLogger } from '@targon/logger';
import type { QboAccount, QboConnection, QboJournalEntry } from '@/lib/qbo/api';
import { fetchAccounts, fetchJournalEntries } from '@/lib/qbo/api';
import { ensureServerQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { db } from '@/lib/db';

const logger = createLogger({ name: 'plutus-settlements' });

type Marketplace = {
  id: 'amazon.com' | 'amazon.co.uk';
  label: 'Amazon.com' | 'Amazon.co.uk';
  currency: 'USD' | 'GBP';
  region: 'US' | 'UK';
};

type SettlementRow = {
  id: string;
  docNumber: string;
  postedDate: string;
  memo: string;
  marketplace: Marketplace;
  periodStart: string | null;
  periodEnd: string | null;
  settlementTotal: number | null;
  lmbStatus: 'Posted';
  plutusStatus: 'Pending' | 'Processed' | 'Blocked' | 'RolledBack';
};

type LmbDocMeta = {
  marketplace: Marketplace;
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

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function getMarketplaceFromRegion(region: string): Marketplace {
  if (region === 'US') return { id: 'amazon.com', label: 'Amazon.com', currency: 'USD', region: 'US' };
  if (region === 'UK') return { id: 'amazon.co.uk', label: 'Amazon.co.uk', currency: 'GBP', region: 'UK' };
  throw new Error(`Unsupported LMB region: ${region}`);
}

function normalizeLmbDocNumber(docNumber: string): string {
  const idxHash = docNumber.indexOf('#LMB-');
  if (idxHash !== -1) return docNumber.slice(idxHash + 1);

  const idx = docNumber.indexOf('LMB-');
  if (idx !== -1) return docNumber.slice(idx);

  throw new Error(`DocNumber is not an LMB settlement id: ${docNumber}`);
}

function parseDayMonth(token: string): { day: number; month: number | null } {
  const trimmed = token.trim().toUpperCase();

  const dayOnly = trimmed.match(/^\d{2}$/);
  if (dayOnly) {
    return { day: Number(trimmed), month: null };
  }

  const dayMonth = trimmed.match(/^(\d{2})([A-Z]{3})$/);
  if (!dayMonth) {
    throw new Error(`Unrecognized LMB date token: ${token}`);
  }

  const monthRaw = dayMonth[2];
  const month = MONTHS[monthRaw];
  if (!month) {
    throw new Error(`Unrecognized month in LMB date token: ${token}`);
  }

  return { day: Number(dayMonth[1]), month };
}

function parseSettlementPeriod(normalizedDocNumber: string): LmbDocMeta {
  const tokens = normalizedDocNumber.split('-').map((t) => t.trim());
  if (tokens[0] !== 'LMB') {
    throw new Error(`Invalid LMB doc number format: ${normalizedDocNumber}`);
  }

  const region = tokens[1];
  if (!region) {
    throw new Error(`Missing LMB region in doc number: ${normalizedDocNumber}`);
  }

  const marketplace = getMarketplaceFromRegion(region);

  if (tokens.length < 6) {
    return { marketplace, periodStart: null, periodEnd: null };
  }

  const seqToken = tokens[tokens.length - 1];
  const yearToken = tokens[tokens.length - 2];
  const rangeTokens = tokens.slice(2, tokens.length - 2);

  if (!seqToken || !yearToken) {
    throw new Error(`Invalid LMB doc number format: ${normalizedDocNumber}`);
  }

  if (rangeTokens.length !== 2) {
    return { marketplace, periodStart: null, periodEnd: null };
  }

  const startToken = rangeTokens[0];
  const endToken = rangeTokens[1];
  if (!startToken || !endToken) {
    return { marketplace, periodStart: null, periodEnd: null };
  }

  const endYear =
    yearToken.length === 2 ? 2000 + Number(yearToken) : Number(yearToken);

  if (!Number.isFinite(endYear)) {
    throw new Error(`Invalid year in LMB doc number: ${normalizedDocNumber}`);
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

function computeSettlementTotal(
  entry: QboJournalEntry,
  accountsById: Map<string, QboAccount>,
): number | null {
  const candidates: Array<{ amount: number; postingType: 'Debit' | 'Credit' }> = [];

  for (const line of entry.Line) {
    const amount = line.Amount;
    if (amount === undefined) continue;

    const accountId = line.JournalEntryLineDetail.AccountRef.value;
    const account = accountsById.get(accountId);
    if (!account) continue;

    if (account.AccountType !== 'Bank') continue;

    candidates.push({
      amount,
      postingType: line.JournalEntryLineDetail.PostingType,
    });
  }

  if (candidates.length === 0) return null;

  let selected = candidates[0];
  for (const candidate of candidates) {
    if (candidate.amount > selected.amount) selected = candidate;
  }

  return selected.postingType === 'Debit' ? selected.amount : -selected.amount;
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const connectionCookie = cookieStore.get('qbo_connection')?.value;
    if (!connectionCookie) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const connection: QboConnection = JSON.parse(connectionCookie);
    await ensureServerQboConnection(connection);

    const searchParams = req.nextUrl.searchParams;
    const rawStartDate = searchParams.get('startDate');
    const rawEndDate = searchParams.get('endDate');
    const rawSearch = searchParams.get('search');
    const startDate = rawStartDate === null ? undefined : rawStartDate;
    const endDate = rawEndDate === null ? undefined : rawEndDate;
    const search = rawSearch === null ? undefined : rawSearch.trim();

    const rawPage = searchParams.get('page');
    const rawPageSize = searchParams.get('pageSize');
    const page = parseInt(rawPage === null ? '1' : rawPage, 10);
    const pageSize = parseInt(rawPageSize === null ? '25' : rawPageSize, 10);
    const startPosition = (page - 1) * pageSize + 1;

    const docNumberContains = search === undefined ? 'LMB-' : search;

    const { journalEntries, totalCount, updatedConnection } = await fetchJournalEntries(connection, {
      startDate,
      endDate,
      docNumberContains,
      maxResults: pageSize,
      startPosition,
    });

    const accountsResult = await fetchAccounts(updatedConnection ? updatedConnection : connection, {
      includeInactive: true,
    });

    const activeConnection = accountsResult.updatedConnection
      ? accountsResult.updatedConnection
      : updatedConnection
        ? updatedConnection
        : connection;

    if (activeConnection !== connection) {
      cookieStore.set('qbo_connection', JSON.stringify(activeConnection), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 100,
        path: '/',
      });
      await saveServerQboConnection(activeConnection);
    }

    const accountsById = new Map<string, QboAccount>();
    for (const account of accountsResult.accounts) {
      accountsById.set(account.Id, account);
    }

    const processed = await db.settlementProcessing.findMany({
      where: { qboSettlementJournalEntryId: { in: journalEntries.map((je) => je.Id) } },
      select: { qboSettlementJournalEntryId: true },
    });
    const processedSet = new Set(processed.map((p) => p.qboSettlementJournalEntryId));

    const rolledBack = await db.settlementRollback.findMany({
      where: { qboSettlementJournalEntryId: { in: journalEntries.map((je) => je.Id) } },
      select: { qboSettlementJournalEntryId: true },
    });
    const rolledBackSet = new Set(rolledBack.map((r) => r.qboSettlementJournalEntryId));

    const rows: SettlementRow[] = journalEntries.map((je) => {
      if (!je.DocNumber) {
        throw new Error(`Missing DocNumber on journal entry ${je.Id}`);
      }

      const normalized = normalizeLmbDocNumber(je.DocNumber);
      const meta = parseSettlementPeriod(normalized);

      let plutusStatus: SettlementRow['plutusStatus'] = 'Pending';
      if (processedSet.has(je.Id)) {
        plutusStatus = 'Processed';
      } else if (rolledBackSet.has(je.Id)) {
        plutusStatus = 'RolledBack';
      }

      return {
        id: je.Id,
        docNumber: je.DocNumber,
        postedDate: je.TxnDate,
        memo: je.PrivateNote ? je.PrivateNote : '',
        marketplace: meta.marketplace,
        periodStart: meta.periodStart,
        periodEnd: meta.periodEnd,
        settlementTotal: computeSettlementTotal(je, accountsById),
        lmbStatus: 'Posted',
        plutusStatus,
      };
    });

    return NextResponse.json({
      settlements: rows,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error) {
    logger.error('Failed to list settlements', error);
    return NextResponse.json(
      {
        error: 'Failed to list settlements',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
