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
import {
  groupSettlementChildren,
  type PlutusSettlementStatus,
  type SettlementChildSummary,
  type SettlementParentSummary,
} from '@/lib/plutus/settlement-parents';

const logger = createLogger({ name: 'plutus-settlements' });

type SettlementRow = SettlementParentSummary<SettlementChildSummary>;

type SettlementListRow = {
  qboJournalEntryId: string;
  docNumber: string;
  postedDate: string;
  memo: string;
  marketplace: SettlementMarketplace;
  periodStart: string | null;
  periodEnd: string | null;
  settlementTotal: number | null;
  plutusStatus: PlutusSettlementStatus;
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
    const rawMarketplace = searchParams.get('marketplace');
    const marketplaceFilter = rawMarketplace === 'US' || rawMarketplace === 'UK' ? rawMarketplace : null;

    const rawPage = searchParams.get('page');
    const rawPageSize = searchParams.get('pageSize');
    const page = parseInt(rawPage === null ? '1' : rawPage, 10);
    const pageSize = parseInt(rawPageSize === null ? '25' : rawPageSize, 10);

    let activeConnection = connection;
    const queryPageSize = 100;
    const allJournalEntries: QboJournalEntry[] = [];

    const docNumberQueries = marketplaceFilter !== null ? [`${marketplaceFilter}-`] : ['US-', 'UK-'];

    for (const docQuery of docNumberQueries) {
      let startPosition = 1;
      while (true) {
        const pageResult = await fetchJournalEntries(activeConnection, {
          docNumberContains: docQuery,
          maxResults: queryPageSize,
          startPosition,
          includeTotalCount: false,
        });
        if (pageResult.updatedConnection) {
          activeConnection = pageResult.updatedConnection;
        }
        allJournalEntries.push(...pageResult.journalEntries);
        if (pageResult.journalEntries.length < queryPageSize) break;
        startPosition += pageResult.journalEntries.length;
      }
    }

    const filteredJournalEntries = allJournalEntries.filter((je) => {
      if (!je.DocNumber) return false;
      if (!isSettlementDocNumber(je.DocNumber)) return false;
      const normalized = normalizeSettlementDocNumber(je.DocNumber);
      if (marketplaceFilter === null) return true;
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

    const allJeIds = uniqueJournalEntries.map((je) => je.Id);

    const processed = await db.settlementProcessing.findMany({
      where: { qboSettlementJournalEntryId: { in: allJeIds } },
      select: { qboSettlementJournalEntryId: true },
    });
    const processedSet = new Set(processed.map((p) => p.qboSettlementJournalEntryId));

    const rolledBack = await db.settlementRollback.findMany({
      where: { qboSettlementJournalEntryId: { in: allJeIds } },
      select: { qboSettlementJournalEntryId: true },
    });
    const rolledBackSet = new Set(rolledBack.map((r) => r.qboSettlementJournalEntryId));

    const allChildRows: SettlementListRow[] = uniqueJournalEntries.map((je) => {
      if (!je.DocNumber) {
        throw new Error(`Missing DocNumber on journal entry ${je.Id}`);
      }

      const settlementMeta = parseSettlementDocNumber(je.DocNumber);
      let plutusStatus: SettlementListRow['plutusStatus'] = 'Pending';
      if (processedSet.has(je.Id)) {
        plutusStatus = 'Processed';
      } else if (rolledBackSet.has(je.Id)) {
        plutusStatus = 'RolledBack';
      }

      return {
        qboJournalEntryId: je.Id,
        docNumber: settlementMeta.normalizedDocNumber,
        postedDate: je.TxnDate,
        memo: je.PrivateNote ? je.PrivateNote : '',
        marketplace: settlementMeta.marketplace,
        periodStart: settlementMeta.periodStart,
        periodEnd: settlementMeta.periodEnd,
        settlementTotal: computeSettlementTotalFromJournalEntry(je, accountsById),
        plutusStatus,
      };
    });

    const allRows = groupSettlementChildren(
      allChildRows.map((row) => ({
        qboJournalEntryId: row.qboJournalEntryId,
        docNumber: row.docNumber,
        postedDate: row.postedDate,
        memo: row.memo,
        marketplace: row.marketplace,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        settlementTotal: row.settlementTotal,
        plutusStatus: row.plutusStatus,
      })),
    );

    const totalsByCurrencyMap = new Map<string, { currency: string; amount: number; count: number }>();
    for (const row of allRows) {
      if (row.settlementTotal === null) continue;
      const existing = totalsByCurrencyMap.get(row.marketplace.currency);
      if (existing) {
        existing.amount += row.settlementTotal;
        existing.count += 1;
      } else {
        totalsByCurrencyMap.set(row.marketplace.currency, {
          currency: row.marketplace.currency,
          amount: row.settlementTotal,
          count: 1,
        });
      }
    }

    const summary = {
      totalCount: allRows.length,
      processedCount: allRows.filter((row) => row.plutusStatus === 'Processed').length,
      pendingCount: allRows.filter((row) => row.plutusStatus === 'Pending').length,
      rolledBackCount: allRows.filter((row) => row.plutusStatus === 'RolledBack').length,
      inconsistencyCount: allRows.filter((row) => row.hasInconsistency).length,
      splitCount: allRows.filter((row) => row.isSplit).length,
      totalsByCurrency: Array.from(totalsByCurrencyMap.values()).sort((a, b) =>
        a.currency.localeCompare(b.currency),
      ),
    };

    const totalCount = allRows.length;
    const pageStart = (page - 1) * pageSize;
    const rows = allRows.slice(pageStart, pageStart + pageSize).map((row) => ({
      ...row,
      qboStatus: 'Posted' as const,
    }));

    return NextResponse.json({
      settlements: rows,
      summary,
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
