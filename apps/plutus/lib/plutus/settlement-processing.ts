import type { QboAccount, QboBill, QboConnection } from '@/lib/qbo/api';
import { createJournalEntry, deleteJournalEntry, fetchAccounts, fetchBills, fetchJournalEntryById } from '@/lib/qbo/api';
import { parseSettlementDocNumber } from '@/lib/plutus/settlement-doc-number';
import { parseQboBillsToInventoryEvents, buildInventoryEventsFromMappings, type InventoryAccountMappings, type ParsedBills } from '@/lib/inventory/qbo-bills';
import {
  replayInventoryLedger,
  type LedgerBlock,
  type SaleCost,
} from '@/lib/inventory/ledger';
import { fromCents } from '@/lib/inventory/money';
import { computePnlAllocation } from '@/lib/pnl-allocation';
import { db } from '@/lib/db';
import { buildNoopJournalEntryId } from '@/lib/plutus/journal-entry-id';
import { normalizeAuditMarketToMarketplaceId } from '@/lib/plutus/audit-invoice-matching';
import {
  buildDeterministicSkuAllocations,
  deterministicSourceGuidanceForBucket,
} from '@/lib/plutus/fee-allocation';

import {
  normalizeSku,
  dateToIsoDay,
  computeProcessingHash,
  isSalePrincipal,
  isRefundPrincipal,
  buildPrincipalGroups,
  requireAccountMapping,
  matchRefundsToSales,
  sumCentsByBrandComponent,
  sumCentsByBrandComponentSku,
  mergeBrandComponentCents,
  mergeBrandComponentSkuCents,
} from './settlement-validation';
import type { SettlementAuditRow } from './settlement-audit';

import { buildCogsJournalLines, buildPnlJournalLines } from './journal-builder';
import {
  buildBillMappingPullSyncUpdates,
  type BillMappingPullSyncCandidate,
} from './bills/pull-sync';

import type {
  ProcessingBlock,
  ProcessingSale,
  KnownLedgerEvent,
  JournalEntryPreview,
  SettlementProcessingPreview,
  SettlementProcessingResult,
} from './settlement-types';
import { isBlockingProcessingBlock } from './settlement-types';

// Re-export all public types so existing imports from this file continue to work
export type {
  ProcessingBlock,
  JournalEntryLinePreview,
  JournalEntryPreview,
  SettlementProcessingPreview,
  SettlementProcessingResult,
} from './settlement-types';

const COGS_DISABLED_MARKETPLACES = new Set(['amazon.co.uk']);

function isCogsEnabledForMarketplace(marketplace: string): boolean {
  return COGS_DISABLED_MARKETPLACES.has(marketplace) === false;
}

function settlementCurrencyCodeForMarketplace(marketplace: string): 'USD' | 'GBP' {
  if (marketplace === 'amazon.com') return 'USD';
  if (marketplace === 'amazon.co.uk') return 'GBP';
  throw new Error(`Unsupported marketplace for settlement currency: ${marketplace}`);
}

function buildProcessingDocNumber(kind: 'C' | 'P', invoiceId: string): string {
  const base = `${kind}${invoiceId}`;
  if (base.length <= 21) {
    return base;
  }
  return `${kind}${invoiceId.slice(-20)}`;
}

function buildEmptyPreview(input: {
  marketplace: string;
  settlementJournalEntryId: string;
  settlementDocNumber: string;
  settlementPostedDate: string;
  invoiceId: string;
  processingHash: string;
  minDate: string;
  maxDate: string;
  blocks: ProcessingBlock[];
}): SettlementProcessingPreview {
  const hashPrefix = input.processingHash.slice(0, 10);

  const cogsPreview: JournalEntryPreview = {
    txnDate: input.settlementPostedDate,
    docNumber: buildProcessingDocNumber('C', input.invoiceId),
    privateNote: `Plutus COGS | Invoice: ${input.invoiceId} | Hash: ${hashPrefix}`,
    lines: [],
  };

  const pnlPreview: JournalEntryPreview = {
    txnDate: input.settlementPostedDate,
    docNumber: buildProcessingDocNumber('P', input.invoiceId),
    privateNote: `Plutus P&L Reclass | Invoice: ${input.invoiceId} | Hash: ${hashPrefix}`,
    lines: [],
  };

  return {
    marketplace: input.marketplace,
    settlementJournalEntryId: input.settlementJournalEntryId,
    settlementDocNumber: input.settlementDocNumber,
    settlementPostedDate: input.settlementPostedDate,
    invoiceId: input.invoiceId,
    processingHash: input.processingHash,
    minDate: input.minDate,
    maxDate: input.maxDate,
    blocks: input.blocks,
    sales: [],
    returns: [],
    cogsByBrandComponentCents: {},
    pnlByBucketBrandCents: {},
    cogsJournalEntry: cogsPreview,
    pnlJournalEntry: pnlPreview,
  };
}

function summarizeLedgerBlocks(blocks: LedgerBlock[]): LedgerBlock[] {
  const missingCostBasisBySku = new Map<string, number>();
  const result: LedgerBlock[] = [];

  for (const block of blocks) {
    if (block.code !== 'MISSING_COST_BASIS') {
      result.push(block);
      continue;
    }

    const details = block.details;
    const skuValue = details ? details.sku : undefined;
    const sku = typeof skuValue === 'string' ? skuValue : '';
    if (sku === '') {
      result.push(block);
      continue;
    }

    const current = missingCostBasisBySku.get(sku);
    missingCostBasisBySku.set(sku, (current === undefined ? 0 : current) + 1);
  }

  const entries = Array.from(missingCostBasisBySku.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });

  const limit = 200;
  if (entries.length > limit) {
    result.push({
      code: 'MISSING_COST_BASIS',
      message: `Missing cost basis for ${entries.length} SKUs (showing top ${limit} by count)`,
      details: { skuCount: entries.length, shown: limit },
    });
  }

  for (const [sku, count] of entries.slice(0, limit)) {
    result.push({
      code: 'MISSING_COST_BASIS',
      message: 'No on-hand inventory / cost basis for SKU',
      details: { sku, occurrences: count },
    });
  }

  return result;
}

function summarizeRefundAdjustmentBlocks(blocks: ProcessingBlock[]): ProcessingBlock[] {
  const matching = blocks.filter((block) => block.code === 'REFUND_ADJUSTMENT');
  const threshold = 10;
  if (matching.length <= threshold) {
    return blocks;
  }

  const countBySku = new Map<string, number>();
  const uniqueKeys = new Set<string>();
  const examples: string[] = [];

  for (const block of matching) {
    const details = block.details;
    const skuValue = details ? details.sku : undefined;
    const sku = typeof skuValue === 'string' ? skuValue : '';
    if (sku !== '') {
      const current = countBySku.get(sku);
      countBySku.set(sku, (current === undefined ? 0 : current) + 1);
    }

    const orderIdValue = details ? details.orderId : undefined;
    const orderId = typeof orderIdValue === 'string' ? orderIdValue : '';
    const key = orderId !== '' && sku !== '' ? `${orderId}::${sku}` : '';
    if (key !== '' && !uniqueKeys.has(key)) {
      uniqueKeys.add(key);
      if (examples.length < 10) {
        examples.push(key);
      }
    }
  }

  const skuBreakdown = Array.from(countBySku.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 8)
    .map(([sku, count]) => `${sku}=${count}`)
    .join(', ');

  const exampleList = examples.length === 0 ? '' : examples.join(', ');

  const summaryBlock: ProcessingBlock = {
    code: 'REFUND_ADJUSTMENT',
    message: `Refund exceeds remaining sale quantity for ${matching.length} order lines; treated as a financial adjustment (no additional inventory return)`,
    details: {
      count: matching.length,
      uniqueOrderSkuPairs: uniqueKeys.size,
      ...(skuBreakdown !== '' ? { skuBreakdown } : {}),
      ...(exampleList !== '' ? { examples: exampleList } : {}),
    },
  };

  const summarized: ProcessingBlock[] = [];
  let insertedSummary = false;
  for (const block of blocks) {
    if (block.code !== 'REFUND_ADJUSTMENT') {
      summarized.push(block);
      continue;
    }

    if (!insertedSummary) {
      summarized.push(summaryBlock);
      insertedSummary = true;
    }
  }

  return summarized;
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
}): Promise<{ preview: SettlementProcessingPreview; updatedConnection?: QboConnection }> {
  const blocks: ProcessingBlock[] = [];

  const settlementResult = await fetchJournalEntryById(input.connection, input.settlementJournalEntryId);
  const settlement = settlementResult.journalEntry;
  if (!settlement.DocNumber) {
    throw new Error(`Missing DocNumber on journal entry ${settlement.Id}`);
  }

  const meta = parseSettlementDocNumber(settlement.DocNumber);
  const marketplace = meta.marketplace.id;
  const cogsEnabled = isCogsEnabledForMarketplace(marketplace);

  const invoiceId = input.invoiceId.trim();
  if (invoiceId === '') {
    throw new Error('Missing invoiceId');
  }

  if (input.auditRows.length === 0) {
    throw new Error(`No audit rows provided for invoice ${invoiceId}`);
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

  const processingHash = computeProcessingHash(scopedInvoiceRows);

  let minDate = scopedInvoiceRows[0]?.date;
  let maxDate = scopedInvoiceRows[0]?.date;
  for (const row of scopedInvoiceRows) {
    if (minDate === undefined || row.date < minDate) minDate = row.date;
    if (maxDate === undefined || row.date > maxDate) maxDate = row.date;
  }
  if (minDate === undefined || maxDate === undefined) {
    throw new Error('Audit file has no rows');
  }

  const existingSettlement = await db.settlementProcessing.findUnique({
    where: { qboSettlementJournalEntryId: input.settlementJournalEntryId },
  });
  const excludeSettlementProcessingId = existingSettlement ? existingSettlement.id : null;
  const historicalProcessingCutoff = existingSettlement ? existingSettlement.uploadedAt : null;
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

  const hasInvoiceConflict = blocks.some((b) => b.code === 'INVOICE_CONFLICT');
  if (hasInvoiceConflict) {
    return {
      preview: buildEmptyPreview({
        marketplace,
        settlementJournalEntryId: settlement.Id,
        settlementDocNumber: settlement.DocNumber,
        settlementPostedDate: settlement.TxnDate,
        invoiceId,
        processingHash,
        minDate,
        maxDate,
        blocks,
      }),
      updatedConnection: settlementResult.updatedConnection,
    };
  }

  const setupConfig = await db.setupConfig.findFirst();
  if (!setupConfig || setupConfig.accountsCreated !== true) {
    blocks.push({
      code: 'MISSING_SETUP',
      message: 'Setup is incomplete. Complete Accounts mapping + sub-account creation first.',
    });
  }

  const requiredMappingKeys = [
    'amazonSellerFees',
    'amazonFbaFees',
    'amazonStorageFees',
    'amazonAdvertisingCosts',
    'amazonPromotions',
    'amazonFbaInventoryReimbursement',
    'warehousingAwd',
  ];
  if (cogsEnabled) {
    requiredMappingKeys.unshift(
      'invManufacturing',
      'invFreight',
      'invDuty',
      'invMfgAccessories',
      'cogsManufacturing',
      'cogsFreight',
      'cogsDuty',
      'cogsMfgAccessories',
    );
  }

  const mapping: Record<string, string | undefined> = {};
  if (setupConfig) {
    for (const key of requiredMappingKeys) {
      try {
        mapping[key] = requireAccountMapping(setupConfig, key);
      } catch {
        blocks.push({
          code: 'MISSING_ACCOUNT_MAPPING',
          message: `Missing required account mapping: ${key}`,
        });
      }
    }
  }

  const skuRows = await db.sku.findMany({ include: { brand: true } });
  const skuToBrand = new Map<string, string>();

  for (const row of skuRows) {
    if (row.brand.marketplace !== marketplace) continue;

    const sku = normalizeSku(row.sku);
    const existing = skuToBrand.get(sku);
    if (existing !== undefined && existing !== row.brand.name) {
      throw new Error(`SKU maps to multiple brands in same marketplace: ${sku}`);
    }
    skuToBrand.set(sku, row.brand.name);
  }

  const missingSkus: string[] = [];
  const uniqueSkus = new Set<string>();
  for (const row of scopedInvoiceRows) {
    const raw = row.sku.trim();
    if (raw === '') continue;
    uniqueSkus.add(normalizeSku(raw));
  }
  for (const sku of uniqueSkus) {
    if (!skuToBrand.has(sku)) missingSkus.push(sku);
  }
  missingSkus.sort();
  for (const sku of missingSkus) {
    blocks.push({ code: 'MISSING_SKU_MAPPING', message: 'SKU not mapped to a brand', details: { sku } });
  }

  const prereqCodes = new Set(['MISSING_SETUP', 'MISSING_ACCOUNT_MAPPING', 'MISSING_SKU_MAPPING']);
  const hasPrereqBlock = blocks.some((b) => prereqCodes.has(b.code));
  if (hasPrereqBlock) {
    return {
      preview: buildEmptyPreview({
        marketplace,
        settlementJournalEntryId: settlement.Id,
        settlementDocNumber: settlement.DocNumber,
        settlementPostedDate: settlement.TxnDate,
        invoiceId,
        processingHash,
        minDate,
        maxDate,
        blocks,
      }),
      updatedConnection: settlementResult.updatedConnection,
    };
  }

  const accountsResult = await fetchAccounts(settlementResult.updatedConnection ? settlementResult.updatedConnection : input.connection, {
    includeInactive: true,
  });

  const accountsById = new Map<string, QboAccount>();
  for (const account of accountsResult.accounts) accountsById.set(account.Id, account);

  let billsConnection =
    accountsResult.updatedConnection
      ? accountsResult.updatedConnection
      : settlementResult.updatedConnection
        ? settlementResult.updatedConnection
        : input.connection;

  let inventoryMappings: InventoryAccountMappings | null = null;
  if (cogsEnabled) {
    const invManufacturing = mapping.invManufacturing;
    if (!invManufacturing) throw new Error('Missing invManufacturing mapping');
    const invFreight = mapping.invFreight;
    if (!invFreight) throw new Error('Missing invFreight mapping');
    const invDuty = mapping.invDuty;
    if (!invDuty) throw new Error('Missing invDuty mapping');
    const invMfgAccessories = mapping.invMfgAccessories;
    if (!invMfgAccessories) throw new Error('Missing invMfgAccessories mapping');

    inventoryMappings = {
      invManufacturing,
      invFreight,
      invDuty,
      invMfgAccessories,
    };
  }

  // Bill sources:
  // - QBO bills parsing (best-effort, relies on memo/description conventions)
  // - Plutus bill mappings (authoritative for mapped bills)
  //
  // Important: we must NOT ignore QBO bills just because *some* mappings exist, otherwise a single mapped
  // warehousing/expense bill can accidentally wipe out inventory cost basis from all other QBO bills.
  function mergeParsedBills(a: ParsedBills, b: ParsedBills): ParsedBills {
    const poUnitsBySku = new Map<string, Map<string, number>>();

    function mergePoUnits(source: Map<string, Map<string, number>>) {
      for (const [poNumber, skuUnits] of source.entries()) {
        const existing = poUnitsBySku.get(poNumber);
        if (!existing) {
          poUnitsBySku.set(poNumber, new Map(skuUnits));
          continue;
        }

        for (const [sku, units] of skuUnits.entries()) {
          const current = existing.get(sku);
          existing.set(sku, (current === undefined ? 0 : current) + units);
        }
      }
    }

    mergePoUnits(a.poUnitsBySku);
    mergePoUnits(b.poUnitsBySku);

    const events = [...a.events, ...b.events];
    events.sort((x, y) => {
      if (x.date !== y.date) return x.date.localeCompare(y.date);
      if (x.kind !== y.kind) return x.kind === 'manufacturing' ? -1 : 1;
      return 0;
    });

    return { events, poUnitsBySku };
  }

  const plutusMappings = cogsEnabled
    ? await db.billMapping.findMany({
        where: {
          brand: {
            marketplace,
          },
        },
        include: { lines: true },
      })
    : [];

  const mappedBillIds = new Set(plutusMappings.map((m) => m.qboBillId));

  // QBO Bills -> Inventory events (only inventory-account lines are used)
  let parsedBillsFromMappings: ParsedBills = { events: [], poUnitsBySku: new Map() };
  let parsedBillsFromQbo: ParsedBills = { events: [], poUnitsBySku: new Map() };
  let allBills: QboBill[] = [];

  if (cogsEnabled) {
    try {
      let startPosition = 1;
      const pageSize = 100;

      while (true) {
        const page = await fetchBills(billsConnection, { endDate: maxDate, maxResults: pageSize, startPosition });
        if (page.updatedConnection) {
          billsConnection = page.updatedConnection;
        }

        allBills = allBills.concat(page.bills);

        if (allBills.length >= page.totalCount) break;
        if (page.bills.length === 0) break;

        startPosition += page.bills.length;
      }
    } catch (error) {
      blocks.push({
        code: 'BILLS_FETCH_ERROR',
        message: 'Failed to fetch bills from QBO',
        details: { error: error instanceof Error ? error.message : String(error) },
      });
      allBills = [];
    }

    if (plutusMappings.length > 0 && allBills.length > 0) {
      const billsById = new Map(allBills.map((bill) => [bill.Id, bill]));
      const pullSyncUpdates = buildBillMappingPullSyncUpdates(
        plutusMappings as BillMappingPullSyncCandidate[],
        billsById,
      );

      if (pullSyncUpdates.length > 0) {
        const syncedAt = new Date();
        await db.$transaction(
          pullSyncUpdates.map((update) =>
            db.billMapping.update({
              where: { id: update.id },
              data: {
                poNumber: update.poNumber,
                billDate: update.billDate,
                vendorName: update.vendorName,
                totalAmount: update.totalAmount,
                syncedAt,
              },
            }),
          ),
        );

        const mappingByBillId = new Map(plutusMappings.map((mapping) => [mapping.qboBillId, mapping]));
        for (const update of pullSyncUpdates) {
          const existing = mappingByBillId.get(update.qboBillId);
          if (!existing) continue;
          existing.poNumber = update.poNumber;
          existing.billDate = update.billDate;
          existing.vendorName = update.vendorName;
          existing.totalAmount = update.totalAmount;
          existing.syncedAt = syncedAt;
        }
      }
    }

    if (plutusMappings.length > 0) {
      try {
        parsedBillsFromMappings = buildInventoryEventsFromMappings(plutusMappings);
      } catch (error) {
        blocks.push({
          code: 'BILLS_PARSE_ERROR',
          message: 'Failed to build inventory events from bill mappings',
          details: { error: error instanceof Error ? error.message : String(error) },
        });
        parsedBillsFromMappings = { events: [], poUnitsBySku: new Map() };
      }
    }

    try {
      if (inventoryMappings === null) throw new Error('Missing inventory mappings');
      const unmappedBills = allBills.filter((b) => !mappedBillIds.has(b.Id));
      parsedBillsFromQbo = parseQboBillsToInventoryEvents(unmappedBills, accountsById, inventoryMappings, marketplace);
    } catch (error) {
      blocks.push({
        code: 'BILLS_PARSE_ERROR',
        message: 'Failed to parse bills into inventory events',
        details: { error: error instanceof Error ? error.message : String(error) },
      });
      parsedBillsFromQbo = { events: [], poUnitsBySku: new Map() };
    }
  }

  const parsedBills = mergeParsedBills(parsedBillsFromQbo, parsedBillsFromMappings);

  // Build brand resolver for P&L allocation
  const brandResolver = {
    getBrandForSku: (skuRaw: string) => {
      const sku = normalizeSku(skuRaw);
      const brand = skuToBrand.get(sku);
      if (!brand) throw new Error(`SKU not mapped to brand: ${sku}`);
      return brand;
    },
  };

  // Principal groups for unit movements
  const saleGroups = buildPrincipalGroups(scopedInvoiceRows, isSalePrincipal);
  const refundGroups = buildPrincipalGroups(scopedInvoiceRows, isRefundPrincipal);
  const hasInvoiceUnitMovements = saleGroups.size > 0 || refundGroups.size > 0;

  let pnlAllocation;
  try {
    const deterministicAllocations = await buildDeterministicSkuAllocations({
      rows: scopedInvoiceRows,
      marketplace,
      invoiceStartDate: minDate,
      invoiceEndDate: maxDate,
      skuToBrand,
    });
    for (const issue of deterministicAllocations.issues) {
      blocks.push({
        code: 'PNL_ALLOCATION_WARNING',
        message: issue.message,
        details: { bucket: issue.bucket },
      });
    }

    pnlAllocation = computePnlAllocation(scopedInvoiceRows, brandResolver, {
      skuAllocationsByBucket: deterministicAllocations.skuAllocationsByBucket,
    });

    for (const issue of pnlAllocation.unallocatedSkuLessBuckets) {
      blocks.push({
        code: 'PNL_ALLOCATION_WARNING',
        message: `SKU-less bucket amount left in parent account. ${deterministicSourceGuidanceForBucket(issue.bucket)}`,
        details: { bucket: issue.bucket, totalCents: issue.totalCents, reason: issue.reason },
      });
    }
  } catch (error) {
    blocks.push({
      code: 'PNL_ALLOCATION_ERROR',
      message: 'Failed to compute P&L allocation',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    pnlAllocation = {
      invoiceId,
      allocationsByBucket: {
        amazonSellerFees: {},
        amazonFbaFees: {},
        amazonStorageFees: {},
        amazonAdvertisingCosts: {},
        amazonPromotions: {},
        amazonFbaInventoryReimbursement: {},
        warehousingAwd: {},
      },
    };
  }

  // Match refunds to historical sales first; fallback for remaining refunds is handled
  // after current settlement sales get costed.
  const refundPairs = Array.from(refundGroups.values()).map((r) => ({ orderId: r.orderId, sku: r.sku }));
  const saleRecordByKey = new Map<string, {
    orderId: string;
    sku: string;
    quantity: number;
    principalCents: number;
    costManufacturingCents: number;
    costFreightCents: number;
    costDutyCents: number;
    costMfgAccessoriesCents: number;
  }>();
  const returnedQtyByKey = new Map<string, number>();
  if (refundPairs.length > 0) {
    const refundSaleRecords = await db.orderSale.findMany({
      where: {
        marketplace,
        ...(historicalProcessingCutoff
          ? { settlementProcessing: { uploadedAt: { lte: historicalProcessingCutoff } } }
          : {}),
        ...(excludeSettlementProcessingId
          ? { NOT: { settlementProcessingId: excludeSettlementProcessingId } }
          : {}),
        OR: refundPairs.map((p) => ({ orderId: p.orderId, sku: p.sku })),
      },
    });
    for (const sale of refundSaleRecords) {
      const key = `${sale.orderId}::${normalizeSku(sale.sku)}`;
      const current = saleRecordByKey.get(key);
      if (!current) {
        saleRecordByKey.set(key, {
          orderId: sale.orderId,
          sku: normalizeSku(sale.sku),
          quantity: sale.quantity,
          principalCents: sale.principalCents,
          costManufacturingCents: sale.costManufacturingCents,
          costFreightCents: sale.costFreightCents,
          costDutyCents: sale.costDutyCents,
          costMfgAccessoriesCents: sale.costMfgAccessoriesCents,
        });
        continue;
      }

      current.quantity += sale.quantity;
      current.principalCents += sale.principalCents;
      current.costManufacturingCents += sale.costManufacturingCents;
      current.costFreightCents += sale.costFreightCents;
      current.costDutyCents += sale.costDutyCents;
      current.costMfgAccessoriesCents += sale.costMfgAccessoriesCents;
    }

    const existingReturns = await db.orderReturn.findMany({
      where: {
        marketplace,
        ...(historicalProcessingCutoff
          ? { settlementProcessing: { uploadedAt: { lte: historicalProcessingCutoff } } }
          : {}),
        ...(excludeSettlementProcessingId
          ? { NOT: { settlementProcessingId: excludeSettlementProcessingId } }
          : {}),
        OR: refundPairs.map((p) => ({ orderId: p.orderId, sku: p.sku })),
      },
    });
    for (const ret of existingReturns) {
      const key = `${ret.orderId}::${normalizeSku(ret.sku)}`;
      const current = returnedQtyByKey.get(key);
      returnedQtyByKey.set(key, (current === undefined ? 0 : current) + ret.quantity);
    }
  }

  const historicalRefundGroups = new Map<string, { orderId: string; sku: string; date: string; quantity: number; principalCents: number }>();
  const currentSettlementRefundGroups = new Map<string, { orderId: string; sku: string; date: string; quantity: number; principalCents: number }>();
  for (const refund of refundGroups.values()) {
    const key = `${refund.orderId}::${refund.sku}`;
    if (saleRecordByKey.has(key)) {
      historicalRefundGroups.set(key, refund);
      continue;
    }
    currentSettlementRefundGroups.set(key, refund);
  }

  const matchedReturnsFromHistory =
    historicalRefundGroups.size === 0
      ? []
      : matchRefundsToSales(historicalRefundGroups, saleRecordByKey, returnedQtyByKey, blocks);

  const maxDateObj = new Date(`${maxDate}T00:00:00Z`);

  const knownSales: KnownLedgerEvent[] = [];
  const knownReturns: KnownLedgerEvent[] = [];
  if (cogsEnabled && hasInvoiceUnitMovements) {
    const knownSalesRecords = await db.orderSale.findMany({
      where: {
        marketplace,
        saleDate: { lte: maxDateObj },
        ...(historicalProcessingCutoff
          ? { settlementProcessing: { uploadedAt: { lte: historicalProcessingCutoff } } }
          : {}),
        ...(excludeSettlementProcessingId
          ? { NOT: { settlementProcessingId: excludeSettlementProcessingId } }
          : {}),
      },
    });
    const knownReturnRecords = await db.orderReturn.findMany({
      where: {
        marketplace,
        returnDate: { lte: maxDateObj },
        ...(historicalProcessingCutoff
          ? { settlementProcessing: { uploadedAt: { lte: historicalProcessingCutoff } } }
          : {}),
        ...(excludeSettlementProcessingId
          ? { NOT: { settlementProcessingId: excludeSettlementProcessingId } }
          : {}),
      },
    });

    for (const sale of knownSalesRecords) {
      knownSales.push({
        date: dateToIsoDay(sale.saleDate),
        orderId: sale.orderId,
        sku: normalizeSku(sale.sku),
        units: sale.quantity,
        costByComponentCents: {
          manufacturing: sale.costManufacturingCents,
          freight: sale.costFreightCents,
          duty: sale.costDutyCents,
          mfgAccessories: sale.costMfgAccessoriesCents,
        },
      });
    }

    for (const ret of knownReturnRecords) {
      knownReturns.push({
        date: dateToIsoDay(ret.returnDate),
        orderId: ret.orderId,
        sku: normalizeSku(ret.sku),
        units: ret.quantity,
        costByComponentCents: {
          manufacturing: ret.costManufacturingCents,
          freight: ret.costFreightCents,
          duty: ret.costDutyCents,
          mfgAccessories: ret.costMfgAccessoriesCents,
        },
      });
    }

    for (const ret of matchedReturnsFromHistory) {
      knownReturns.push({
        date: ret.date,
        orderId: ret.orderId,
        sku: ret.sku,
        units: ret.quantity,
        costByComponentCents: ret.costByComponentCents,
      });
    }
  }

  const computeSales = Array.from(saleGroups.values())
    .map((s) => ({
      date: s.date,
      orderId: s.orderId,
      sku: s.sku,
      units: Math.abs(s.quantity),
      principalCents: s.principalCents,
    }))
    .filter((s) => s.units > 0);

  const ledgerComputeSales = computeSales.map((s) => ({
    date: s.date,
    orderId: s.orderId,
    sku: s.sku,
    units: s.units,
  }));

  const billsErrorCodes = new Set(['BILLS_FETCH_ERROR', 'BILLS_PARSE_ERROR']);
  const hasBillsError = blocks.some((b) => billsErrorCodes.has(b.code));

  let ledgerBlocks: LedgerBlock[] = [];
  let computedCosts: SaleCost[] = [];
  if (cogsEnabled && !hasBillsError && hasInvoiceUnitMovements) {
    const replay = replayInventoryLedger({
      parsedBills,
      knownSales,
      knownReturns,
      computeSales: ledgerComputeSales,
    });
    ledgerBlocks = replay.blocks;
    computedCosts = replay.computedCosts;
  }

  const missingCostBasisSkus = new Set<string>();
  for (const b of ledgerBlocks) {
    if (b.code !== 'MISSING_COST_BASIS') continue;
    const details = b.details;
    const skuValue = details ? details.sku : undefined;
    if (typeof skuValue === 'string' && skuValue !== '') {
      missingCostBasisSkus.add(skuValue);
    }
  }

  for (const block of summarizeLedgerBlocks(ledgerBlocks)) {
    blocks.push(block);
  }

  const computedCostByKey = new Map<string, SaleCost>();
  for (const cost of computedCosts) {
    const key = `${cost.orderId}::${cost.sku}`;
    computedCostByKey.set(key, cost);
  }

  const computedSales: ProcessingSale[] = [];
  if (!hasBillsError) {
    for (const sale of computeSales) {
      const key = `${sale.orderId}::${sale.sku}`;
      const cost = computedCostByKey.get(key);
      if (!cost) {
        if (cogsEnabled && !missingCostBasisSkus.has(sale.sku)) {
          throw new Error(`Missing computed cost basis but no ledger block emitted: ${sale.orderId} ${sale.sku}`);
        }
        computedSales.push({
          orderId: sale.orderId,
          sku: sale.sku,
          date: sale.date,
          quantity: sale.units,
          principalCents: sale.principalCents,
          costByComponentCents: {
            manufacturing: 0,
            freight: 0,
            duty: 0,
            mfgAccessories: 0,
          },
        });
        continue;
      }
      computedSales.push({
        orderId: sale.orderId,
        sku: sale.sku,
        date: sale.date,
        quantity: sale.units,
        principalCents: sale.principalCents,
        costByComponentCents: cost.costByComponentCents,
      });
    }
  }

  const currentSettlementSaleRecordByKey = new Map<string, {
    orderId: string;
    sku: string;
    quantity: number;
    principalCents: number;
    costManufacturingCents: number;
    costFreightCents: number;
    costDutyCents: number;
    costMfgAccessoriesCents: number;
  }>();
  for (const sale of computedSales) {
    const key = `${sale.orderId}::${sale.sku}`;
    currentSettlementSaleRecordByKey.set(key, {
      orderId: sale.orderId,
      sku: sale.sku,
      quantity: sale.quantity,
      principalCents: sale.principalCents,
      costManufacturingCents: sale.costByComponentCents.manufacturing,
      costFreightCents: sale.costByComponentCents.freight,
      costDutyCents: sale.costByComponentCents.duty,
      costMfgAccessoriesCents: sale.costByComponentCents.mfgAccessories,
    });
  }

  const matchedReturnsFromCurrentSettlement =
    currentSettlementRefundGroups.size === 0
      ? []
      : matchRefundsToSales(currentSettlementRefundGroups, currentSettlementSaleRecordByKey, new Map(), blocks);

  const matchedReturns = [...matchedReturnsFromHistory, ...matchedReturnsFromCurrentSettlement];

  const salesCogsByBrand = sumCentsByBrandComponent(computedSales, skuToBrand);
  const returnsCogsByBrand = sumCentsByBrandComponent(matchedReturns, skuToBrand);
  const netCogsByBrand = mergeBrandComponentCents(salesCogsByBrand, returnsCogsByBrand, 'sub');
  const salesCogsByBrandSku = sumCentsByBrandComponentSku(computedSales, skuToBrand);
  const returnsCogsByBrandSku = sumCentsByBrandComponentSku(matchedReturns, skuToBrand);
  const netCogsByBrandSku = mergeBrandComponentSkuCents(salesCogsByBrandSku, returnsCogsByBrandSku, 'sub');

  // Build JE lines (resolve brand sub-accounts)
  const brandNames = Array.from(new Set(skuToBrand.values())).sort();

  const cogsLines = cogsEnabled
    ? buildCogsJournalLines(
        netCogsByBrand,
        brandNames,
        mapping,
        accountsResult.accounts,
        invoiceId,
        blocks,
        netCogsByBrandSku,
      )
    : [];
  const pnlLines = buildPnlJournalLines(
    pnlAllocation.allocationsByBucket,
    mapping,
    accountsResult.accounts,
    invoiceId,
    blocks,
    pnlAllocation.skuBreakdownByBucketBrand,
  );

  const hashPrefix = processingHash.slice(0, 10);

  const cogsPreview: JournalEntryPreview = {
    txnDate: settlement.TxnDate,
    docNumber: buildProcessingDocNumber('C', invoiceId),
    privateNote: `Plutus COGS | Invoice: ${invoiceId} | Hash: ${hashPrefix}`,
    lines: cogsLines,
  };

  const pnlPreview: JournalEntryPreview = {
    txnDate: settlement.TxnDate,
    docNumber: buildProcessingDocNumber('P', invoiceId),
    privateNote: `Plutus P&L Reclass | Invoice: ${invoiceId} | Hash: ${hashPrefix}`,
    lines: pnlLines,
  };

  const summarizedBlocks = summarizeRefundAdjustmentBlocks(blocks);

  const preview: SettlementProcessingPreview = {
    marketplace,
    settlementJournalEntryId: settlement.Id,
    settlementDocNumber: settlement.DocNumber,
    settlementPostedDate: settlement.TxnDate,
    invoiceId,
    processingHash,
    minDate,
    maxDate,
    blocks: summarizedBlocks,
    sales: computedSales,
    returns: matchedReturns,
    cogsByBrandComponentCents: netCogsByBrand,
    pnlByBucketBrandCents: pnlAllocation.allocationsByBucket,
    cogsJournalEntry: cogsPreview,
    pnlJournalEntry: pnlPreview,
  };

  return {
    preview,
    updatedConnection: billsConnection === input.connection ? undefined : billsConnection,
  };
}

export async function processSettlement(input: {
  connection: QboConnection;
  settlementJournalEntryId: string;
  sourceFilename: string;
  invoiceId: string;
  auditRows: SettlementAuditRow[];
}): Promise<{ result: SettlementProcessingResult; updatedConnection?: QboConnection }> {
  const computed = await computeSettlementPreview(input);
  const settlementCurrencyCode = settlementCurrencyCodeForMarketplace(computed.preview.marketplace);

  const blockingBlocks = computed.preview.blocks.filter((block) => isBlockingProcessingBlock(block));
  if (blockingBlocks.length > 0) {
    return { result: { ok: false, preview: computed.preview }, updatedConnection: computed.updatedConnection };
  }

  let postingConnection = computed.updatedConnection ? computed.updatedConnection : input.connection;
  let activeConnection = computed.updatedConnection;

  let cogsJournalEntryId = buildNoopJournalEntryId('COGS', computed.preview.invoiceId);
  const noopCogsJournalEntryId = cogsJournalEntryId;
  if (computed.preview.cogsJournalEntry.lines.length > 0) {
    const cogs = await createJournalEntry(postingConnection, {
      txnDate: computed.preview.cogsJournalEntry.txnDate,
      docNumber: computed.preview.cogsJournalEntry.docNumber,
      privateNote: computed.preview.cogsJournalEntry.privateNote,
      currencyCode: settlementCurrencyCode,
      lines: computed.preview.cogsJournalEntry.lines.map((line) => ({
        amount: fromCents(line.amountCents),
        postingType: line.postingType,
        accountId: line.accountId,
        description: line.description,
      })),
    });

    cogsJournalEntryId = cogs.journalEntry.Id;
    if (cogs.updatedConnection) {
      postingConnection = cogs.updatedConnection;
      activeConnection = cogs.updatedConnection;
    }
  }

  let pnlJournalEntryId = buildNoopJournalEntryId('PNL', computed.preview.invoiceId);
  const noopPnlJournalEntryId = pnlJournalEntryId;
  if (computed.preview.pnlJournalEntry.lines.length > 0) {
    const pnl = await createJournalEntry(postingConnection, {
      txnDate: computed.preview.pnlJournalEntry.txnDate,
      docNumber: computed.preview.pnlJournalEntry.docNumber,
      privateNote: computed.preview.pnlJournalEntry.privateNote,
      currencyCode: settlementCurrencyCode,
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
    // Task 1: Atomic transaction with duplicate check inside
    await db.$transaction(async (tx) => {
      // Re-check for duplicates inside the transaction to prevent race conditions
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

      const processing = await tx.settlementProcessing.create({
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

      if (computed.preview.sales.length > 0) {
        // Task 2: Use createMany for bulk inserts
        await tx.orderSale.createMany({
          data: computed.preview.sales.map((sale) => ({
            marketplace: computed.preview.marketplace,
            orderId: sale.orderId,
            sku: sale.sku,
            saleDate: new Date(`${sale.date}T00:00:00Z`),
            quantity: sale.quantity,
            principalCents: sale.principalCents,
            costManufacturingCents: sale.costByComponentCents.manufacturing,
            costFreightCents: sale.costByComponentCents.freight,
            costDutyCents: sale.costByComponentCents.duty,
            costMfgAccessoriesCents: sale.costByComponentCents.mfgAccessories,
            settlementProcessingId: processing.id,
          })),
        });
      }

      if (computed.preview.returns.length > 0) {
        await tx.orderReturn.createMany({
          data: computed.preview.returns.map((ret) => ({
            marketplace: computed.preview.marketplace,
            orderId: ret.orderId,
            sku: ret.sku,
            returnDate: new Date(`${ret.date}T00:00:00Z`),
            quantity: ret.quantity,
            principalCents: ret.principalCents,
            costManufacturingCents: ret.costByComponentCents.manufacturing,
            costFreightCents: ret.costByComponentCents.freight,
            costDutyCents: ret.costByComponentCents.duty,
            costMfgAccessoriesCents: ret.costByComponentCents.mfgAccessories,
            settlementProcessingId: processing.id,
          })),
        });
      }
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

    if (cogsJournalEntryId !== noopCogsJournalEntryId) {
      try {
        const deleted = await deleteJournalEntry(cleanupConnection, cogsJournalEntryId);
        if (deleted.updatedConnection) {
          cleanupConnection = deleted.updatedConnection;
        }
      } catch (cleanupError) {
        cleanupErrors.push(
          cleanupError instanceof Error
            ? `Failed to delete COGS JE ${cogsJournalEntryId}: ${cleanupError.message}`
            : `Failed to delete COGS JE ${cogsJournalEntryId}: ${String(cleanupError)}`,
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
        cogsJournalEntryId,
        pnlJournalEntryId,
      },
    },
    updatedConnection: activeConnection,
  };
}
