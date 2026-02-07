import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';
import { fetchAccounts, fetchJournalEntries, QboAuthError, type QboAccount, type QboJournalEntry } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { db } from '@/lib/db';

const logger = createLogger({ name: 'plutus-analytics' });

type ChannelId = 'targon-us' | 'targon-uk';

type Channel = {
  id: ChannelId;
  label: string;
  region: 'US' | 'UK';
  docNumberContains: string;
};

type MonthTotals = {
  settlements: number;
  salesCents: number;
  refundsCents: number;
  sellerFeesCents: number;
  fbaFeesCents: number;
  storageFeesCents: number;
};

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function requireMonth(value: string | null): { year: number; month: number; key: string } {
  if (!value) {
    throw new Error('Missing month');
  }

  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new Error('Invalid month format');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error('Invalid month format');
  }

  return { year, month, key: `${year}-${pad2(month)}` };
}

function requireChannel(value: string | null): Channel {
  if (value === 'targon-us') {
    return { id: value, label: 'Targon US', region: 'US', docNumberContains: 'LMB-US-' };
  }
  if (value === 'targon-uk') {
    return { id: value, label: 'Targon UK', region: 'UK', docNumberContains: 'LMB-UK-' };
  }
  throw new Error('Invalid channel');
}

function addMonths(input: { year: number; month: number }, delta: number): { year: number; month: number } {
  const zeroBased = input.month - 1;
  const total = input.year * 12 + zeroBased + delta;
  const year = Math.floor(total / 12);
  const monthZero = total % 12;
  return { year, month: monthZero + 1 };
}

function monthKey({ year, month }: { year: number; month: number }): string {
  return `${year}-${pad2(month)}`;
}

function monthKeysForTrailingYear(end: { year: number; month: number }): string[] {
  const keys: string[] = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    keys.push(monthKey(addMonths(end, -offset)));
  }
  return keys;
}

function lastDayOfMonth({ year, month }: { year: number; month: number }): number {
  const firstNextMonth = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(firstNextMonth.getTime() - 24 * 60 * 60 * 1000);
  return lastDay.getUTCDate();
}

function cents(amount: number): number {
  return Math.round(amount * 100);
}

function buildChildrenByParent(accounts: QboAccount[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const account of accounts) {
    const parentId = account.ParentRef?.value;
    if (!parentId) continue;
    const existing = map.get(parentId);
    if (existing) {
      existing.push(account.Id);
    } else {
      map.set(parentId, [account.Id]);
    }
  }
  return map;
}

function descendantsOf(rootId: string, childrenByParent: Map<string, string[]>): Set<string> {
  const visited = new Set<string>();
  const stack = [rootId];

  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) continue;
    if (visited.has(next)) continue;
    visited.add(next);

    const children = childrenByParent.get(next);
    if (!children) continue;
    for (const childId of children) {
      stack.push(childId);
    }
  }

  return visited;
}

export async function GET(req: NextRequest) {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const period = requireMonth(searchParams.get('month'));
    const channel = requireChannel(searchParams.get('channel'));

    const monthKeys = monthKeysForTrailingYear({ year: period.year, month: period.month });
    const startMonth = monthKeys[0];
    const startDate = `${startMonth}-01`;
    const endDate = `${period.key}-${pad2(lastDayOfMonth({ year: period.year, month: period.month }))}`;

    const config = await db.setupConfig.findFirst();
    if (!config) {
      return NextResponse.json({ error: 'Setup is required before analytics are available.' }, { status: 400 });
    }

    const requiredMappings: Array<{ key: string; value: string | null }> = [
      { key: 'amazonSales', value: config.amazonSales },
      { key: 'amazonRefunds', value: config.amazonRefunds },
      { key: 'amazonSellerFees', value: config.amazonSellerFees },
      { key: 'amazonFbaFees', value: config.amazonFbaFees },
      { key: 'amazonStorageFees', value: config.amazonStorageFees },
    ];
    const missing = requiredMappings.filter((m) => !m.value).map((m) => m.key);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing account mappings: ${missing.join(', ')}` },
        { status: 400 },
      );
    }

    let activeConnection = connection;

    const accountsResult = await fetchAccounts(activeConnection, { includeInactive: true });
    if (accountsResult.updatedConnection) {
      activeConnection = accountsResult.updatedConnection;
    }

    const childrenByParent = buildChildrenByParent(accountsResult.accounts);
    const salesAccountIds = descendantsOf(config.amazonSales as string, childrenByParent);
    const refundsAccountIds = descendantsOf(config.amazonRefunds as string, childrenByParent);
    const sellerFeesAccountIds = descendantsOf(config.amazonSellerFees as string, childrenByParent);
    const fbaFeesAccountIds = descendantsOf(config.amazonFbaFees as string, childrenByParent);
    const storageFeesAccountIds = descendantsOf(config.amazonStorageFees as string, childrenByParent);

    const totalsByMonth = new Map<string, MonthTotals>();
    for (const key of monthKeys) {
      totalsByMonth.set(key, {
        settlements: 0,
        salesCents: 0,
        refundsCents: 0,
        sellerFeesCents: 0,
        fbaFeesCents: 0,
        storageFeesCents: 0,
      });
    }

    const maxResults = 100;
    let startPosition = 1;
    let totalCount = 0;
    const journalEntries: QboJournalEntry[] = [];

    while (true) {
      const result = await fetchJournalEntries(activeConnection, {
        startDate,
        endDate,
        docNumberContains: channel.docNumberContains,
        maxResults,
        startPosition,
      });

      if (result.updatedConnection) {
        activeConnection = result.updatedConnection;
      }

      if (totalCount === 0) {
        totalCount = result.totalCount;
      }

      journalEntries.push(...result.journalEntries);

      if (journalEntries.length >= result.totalCount) break;
      if (result.journalEntries.length === 0) break;
      startPosition += result.journalEntries.length;
    }

    for (const entry of journalEntries) {
      const key = entry.TxnDate.slice(0, 7);
      const bucket = totalsByMonth.get(key);
      if (!bucket) continue;

      bucket.settlements += 1;

      for (const line of entry.Line) {
        const amountRaw = line.Amount;
        if (amountRaw === undefined) continue;

        const amountCents = cents(amountRaw);
        const accountId = line.JournalEntryLineDetail.AccountRef.value;
        const postingType = line.JournalEntryLineDetail.PostingType;

        if (salesAccountIds.has(accountId) && postingType === 'Credit') {
          bucket.salesCents += amountCents;
        }
        if (refundsAccountIds.has(accountId) && postingType === 'Debit') {
          bucket.refundsCents += amountCents;
        }
        if (sellerFeesAccountIds.has(accountId) && postingType === 'Debit') {
          bucket.sellerFeesCents += amountCents;
        }
        if (fbaFeesAccountIds.has(accountId) && postingType === 'Debit') {
          bucket.fbaFeesCents += amountCents;
        }
        if (storageFeesAccountIds.has(accountId) && postingType === 'Debit') {
          bucket.storageFeesCents += amountCents;
        }
      }
    }

    if (activeConnection !== connection) {
      await saveServerQboConnection(activeConnection);
    }

    return NextResponse.json({
      channel,
      range: {
        startMonth,
        endMonth: period.key,
        startDate,
        endDate,
      },
      months: monthKeys.map((key) => ({
        month: key,
        ...totalsByMonth.get(key),
      })),
      settlementsInPeriod: totalsByMonth.get(period.key)?.settlements ?? 0,
      totalCount,
    });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Analytics endpoint failed', error);
    return NextResponse.json(
      {
        error: 'Failed to load analytics',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
