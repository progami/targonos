import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import type { QboAccount, QboJournalEntry } from '@/lib/qbo/api';
import { fetchAccounts, fetchJournalEntries, QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { db } from '@/lib/db';
import {
  computeSettlementTotalFromJournalEntry,
  isSettlementDocNumber,
  normalizeSettlementDocNumber,
  parseSettlementDocNumber,
  type SettlementMarketplace,
} from '@/lib/plutus/settlement-doc-number';

const logger = createLogger({ name: 'plutus-settlements' });

type SettlementRow = {
  id: string;
  docNumber: string;
  postedDate: string;
  memo: string;
  marketplace: SettlementMarketplace;
  periodStart: string | null;
  periodEnd: string | null;
  settlementTotal: number | null;
  qboStatus: 'Posted';
  plutusStatus: 'Pending' | 'Processed' | 'Blocked' | 'RolledBack';
};

function isCanonicalSettlementDocNumber(docNumber: string): boolean {
  const trimmedUpper = docNumber.trim().toUpperCase();
  if (!isSettlementDocNumber(trimmedUpper)) return false;
  return trimmedUpper === normalizeSettlementDocNumber(trimmedUpper);
}

function pickPreferredSettlementEntry(a: QboJournalEntry, b: QboJournalEntry): QboJournalEntry {
  const aDocNumber = a.DocNumber ? a.DocNumber : '';
  const bDocNumber = b.DocNumber ? b.DocNumber : '';

  const aCanonical = isCanonicalSettlementDocNumber(aDocNumber);
  const bCanonical = isCanonicalSettlementDocNumber(bDocNumber);

  if (aCanonical && !bCanonical) return a;
  if (bCanonical && !aCanonical) return b;

  if (a.TxnDate !== b.TxnDate) {
    return a.TxnDate > b.TxnDate ? a : b;
  }

  return a.Id > b.Id ? a : b;
}

export async function GET(req: NextRequest) {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const rawStartDate = searchParams.get('startDate');
    const rawEndDate = searchParams.get('endDate');
    const rawSearch = searchParams.get('search');
    const rawMarketplace = searchParams.get('marketplace');
    const startDate = rawStartDate === null ? undefined : rawStartDate;
    const endDate = rawEndDate === null ? undefined : rawEndDate;
    const search = rawSearch === null ? undefined : rawSearch.trim();
    const marketplaceFilter = rawMarketplace === 'US' || rawMarketplace === 'UK' ? rawMarketplace : null;

    const rawPage = searchParams.get('page');
    const rawPageSize = searchParams.get('pageSize');
    const page = parseInt(rawPage === null ? '1' : rawPage, 10);
    const pageSize = parseInt(rawPageSize === null ? '25' : rawPageSize, 10);

    const docNumberContains = search !== undefined ? search : marketplaceFilter !== null ? `${marketplaceFilter}-` : null;

    let activeConnection = connection;
    const queryPageSize = 100;
    const allJournalEntries: QboJournalEntry[] = [];

    const docNumberQueries = docNumberContains ? [docNumberContains] : ['US-', 'UK-'];

    for (const docQuery of docNumberQueries) {
      let startPosition = 1;
      let fetchedForQuery = 0;
      while (true) {
        const pageResult = await fetchJournalEntries(activeConnection, {
          startDate,
          endDate,
          docNumberContains: docQuery,
          maxResults: queryPageSize,
          startPosition,
        });
        if (pageResult.updatedConnection) {
          activeConnection = pageResult.updatedConnection;
        }
        allJournalEntries.push(...pageResult.journalEntries);
        fetchedForQuery += pageResult.journalEntries.length;
        if (fetchedForQuery >= pageResult.totalCount) break;
        if (pageResult.journalEntries.length === 0) break;
        startPosition += pageResult.journalEntries.length;
      }
    }

    const filteredJournalEntries = allJournalEntries.filter((je) => {
      if (!je.DocNumber) return false;
      if (!isSettlementDocNumber(je.DocNumber)) return false;
      if (marketplaceFilter === null) return true;
      const normalized = normalizeSettlementDocNumber(je.DocNumber);
      return normalized.startsWith(`${marketplaceFilter}-`);
    });

    const dedupedByNormalizedDocNumber = new Map<string, QboJournalEntry>();
    for (const journalEntry of filteredJournalEntries) {
      if (!journalEntry.DocNumber) continue;
      const normalized = normalizeSettlementDocNumber(journalEntry.DocNumber);
      const existing = dedupedByNormalizedDocNumber.get(normalized);
      if (!existing) {
        dedupedByNormalizedDocNumber.set(normalized, journalEntry);
        continue;
      }
      dedupedByNormalizedDocNumber.set(normalized, pickPreferredSettlementEntry(existing, journalEntry));
    }

    const uniqueJournalEntries = Array.from(dedupedByNormalizedDocNumber.values()).sort((a, b) => {
      if (a.TxnDate !== b.TxnDate) return b.TxnDate.localeCompare(a.TxnDate);
      const aDoc = a.DocNumber ? a.DocNumber : '';
      const bDoc = b.DocNumber ? b.DocNumber : '';
      return aDoc.localeCompare(bDoc);
    });

    const totalCount = uniqueJournalEntries.length;
    const pageStart = (page - 1) * pageSize;
    const pagedJournalEntries = uniqueJournalEntries.slice(pageStart, pageStart + pageSize);

    const accountsResult = await fetchAccounts(activeConnection, {
      includeInactive: true,
    });

    activeConnection = accountsResult.updatedConnection ? accountsResult.updatedConnection : activeConnection;

    if (activeConnection !== connection) {
      await saveServerQboConnection(activeConnection);
    }

    const accountsById = new Map<string, QboAccount>();
    for (const account of accountsResult.accounts) {
      accountsById.set(account.Id, account);
    }

    const processed = await db.settlementProcessing.findMany({
      where: { qboSettlementJournalEntryId: { in: pagedJournalEntries.map((je) => je.Id) } },
      select: { qboSettlementJournalEntryId: true },
    });
    const processedSet = new Set(processed.map((p) => p.qboSettlementJournalEntryId));

    const rolledBack = await db.settlementRollback.findMany({
      where: { qboSettlementJournalEntryId: { in: pagedJournalEntries.map((je) => je.Id) } },
      select: { qboSettlementJournalEntryId: true },
    });
    const rolledBackSet = new Set(rolledBack.map((r) => r.qboSettlementJournalEntryId));

    const rows: SettlementRow[] = pagedJournalEntries.map((je) => {
      if (!je.DocNumber) {
        throw new Error(`Missing DocNumber on journal entry ${je.Id}`);
      }

      const meta = parseSettlementDocNumber(je.DocNumber);

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
        settlementTotal: computeSettlementTotalFromJournalEntry(je, accountsById),
        qboStatus: 'Posted',
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
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

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

