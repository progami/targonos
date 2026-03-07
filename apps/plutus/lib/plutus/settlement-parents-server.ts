import type { QboAccount, QboConnection, QboJournalEntry } from '@/lib/qbo/api';
import { fetchAccounts, fetchJournalEntries, fetchJournalEntryById } from '@/lib/qbo/api';
import { db } from '@/lib/db';
import {
  computeSettlementTotalFromJournalEntry,
  isSettlementDocNumber,
  normalizeSettlementDocNumber,
  parseSettlementDocNumber,
} from '@/lib/plutus/settlement-doc-number';
import {
  extractSourceSettlementIdFromPrivateNote,
  groupSettlementChildren,
  type PlutusSettlementStatus,
  type SettlementChildSummary,
  type SettlementParentSummary,
} from '@/lib/plutus/settlement-parents';

type SettlementProcessingSummary = {
  id: string;
  invoiceId: string;
  processingHash: string;
  sourceFilename: string;
  uploadedAt: string;
  qboCogsJournalEntryId: string;
  qboPnlReclassJournalEntryId: string;
  orderSalesCount: number;
  orderReturnsCount: number;
};

type SettlementRollbackSummary = {
  id: string;
  invoiceId: string;
  processingHash: string;
  sourceFilename: string;
  processedAt: string;
  rolledBackAt: string;
  qboCogsJournalEntryId: string;
  qboPnlReclassJournalEntryId: string;
  orderSalesCount: number;
  orderReturnsCount: number;
};

export type SettlementParentChildDetail = SettlementChildSummary & {
  lines: Array<{
    id?: string;
    description: string;
    amount: number;
    postingType: 'Debit' | 'Credit';
    accountId: string;
    accountName: string;
    accountFullyQualifiedName?: string;
    accountType?: string;
  }>;
  processing: SettlementProcessingSummary | null;
  rollback: SettlementRollbackSummary | null;
};

export type SettlementParentDetail = SettlementParentSummary<SettlementParentChildDetail>;

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

async function fetchSettlementJournalEntriesByRegion(input: {
  connection: QboConnection;
  region: 'US' | 'UK';
}): Promise<{ journalEntries: QboJournalEntry[]; updatedConnection: QboConnection }> {
  let activeConnection = input.connection;
  const queryPageSize = 100;
  const journalEntries: QboJournalEntry[] = [];
  let startPosition = 1;

  while (true) {
    const pageResult = await fetchJournalEntries(activeConnection, {
      docNumberContains: `${input.region}-`,
      maxResults: queryPageSize,
      startPosition,
      includeTotalCount: false,
    });
    if (pageResult.updatedConnection) {
      activeConnection = pageResult.updatedConnection;
    }
    journalEntries.push(...pageResult.journalEntries);
    if (pageResult.journalEntries.length < queryPageSize) break;
    startPosition += pageResult.journalEntries.length;
  }

  const dedupedByNormalizedDocNumber = new Map<string, QboJournalEntry>();
  for (const journalEntry of journalEntries) {
    if (!journalEntry.DocNumber) continue;
    if (!isSettlementDocNumber(journalEntry.DocNumber)) continue;
    const normalized = normalizeSettlementDocNumber(journalEntry.DocNumber);
    const existing = dedupedByNormalizedDocNumber.get(normalized);
    if (!existing) {
      dedupedByNormalizedDocNumber.set(normalized, journalEntry);
      continue;
    }
    dedupedByNormalizedDocNumber.set(normalized, pickPreferredSettlementEntry(existing, journalEntry));
  }

  return {
    journalEntries: Array.from(dedupedByNormalizedDocNumber.values()),
    updatedConnection: activeConnection,
  };
}

function buildProcessingMapRows(
  processing: Array<{
    id: string;
    qboSettlementJournalEntryId: string;
    invoiceId: string;
    processingHash: string;
    sourceFilename: string;
    uploadedAt: Date;
    qboCogsJournalEntryId: string;
    qboPnlReclassJournalEntryId: string;
    orderSales: Array<{ id: string }>;
    orderReturns: Array<{ id: string }>;
  }>,
): Map<string, SettlementProcessingSummary> {
  return new Map(
    processing.map((entry) => [
      entry.qboSettlementJournalEntryId,
      {
        id: entry.id,
        invoiceId: entry.invoiceId,
        processingHash: entry.processingHash,
        sourceFilename: entry.sourceFilename,
        uploadedAt: entry.uploadedAt.toISOString(),
        qboCogsJournalEntryId: entry.qboCogsJournalEntryId,
        qboPnlReclassJournalEntryId: entry.qboPnlReclassJournalEntryId,
        orderSalesCount: entry.orderSales.length,
        orderReturnsCount: entry.orderReturns.length,
      },
    ]),
  );
}

function buildRollbackMapRows(
  rollbacks: Array<{
    id: string;
    qboSettlementJournalEntryId: string;
    invoiceId: string;
    processingHash: string;
    sourceFilename: string;
    processedAt: Date;
    rolledBackAt: Date;
    qboCogsJournalEntryId: string;
    qboPnlReclassJournalEntryId: string;
    orderSalesCount: number;
    orderReturnsCount: number;
  }>,
): Map<string, SettlementRollbackSummary> {
  return new Map(
    rollbacks.map((entry) => [
      entry.qboSettlementJournalEntryId,
      {
        id: entry.id,
        invoiceId: entry.invoiceId,
        processingHash: entry.processingHash,
        sourceFilename: entry.sourceFilename,
        processedAt: entry.processedAt.toISOString(),
        rolledBackAt: entry.rolledBackAt.toISOString(),
        qboCogsJournalEntryId: entry.qboCogsJournalEntryId,
        qboPnlReclassJournalEntryId: entry.qboPnlReclassJournalEntryId,
        orderSalesCount: entry.orderSalesCount,
        orderReturnsCount: entry.orderReturnsCount,
      },
    ]),
  );
}

export async function fetchSettlementParentDetail(input: {
  connection: QboConnection;
  region: 'US' | 'UK';
  sourceSettlementId: string;
}): Promise<{
  parent: SettlementParentDetail;
  updatedConnection: QboConnection;
}> {
  const fetched = await fetchSettlementJournalEntriesByRegion({
    connection: input.connection,
    region: input.region,
  });

  const matchingEntries = fetched.journalEntries.filter((journalEntry) => {
    const privateNote = journalEntry.PrivateNote ? journalEntry.PrivateNote : '';
    const sourceSettlementId = extractSourceSettlementIdFromPrivateNote(privateNote);
    return sourceSettlementId === input.sourceSettlementId;
  });

  if (matchingEntries.length === 0) {
    throw new Error(`Parent settlement not found: ${input.region}/${input.sourceSettlementId}`);
  }

  const accountsResult = await fetchAccounts(fetched.updatedConnection, {
    includeInactive: true,
  });

  const activeConnection = accountsResult.updatedConnection ? accountsResult.updatedConnection : fetched.updatedConnection;
  const accountsById = new Map<string, QboAccount>();
  for (const account of accountsResult.accounts) {
    accountsById.set(account.Id, account);
  }

  const journalEntryIds = matchingEntries.map((entry) => entry.Id);

  const processingRows = await db.settlementProcessing.findMany({
    where: { qboSettlementJournalEntryId: { in: journalEntryIds } },
    include: { orderSales: true, orderReturns: true },
  });
  const rollbackRows = await db.settlementRollback.findMany({
    where: { qboSettlementJournalEntryId: { in: journalEntryIds } },
    orderBy: { rolledBackAt: 'desc' },
  });

  const processingByJeId = buildProcessingMapRows(processingRows);
  const rollbackByJeId = buildRollbackMapRows(
    rollbackRows.filter(
      (row, index, arr) =>
        arr.findIndex((candidate) => candidate.qboSettlementJournalEntryId === row.qboSettlementJournalEntryId) === index,
    ),
  );

  const children: SettlementParentChildDetail[] = matchingEntries.map((journalEntry) => {
    if (!journalEntry.DocNumber) {
      throw new Error(`Missing DocNumber on journal entry ${journalEntry.Id}`);
    }

    const meta = parseSettlementDocNumber(journalEntry.DocNumber);
    let plutusStatus: PlutusSettlementStatus = 'Pending';
    if (processingByJeId.has(journalEntry.Id)) {
      plutusStatus = 'Processed';
    } else if (rollbackByJeId.has(journalEntry.Id)) {
      plutusStatus = 'RolledBack';
    }

    return {
      qboJournalEntryId: journalEntry.Id,
      docNumber: meta.normalizedDocNumber,
      postedDate: journalEntry.TxnDate,
      memo: journalEntry.PrivateNote ? journalEntry.PrivateNote : '',
      marketplace: meta.marketplace,
      periodStart: meta.periodStart,
      periodEnd: meta.periodEnd,
      settlementTotal: computeSettlementTotalFromJournalEntry(journalEntry, accountsById),
      plutusStatus,
      lines: journalEntry.Line.map((line) => {
        const accountId = line.JournalEntryLineDetail.AccountRef.value;
        const account = accountsById.get(accountId);

        return {
          id: line.Id,
          description: line.Description ? line.Description : '',
          amount: line.Amount === undefined ? 0 : line.Amount,
          postingType: line.JournalEntryLineDetail.PostingType,
          accountId,
          accountName: account ? account.Name : '',
          accountFullyQualifiedName: account?.FullyQualifiedName,
          accountType: account?.AccountType,
        };
      }),
      processing: processingByJeId.get(journalEntry.Id) ?? null,
      rollback: rollbackByJeId.get(journalEntry.Id) ?? null,
    };
  });

  const grouped = groupSettlementChildren(children);
  const parent = grouped.find(
    (candidate) =>
      candidate.marketplace.region === input.region && candidate.sourceSettlementId === input.sourceSettlementId,
  );

  if (!parent) {
    throw new Error(`Failed to build parent settlement for ${input.region}/${input.sourceSettlementId}`);
  }

  return {
    parent,
    updatedConnection: activeConnection,
  };
}

export async function resolveParentRouteForSettlementJournalEntry(input: {
  connection: QboConnection;
  settlementJournalEntryId: string;
}): Promise<{
  region: 'US' | 'UK';
  sourceSettlementId: string;
  updatedConnection: QboConnection;
}> {
  const jeResult = await fetchJournalEntryById(input.connection, input.settlementJournalEntryId);
  const journalEntry = jeResult.journalEntry;
  if (!journalEntry.DocNumber) {
    throw new Error(`Missing DocNumber on journal entry ${journalEntry.Id}`);
  }

  const meta = parseSettlementDocNumber(journalEntry.DocNumber);
  const sourceSettlementId = extractSourceSettlementIdFromPrivateNote(journalEntry.PrivateNote ? journalEntry.PrivateNote : '');
  if (!sourceSettlementId) {
    throw new Error(`Missing source settlement id on journal entry ${journalEntry.Id}`);
  }

  return {
    region: meta.marketplace.region,
    sourceSettlementId,
    updatedConnection: jeResult.updatedConnection ? jeResult.updatedConnection : input.connection,
  };
}
