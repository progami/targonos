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

const LIST_SETTLEMENT_STATUSES = ['Pending', 'Processed', 'RolledBack'] as const;

function isSettlementListStatus(value: string): value is SettlementRow['plutusStatus'] {
  return (LIST_SETTLEMENT_STATUSES as readonly string[]).includes(value);
}

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

    const rawStatus = searchParams.get('status');
    const rawTotalMin = searchParams.get('totalMin');
    const rawTotalMax = searchParams.get('totalMax');
    const statusFilter = rawStatus
      ? rawStatus
          .split(',')
          .map((status) => status.trim())
          .filter((status): status is SettlementRow['plutusStatus'] => status !== '' && isSettlementListStatus(status))
      : null;
    const totalMin = rawTotalMin ? parseFloat(rawTotalMin) : null;
    const totalMax = rawTotalMax ? parseFloat(rawTotalMax) : null;

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
          startDate,
          endDate,
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

    let allRows = groupSettlementChildren(
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

    if (search !== undefined && search !== '') {
      const searchLower = search.toLowerCase();
      allRows = allRows.filter((row) => {
        if (row.sourceSettlementId.toLowerCase().includes(searchLower)) return true;
        if (row.parentId.toLowerCase().includes(searchLower)) return true;
        return row.children.some((child) => {
          if (child.docNumber.toLowerCase().includes(searchLower)) return true;
          return child.memo.toLowerCase().includes(searchLower);
        });
      });
    }

    // Apply status and total filters before pagination
    const filteredRows = allRows.filter((row) => {
      if (statusFilter && statusFilter.length > 0) {
        if (!statusFilter.includes(row.plutusStatus)) return false;
      }
      if (totalMin !== null && Number.isFinite(totalMin)) {
        if (row.settlementTotal === null || row.settlementTotal < totalMin) return false;
      }
      if (totalMax !== null && Number.isFinite(totalMax)) {
        if (row.settlementTotal === null || row.settlementTotal > totalMax) return false;
      }
      return true;
    });

    const totalCount = filteredRows.length;
    const pageStart = (page - 1) * pageSize;
    const rows = filteredRows.slice(pageStart, pageStart + pageSize);

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
