import { createLogger } from '@targon/logger';

import { db } from '@/lib/db';
import { fromCents } from '@/lib/inventory/money';
import type { LmbAuditRow } from '@/lib/lmb/audit-csv';
import { parseLmbSettlementDocNumber } from '@/lib/lmb/settlements';
import { processSettlement } from '@/lib/plutus/settlement-processing';
import {
  fetchJournalEntries,
  QboAuthError,
  type QboConnection,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import {
  normalizeAuditMarketToMarketplaceId,
  selectAuditInvoiceForSettlement,
  type AuditInvoiceSummary,
  type MarketplaceId,
} from '@/lib/plutus/audit-invoice-matching';

const logger = createLogger({ name: 'plutus-autopost-check' });

export class AutopostError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type AutopostResult = {
  processed: Array<{ settlementId: string; docNumber: string; invoiceId: string }>;
  skipped: Array<{ settlementId: string; docNumber: string; reason: string }>;
  errors: Array<{ settlementId: string; docNumber: string; error: string }>;
};

type AuditInvoiceRowSummary = {
  invoiceId: string;
  marketplaceId: string | null;
  rowCount: bigint;
  minDate: string;
  maxDate: string;
  markets: string[];
};

function invoiceKey(input: { marketplace: MarketplaceId; invoiceId: string }): string {
  return `${input.marketplace}:${input.invoiceId}`;
}

async function fetchAuditInvoiceSummaries(): Promise<AuditInvoiceSummary[]> {
  const rows = await db.$queryRaw<AuditInvoiceRowSummary[]>`
    SELECT "invoiceId",
           CASE
             WHEN LOWER("market") = 'us' OR LOWER("market") LIKE '%amazon.com%' THEN 'amazon.com'
             WHEN LOWER("market") = 'uk' OR LOWER("market") LIKE '%amazon.co.uk%' THEN 'amazon.co.uk'
             ELSE NULL
           END AS "marketplaceId",
           COUNT(*)::bigint AS "rowCount",
           MIN("date") AS "minDate",
           MAX("date") AS "maxDate",
           ARRAY_AGG(DISTINCT "market") AS "markets"
    FROM plutus."AuditDataRow"
    GROUP BY "invoiceId", "marketplaceId"
    ORDER BY "invoiceId", "marketplaceId"
  `;

  return rows.map((r) => {
    if (r.marketplaceId !== 'amazon.com' && r.marketplaceId !== 'amazon.co.uk') {
      throw new Error(`Unrecognized audit marketplace: ${r.marketplaceId === null ? 'null' : r.marketplaceId}`);
    }
    return {
      invoiceId: r.invoiceId,
      marketplace: r.marketplaceId as MarketplaceId,
      rowCount: Number(r.rowCount),
      minDate: r.minDate,
      maxDate: r.maxDate,
      markets: r.markets,
    };
  });
}

async function fetchProcessedInvoiceKeys(): Promise<Set<string>> {
  const processed = await db.settlementProcessing.findMany({
    select: { marketplace: true, invoiceId: true },
  });

  return new Set(processed.map((p) => invoiceKey({ marketplace: p.marketplace as MarketplaceId, invoiceId: p.invoiceId })));
}

async function loadAuditRowsForInvoice(input: {
  invoiceId: string;
  marketplace: MarketplaceId;
}): Promise<{ rows: LmbAuditRow[]; sourceFilename: string } | null> {
  const dbRows = await db.auditDataRow.findMany({
    where: { invoiceId: input.invoiceId },
    include: { upload: { select: { filename: true } } },
  });

  if (dbRows.length === 0) return null;

  const scoped = dbRows.filter((r) => normalizeAuditMarketToMarketplaceId(r.market) === input.marketplace);
  if (scoped.length === 0) {
    return null;
  }

  const rows: LmbAuditRow[] = scoped.map((r) => ({
    invoice: r.invoiceId,
    market: r.market,
    date: r.date,
    orderId: r.orderId,
    sku: r.sku,
    quantity: r.quantity,
    description: r.description,
    net: fromCents(r.net),
  }));

  const sourceFilename = scoped[0]!.upload.filename;
  return { rows, sourceFilename };
}

async function fetchAllLmbSettlementJournalEntries(input: {
  connection: QboConnection;
  startDate?: string;
}): Promise<{
  journalEntries: Array<{ Id: string; DocNumber?: string; TxnDate: string }>;
  updatedConnection?: QboConnection;
}> {
  let activeConnection = input.connection;

  const pageSize = 100;
  let startPosition = 1;
  let allJournalEntries: Array<{ Id: string; DocNumber?: string; TxnDate: string }> = [];

  while (true) {
    const result = await fetchJournalEntries(activeConnection, {
      docNumberContains: 'LMB-',
      maxResults: pageSize,
      startPosition,
      startDate: input.startDate,
    });

    if (result.updatedConnection) {
      activeConnection = result.updatedConnection;
    }

    allJournalEntries = allJournalEntries.concat(result.journalEntries);

    if (allJournalEntries.length >= result.totalCount) break;
    if (result.journalEntries.length === 0) break;
    startPosition += result.journalEntries.length;
  }

  return {
    journalEntries: allJournalEntries,
    updatedConnection: activeConnection === input.connection ? undefined : activeConnection,
  };
}

function formatMatchSkipReason(input: {
  docNumber: string;
  matchKind: 'missing_period' | 'none' | 'ambiguous';
  matchType?: 'contained' | 'overlap';
  candidates?: string[];
}): string {
  if (input.matchKind === 'missing_period') {
    return `Cannot infer settlement period from DocNumber (${input.docNumber})`;
  }

  if (input.matchKind === 'none') {
    return 'No stored audit data matches this settlement period';
  }

  const candidates = input.candidates ? input.candidates.join(', ') : '';
  const matchType = input.matchType ? input.matchType : 'overlap';
  return `Multiple audit invoices match (${matchType}): ${candidates}`;
}

export async function runAutopostCheck(): Promise<AutopostResult> {
  const config = await db.setupConfig.findFirst();
  if (!config || config.autopostEnabled !== true) {
    throw new AutopostError('Autopost is not enabled', 400);
  }

  const connection = await getQboConnection();
  if (!connection) {
    throw new AutopostError('Not connected to QBO', 401);
  }

  const startDate = config.autopostStartDate ? config.autopostStartDate.toISOString().slice(0, 10) : undefined;

  const { journalEntries, updatedConnection } = await fetchAllLmbSettlementJournalEntries({
    connection,
    startDate,
  });

  // Find which settlements are already processed
  const processedJeIds = await db.settlementProcessing.findMany({
    where: { qboSettlementJournalEntryId: { in: journalEntries.map((je) => je.Id) } },
    select: { qboSettlementJournalEntryId: true },
  });
  const processedJeSet = new Set(processedJeIds.map((p) => p.qboSettlementJournalEntryId));

  const unprocessedSettlements = journalEntries.filter((je) => !processedJeSet.has(je.Id));

  const [allInvoices, processedInvoiceKeys] = await Promise.all([
    fetchAuditInvoiceSummaries(),
    fetchProcessedInvoiceKeys(),
  ]);

  const invoices = allInvoices.filter((inv) => !processedInvoiceKeys.has(invoiceKey(inv)));

  const result: AutopostResult = { processed: [], skipped: [], errors: [] };

  let activeConnection: QboConnection = updatedConnection ? updatedConnection : connection;

  for (const settlement of unprocessedSettlements) {
    const docNumber = settlement.DocNumber ? settlement.DocNumber : settlement.Id;

    if (config.autopostStartDate) {
      const settlementDate = new Date(`${settlement.TxnDate}T00:00:00Z`);
      if (settlementDate < config.autopostStartDate) {
        result.skipped.push({ settlementId: settlement.Id, docNumber, reason: 'Before autopost start date' });
        continue;
      }
    }

    if (!settlement.DocNumber) {
      result.skipped.push({ settlementId: settlement.Id, docNumber, reason: 'Missing DocNumber on settlement JE' });
      continue;
    }

    let marketplace: MarketplaceId;
    let periodStart: string | null;
    let periodEnd: string | null;
    try {
      const meta = parseLmbSettlementDocNumber(settlement.DocNumber);
      marketplace = meta.marketplace.id;
      periodStart = meta.periodStart;
      periodEnd = meta.periodEnd;
    } catch (error) {
      result.skipped.push({
        settlementId: settlement.Id,
        docNumber,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const match = selectAuditInvoiceForSettlement({
      settlementMarketplace: marketplace,
      settlementPeriodStart: periodStart,
      settlementPeriodEnd: periodEnd,
      invoices,
    });

    if (match.kind !== 'match') {
      if (match.kind === 'ambiguous') {
        result.skipped.push({
          settlementId: settlement.Id,
          docNumber,
          reason: formatMatchSkipReason({
            docNumber: settlement.DocNumber,
            matchKind: 'ambiguous',
            matchType: match.matchType,
            candidates: match.candidateInvoiceIds,
          }),
        });
        continue;
      }

      result.skipped.push({
        settlementId: settlement.Id,
        docNumber,
        reason: formatMatchSkipReason({
          docNumber: settlement.DocNumber,
          matchKind: match.kind,
        }),
      });
      continue;
    }

    const invoiceId = match.invoiceId;

    const stored = await loadAuditRowsForInvoice({ invoiceId, marketplace });
    if (!stored) {
      result.skipped.push({ settlementId: settlement.Id, docNumber, reason: `No stored audit data found for invoice ${invoiceId}` });
      continue;
    }

    try {
      const processResult = await processSettlement({
        connection: activeConnection,
        settlementJournalEntryId: settlement.Id,
        auditRows: stored.rows,
        sourceFilename: stored.sourceFilename,
        invoiceId,
      });

      if (processResult.updatedConnection) {
        activeConnection = processResult.updatedConnection;
      }

      if (processResult.result.ok) {
        result.processed.push({ settlementId: settlement.Id, docNumber, invoiceId });
      } else {
        const blockMessages = processResult.result.preview.blocks.map((b) => b.message).join('; ');
        result.skipped.push({ settlementId: settlement.Id, docNumber, reason: blockMessages });
      }
    } catch (error) {
      if (error instanceof QboAuthError) {
        throw error;
      }
      result.errors.push({
        settlementId: settlement.Id,
        docNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (activeConnection !== connection) {
    await saveServerQboConnection(activeConnection);
  }

  logger.info('Autopost check complete', {
    processed: result.processed.length,
    skipped: result.skipped.length,
    errors: result.errors.length,
  });

  return result;
}
