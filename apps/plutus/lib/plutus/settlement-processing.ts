import type { QboConnection } from '@/lib/qbo/api';
import {
  createJournalEntry,
  deleteJournalEntry,
  fetchJournalEntryById,
  fetchPreferences,
} from '@/lib/qbo/api';
import { db } from '@/lib/db';
import { buildNoopJournalEntryId } from '@/lib/plutus/journal-entry-id';
import { parseSettlementDocNumber } from '@/lib/plutus/settlement-doc-number';
import { normalizeAuditMarketToMarketplaceId } from '@/lib/plutus/audit-invoice-matching';
import { computeProcessingHash, fromCents } from '@/lib/plutus/settlement-utils';

import type { SettlementAuditRow } from './settlement-audit';
import type {
  ProcessingBlock,
  JournalEntryLinePreview,
  JournalEntryPreview,
  SettlementProcessingPreview,
  SettlementProcessingResult,
} from './settlement-types';
import { isBlockingProcessingBlock } from './settlement-types';

// Re-export public types so existing route imports stay stable.
export type {
  ProcessingBlock,
  JournalEntryLinePreview,
  JournalEntryPreview,
  SettlementProcessingPreview,
  SettlementProcessingResult,
} from './settlement-types';

function settlementCurrencyCodeForMarketplace(marketplace: string): 'USD' | 'GBP' {
  if (marketplace === 'amazon.com') return 'USD';
  if (marketplace === 'amazon.co.uk') return 'GBP';
  throw new Error(`Unsupported marketplace for settlement currency: ${marketplace}`);
}

async function resolveExchangeRateForJournalPosting(input: {
  connection: QboConnection;
  txnDate: string;
  currencyCode: 'USD' | 'GBP';
  preferredExchangeRate?: number;
}): Promise<{ exchangeRate?: number; updatedConnection?: QboConnection }> {
  const preferencesResult = await fetchPreferences(input.connection);
  const activeConnection = preferencesResult.updatedConnection ? preferencesResult.updatedConnection : input.connection;

  const homeCurrencyCode = preferencesResult.preferences.CurrencyPrefs?.HomeCurrency?.value
    ? preferencesResult.preferences.CurrencyPrefs.HomeCurrency.value.trim().toUpperCase()
    : '';
  if (!/^[A-Z]{3}$/.test(homeCurrencyCode)) {
    throw new Error('Missing home currency in QBO preferences');
  }

  const txnCurrencyCode = input.currencyCode.trim().toUpperCase();
  if (txnCurrencyCode === homeCurrencyCode) {
    return { updatedConnection: activeConnection === input.connection ? undefined : activeConnection };
  }

  if (input.preferredExchangeRate === undefined) {
    throw new Error(
      `Missing ExchangeRate for ${txnCurrencyCode}->${homeCurrencyCode} posting on ${input.txnDate}. Settlement JE ExchangeRate is required.`,
    );
  }

  if (!Number.isFinite(input.preferredExchangeRate) || input.preferredExchangeRate <= 0) {
    throw new Error(
      `Invalid ExchangeRate for ${txnCurrencyCode}->${homeCurrencyCode} posting on ${input.txnDate}: ${String(input.preferredExchangeRate)}`,
    );
  }

  return {
    exchangeRate: input.preferredExchangeRate,
    updatedConnection: activeConnection === input.connection ? undefined : activeConnection,
  };
}

function buildProcessingDocNumber(kind: 'C' | 'P', invoiceId: string): string {
  const base = `${kind}${invoiceId}`;
  if (base.length <= 21) return base;
  return `${kind}${invoiceId.slice(-20)}`;
}

function buildEmptyPreview(input: {
  marketplace: string;
  settlementJournalEntryId: string;
  settlementDocNumber: string;
  settlementPostedDate: string;
  settlementExchangeRate?: number;
  invoiceId: string;
  processingHash: string;
  minDate: string;
  maxDate: string;
  blocks: ProcessingBlock[];
}): SettlementProcessingPreview {
  const hashPrefix = input.processingHash.slice(0, 10);

  const pnlPreview: JournalEntryPreview = {
    txnDate: input.settlementPostedDate,
    docNumber: buildProcessingDocNumber('P', input.invoiceId),
    privateNote: `Plutus Settlement Bridge | Invoice: ${input.invoiceId} | Hash: ${hashPrefix}`,
    lines: [],
  };

  return {
    marketplace: input.marketplace,
    settlementJournalEntryId: input.settlementJournalEntryId,
    settlementDocNumber: input.settlementDocNumber,
    settlementPostedDate: input.settlementPostedDate,
    settlementExchangeRate: input.settlementExchangeRate,
    invoiceId: input.invoiceId,
    processingHash: input.processingHash,
    minDate: input.minDate,
    maxDate: input.maxDate,
    blocks: input.blocks,
    pnlByBucketBrandCents: {},
    pnlJournalEntry: pnlPreview,
  };
}

function buildAuditNetScaleStats(rows: SettlementAuditRow[]): {
  rowCount: number;
  integerDollarRatio: number;
  medianAbsNet: number;
  p90AbsNet: number;
  maxAbsNet: number;
} {
  if (rows.length === 0) {
    return {
      rowCount: 0,
      integerDollarRatio: 0,
      medianAbsNet: 0,
      p90AbsNet: 0,
      maxAbsNet: 0,
    };
  }

  const absNets = rows.map((row) => Math.abs(row.net)).sort((a, b) => a - b);
  const integerDollarRows = rows.filter((row) => Math.abs(row.net - Math.trunc(row.net)) < 1e-9).length;
  const at = (p: number) => absNets[Math.min(absNets.length - 1, Math.floor((absNets.length - 1) * p))]!;

  return {
    rowCount: rows.length,
    integerDollarRatio: integerDollarRows / rows.length,
    medianAbsNet: at(0.5),
    p90AbsNet: at(0.9),
    maxAbsNet: absNets[absNets.length - 1]!,
  };
}

function isLikelyCentScaledAuditInput(stats: {
  rowCount: number;
  integerDollarRatio: number;
  medianAbsNet: number;
  p90AbsNet: number;
}): boolean {
  if (stats.rowCount < 50) return false;
  if (stats.integerDollarRatio < 0.98) return false;
  return stats.medianAbsNet >= 100 || stats.p90AbsNet >= 300;
}

export async function computeSettlementPreview(input: {
  connection: QboConnection;
  settlementJournalEntryId: string;
  sourceFilename: string;
  invoiceId: string;
  auditRows: SettlementAuditRow[];
  settlementId?: string;
}): Promise<{ preview: SettlementProcessingPreview; updatedConnection?: QboConnection }> {
  const blocks: ProcessingBlock[] = [];

  const settlementResult = await fetchJournalEntryById(input.connection, input.settlementJournalEntryId);
  const settlement = settlementResult.journalEntry;
  if (!settlement.DocNumber) {
    throw new Error(`Missing DocNumber on journal entry ${settlement.Id}`);
  }

  const meta = parseSettlementDocNumber(settlement.DocNumber);
  const marketplace = meta.marketplace.id;
  if (meta.periodStart === null || meta.periodEnd === null) {
    throw new Error(`Missing settlement period in DocNumber ${settlement.DocNumber}`);
  }

  const invoiceId = input.invoiceId.trim();
  if (invoiceId === '') {
    throw new Error('Missing invoiceId');
  }

  for (const row of input.auditRows) {
    if (row.invoiceId !== invoiceId) {
      throw new Error(`All audit rows must have the same invoiceId (${invoiceId})`);
    }

    const rowMarketplace = normalizeAuditMarketToMarketplaceId(row.market);
    if (rowMarketplace === null) {
      throw new Error(`Unrecognized audit row market for invoice ${invoiceId}: ${row.market}`);
    }
    if (rowMarketplace !== marketplace) {
      throw new Error(`Audit row market mismatch for invoice ${invoiceId}: ${row.market}`);
    }
  }

  const scopedInvoiceRows = input.auditRows;
  const hasAuditRows = scopedInvoiceRows.length > 0;
  if (hasAuditRows) {
    const auditNetScaleStats = buildAuditNetScaleStats(scopedInvoiceRows);
    if (isLikelyCentScaledAuditInput(auditNetScaleStats)) {
      blocks.push({
        code: 'AUDIT_NET_SCALE_SUSPECT',
        message: 'Audit row net values appear cent-scaled (100x risk). Posting blocked until source net units are validated.',
        details: {
          rowCount: auditNetScaleStats.rowCount,
          integerDollarRatio: Number(auditNetScaleStats.integerDollarRatio.toFixed(4)),
          medianAbsNet: Number(auditNetScaleStats.medianAbsNet.toFixed(2)),
          p90AbsNet: Number(auditNetScaleStats.p90AbsNet.toFixed(2)),
          maxAbsNet: Number(auditNetScaleStats.maxAbsNet.toFixed(2)),
        },
      });
    }
  }

  const processingHash = computeProcessingHash(scopedInvoiceRows);

  let minDate = hasAuditRows ? scopedInvoiceRows[0]!.date : meta.periodStart;
  let maxDate = hasAuditRows ? scopedInvoiceRows[0]!.date : meta.periodEnd;
  for (const row of scopedInvoiceRows) {
    if (row.date < minDate) minDate = row.date;
    if (row.date > maxDate) maxDate = row.date;
  }

  const existingSettlement = await db.settlementProcessing.findUnique({
    where: { qboSettlementJournalEntryId: input.settlementJournalEntryId },
  });
  if (existingSettlement) {
    blocks.push({
      code: 'ALREADY_PROCESSED',
      message: 'Settlement already processed by Plutus',
      details: {
        settlementProcessingId: existingSettlement.id,
        settlementJournalEntryId: existingSettlement.qboSettlementJournalEntryId,
        cogsJournalEntryId: existingSettlement.qboCogsJournalEntryId,
        pnlJournalEntryId: existingSettlement.qboPnlReclassJournalEntryId,
        invoiceId: existingSettlement.invoiceId,
      },
    });
  }

  const existingInvoice = await db.settlementProcessing.findUnique({
    where: { marketplace_invoiceId: { marketplace, invoiceId } },
  });
  if (existingInvoice) {
    if (existingInvoice.processingHash === processingHash) {
      blocks.push({
        code: 'ALREADY_PROCESSED',
        message: 'Invoice already processed by Plutus',
        details: {
          settlementProcessingId: existingInvoice.id,
          settlementJournalEntryId: existingInvoice.qboSettlementJournalEntryId,
          cogsJournalEntryId: existingInvoice.qboCogsJournalEntryId,
          pnlJournalEntryId: existingInvoice.qboPnlReclassJournalEntryId,
          invoiceId: existingInvoice.invoiceId,
        },
      });
    } else {
      blocks.push({
        code: 'INVOICE_CONFLICT',
        message: 'Invoice exists with different data (hash mismatch)',
        details: {
          settlementProcessingId: existingInvoice.id,
          settlementJournalEntryId: existingInvoice.qboSettlementJournalEntryId,
          cogsJournalEntryId: existingInvoice.qboCogsJournalEntryId,
          pnlJournalEntryId: existingInvoice.qboPnlReclassJournalEntryId,
          invoiceId: existingInvoice.invoiceId,
        },
      });
    }
  }

  return {
    preview: buildEmptyPreview({
      marketplace,
      settlementJournalEntryId: settlement.Id,
      settlementDocNumber: settlement.DocNumber,
      settlementPostedDate: settlement.TxnDate,
      settlementExchangeRate: settlement.ExchangeRate,
      invoiceId,
      processingHash,
      minDate,
      maxDate,
      blocks,
    }),
    updatedConnection: settlementResult.updatedConnection,
  };
}

export async function processSettlement(input: {
  connection: QboConnection;
  settlementJournalEntryId: string;
  sourceFilename: string;
  invoiceId: string;
  auditRows: SettlementAuditRow[];
  settlementId?: string;
}): Promise<{ result: SettlementProcessingResult; updatedConnection?: QboConnection }> {
  const computed = await computeSettlementPreview(input);
  const blockingBlocks = computed.preview.blocks.filter((block) => isBlockingProcessingBlock(block));
  if (blockingBlocks.length > 0) {
    return { result: { ok: false, preview: computed.preview }, updatedConnection: computed.updatedConnection };
  }

  const settlementCurrencyCode = settlementCurrencyCodeForMarketplace(computed.preview.marketplace);
  let postingConnection = computed.updatedConnection ? computed.updatedConnection : input.connection;
  let activeConnection = computed.updatedConnection;

  const postingRate = await resolveExchangeRateForJournalPosting({
    connection: postingConnection,
    txnDate: computed.preview.settlementPostedDate,
    currencyCode: settlementCurrencyCode,
    preferredExchangeRate: computed.preview.settlementExchangeRate,
  });
  if (postingRate.updatedConnection) {
    postingConnection = postingRate.updatedConnection;
    activeConnection = postingRate.updatedConnection;
  }

  const cogsJournalEntryId = buildNoopJournalEntryId('COGS', computed.preview.invoiceId);

  let pnlJournalEntryId = buildNoopJournalEntryId('PNL', computed.preview.invoiceId);
  const noopPnlJournalEntryId = pnlJournalEntryId;
  if (computed.preview.pnlJournalEntry.lines.length > 0) {
    const pnl = await createJournalEntry(postingConnection, {
      txnDate: computed.preview.pnlJournalEntry.txnDate,
      docNumber: computed.preview.pnlJournalEntry.docNumber,
      privateNote: computed.preview.pnlJournalEntry.privateNote,
      currencyCode: settlementCurrencyCode,
      exchangeRate: postingRate.exchangeRate,
      lines: computed.preview.pnlJournalEntry.lines.map((line) => ({
        amount: fromCents(line.amountCents),
        postingType: line.postingType,
        accountId: line.accountId,
        description: line.description,
      })),
    });

    pnlJournalEntryId = pnl.journalEntry.Id;
    if (pnl.updatedConnection) {
      activeConnection = pnl.updatedConnection;
    }
  }

  try {
    await db.$transaction(async (tx) => {
      const existingSettlement = await tx.settlementProcessing.findUnique({
        where: { qboSettlementJournalEntryId: computed.preview.settlementJournalEntryId },
      });
      if (existingSettlement) {
        throw new Error(`Settlement already processed: ${existingSettlement.id}`);
      }

      const existingInvoice = await tx.settlementProcessing.findUnique({
        where: {
          marketplace_invoiceId: {
            marketplace: computed.preview.marketplace,
            invoiceId: computed.preview.invoiceId,
          },
        },
      });
      if (existingInvoice) {
        throw new Error(`Invoice already processed: ${existingInvoice.id}`);
      }

      await tx.settlementProcessing.create({
        data: {
          marketplace: computed.preview.marketplace,
          qboSettlementJournalEntryId: computed.preview.settlementJournalEntryId,
          settlementDocNumber: computed.preview.settlementDocNumber,
          settlementPostedDate: new Date(`${computed.preview.settlementPostedDate}T00:00:00Z`),
          invoiceId: computed.preview.invoiceId,
          processingHash: computed.preview.processingHash,
          sourceFilename: input.sourceFilename,
          qboCogsJournalEntryId: cogsJournalEntryId,
          qboPnlReclassJournalEntryId: pnlJournalEntryId,
        },
      });
    });
  } catch (error) {
    let cleanupConnection = activeConnection ? activeConnection : postingConnection;
    const cleanupErrors: string[] = [];

    if (pnlJournalEntryId !== noopPnlJournalEntryId) {
      try {
        const deleted = await deleteJournalEntry(cleanupConnection, pnlJournalEntryId);
        if (deleted.updatedConnection) {
          cleanupConnection = deleted.updatedConnection;
        }
      } catch (cleanupError) {
        cleanupErrors.push(
          cleanupError instanceof Error
            ? `Failed to delete P&L JE ${pnlJournalEntryId}: ${cleanupError.message}`
            : `Failed to delete P&L JE ${pnlJournalEntryId}: ${String(cleanupError)}`,
        );
      }
    }

    if (cleanupErrors.length > 0) {
      const originalMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to persist settlement processing: ${originalMessage}. Cleanup failed: ${cleanupErrors.join(' | ')}`,
      );
    }

    throw error;
  }

  return {
    result: {
      ok: true,
      preview: computed.preview,
      posted: {
        pnlJournalEntryId,
      },
    },
    updatedConnection: activeConnection,
  };
}
