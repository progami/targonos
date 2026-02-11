import type { QboAccount, QboBill, QboConnection } from '@/lib/qbo/api';
import { createJournalEntry, fetchAccounts, fetchBills, fetchJournalEntryById } from '@/lib/qbo/api';
import { parseLmbAuditCsv, type LmbAuditRow } from '@/lib/lmb/audit-csv';
import { parseLmbSettlementDocNumber } from '@/lib/lmb/settlements';
import { parseQboBillsToInventoryEvents, buildInventoryEventsFromMappings, type InventoryAccountMappings, type ParsedBills } from '@/lib/inventory/qbo-bills';
import {
  replayInventoryLedger,
  type LedgerBlock,
  type SaleCost,
} from '@/lib/inventory/ledger';
import { fromCents } from '@/lib/inventory/money';
import { computePnlAllocation, PnlAllocationNoWeightsError } from '@/lib/pnl-allocation';
import { db } from '@/lib/db';
import { normalizeAuditMarketToMarketplaceId } from '@/lib/plutus/audit-invoice-matching';

import {
  normalizeSku,
  dateToIsoDay,
  computeProcessingHash,
  groupByInvoice,
  isSalePrincipal,
  isRefundPrincipal,
  buildPrincipalGroups,
  requireAccountMapping,
  matchRefundsToSales,
  sumCentsByBrandComponent,
  mergeBrandComponentCents,
} from './settlement-validation';

import { buildCogsJournalLines, buildPnlJournalLines } from './journal-builder';

import type {
  ProcessingBlock,
  ProcessingSale,
  KnownLedgerEvent,
  JournalEntryPreview,
  SettlementProcessingPreview,
  SettlementProcessingResult,
} from './settlement-types';

// Re-export all public types so existing imports from this file continue to work
export type {
  ProcessingBlock,
  JournalEntryLinePreview,
  JournalEntryPreview,
  SettlementProcessingPreview,
  SettlementProcessingResult,
} from './settlement-types';

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
    docNumber: `PLUTUS-COGS-${input.invoiceId}`,
    privateNote: `Plutus COGS | Invoice: ${input.invoiceId} | Hash: ${hashPrefix}`,
    lines: [],
  };

  const pnlPreview: JournalEntryPreview = {
    txnDate: input.settlementPostedDate,
    docNumber: `PLUTUS-PNL-${input.invoiceId}`,
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

export async function computeSettlementPreview(input: {
  connection: QboConnection;
  settlementJournalEntryId: string;
  auditCsvText?: string;
  auditRows?: LmbAuditRow[];
  sourceFilename: string;
  invoiceId?: string;
}): Promise<{ preview: SettlementProcessingPreview; updatedConnection?: QboConnection }> {
  const blocks: ProcessingBlock[] = [];

  const settlementResult = await fetchJournalEntryById(input.connection, input.settlementJournalEntryId);
  const settlement = settlementResult.journalEntry;
  if (!settlement.DocNumber) {
    throw new Error(`Missing DocNumber on journal entry ${settlement.Id}`);
  }

  const meta = parseLmbSettlementDocNumber(settlement.DocNumber);
  const marketplace = meta.marketplace.id;

  const parsedAudit = input.auditRows
    ? { headers: [] as string[], rows: input.auditRows }
    : parseLmbAuditCsv(input.auditCsvText!);
  const invoiceGroups = groupByInvoice(parsedAudit.rows);

  const requestedInvoice = input.invoiceId ? input.invoiceId.trim() : '';
  let invoiceId = requestedInvoice;
  if (invoiceId === '') {
    if (invoiceGroups.size !== 1) {
      throw new Error(`Audit file contains multiple Invoices (${invoiceGroups.size}). Select one.`);
    }
    const only = Array.from(invoiceGroups.keys())[0];
    if (!only) {
      throw new Error('Audit file has no invoices');
    }
    invoiceId = only;
  }

  const invoiceRows = invoiceGroups.get(invoiceId);
  if (!invoiceRows) {
    throw new Error(`Invoice not found in audit file: ${invoiceId}`);
  }

  const scopedInvoiceRows = invoiceRows.filter((r) => normalizeAuditMarketToMarketplaceId(r.market) === marketplace);
  if (scopedInvoiceRows.length === 0) {
    throw new Error(`No audit rows for marketplace ${marketplace} in invoice ${invoiceId}`);
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
  if (existingSettlement) {
    blocks.push({
      code: 'ALREADY_PROCESSED',
      message: 'Settlement already processed by Plutus',
      details: { settlementProcessingId: existingSettlement.id },
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
        details: { settlementProcessingId: existingInvoice.id },
      });
    } else {
      blocks.push({
        code: 'INVOICE_CONFLICT',
        message: 'Invoice exists with different data (hash mismatch)',
        details: { settlementProcessingId: existingInvoice.id },
      });
    }
  }

  const setupConfig = await db.setupConfig.findFirst();
  if (!setupConfig || setupConfig.accountsCreated !== true) {
    blocks.push({
      code: 'MISSING_SETUP',
      message: 'Setup is incomplete. Complete Accounts mapping + sub-account creation first.',
    });
  }

  const requiredMappingKeys = [
    'invManufacturing',
    'invFreight',
    'invDuty',
    'invMfgAccessories',
    'cogsManufacturing',
    'cogsFreight',
    'cogsDuty',
    'cogsMfgAccessories',
    'amazonSellerFees',
    'amazonFbaFees',
    'amazonStorageFees',
    'amazonAdvertisingCosts',
    'amazonPromotions',
    'amazonFbaInventoryReimbursement',
  ];

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

  const invManufacturing = mapping.invManufacturing;
  if (!invManufacturing) throw new Error('Missing invManufacturing mapping');
  const invFreight = mapping.invFreight;
  if (!invFreight) throw new Error('Missing invFreight mapping');
  const invDuty = mapping.invDuty;
  if (!invDuty) throw new Error('Missing invDuty mapping');
  const invMfgAccessories = mapping.invMfgAccessories;
  if (!invMfgAccessories) throw new Error('Missing invMfgAccessories mapping');

  const inventoryMappings: InventoryAccountMappings = {
    invManufacturing,
    invFreight,
    invDuty,
    invMfgAccessories,
  };

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

  const plutusMappings = await db.billMapping.findMany({
    include: { lines: true },
  });

  const mappedBillIds = new Set(plutusMappings.map((m) => m.qboBillId));

  let parsedBillsFromMappings: ParsedBills = { events: [], poUnitsBySku: new Map() };
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

  // QBO Bills -> Inventory events (only inventory-account lines are used)
  let parsedBillsFromQbo: ParsedBills = { events: [], poUnitsBySku: new Map() };
  let allBills: QboBill[] = [];

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

  try {
    const unmappedBills = allBills.filter((b) => !mappedBillIds.has(b.Id));
    parsedBillsFromQbo = parseQboBillsToInventoryEvents(unmappedBills, accountsById, inventoryMappings);
  } catch (error) {
    blocks.push({
      code: 'BILLS_PARSE_ERROR',
      message: 'Failed to parse bills into inventory events',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    parsedBillsFromQbo = { events: [], poUnitsBySku: new Map() };
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

  let pnlAllocation;
  try {
    pnlAllocation = computePnlAllocation(scopedInvoiceRows, brandResolver);
  } catch (error) {
    blocks.push({
      code: 'PNL_ALLOCATION_ERROR',
      message:
        error instanceof PnlAllocationNoWeightsError
          ? 'Cannot allocate SKU-less fee buckets because there are no qualifying sales units (fees-only or refunds-only invoice)'
          : 'Failed to compute P&L allocation',
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
      },
    };
  }

  // Principal groups for unit movements
  const saleGroups = buildPrincipalGroups(scopedInvoiceRows, isSalePrincipal);
  const refundGroups = buildPrincipalGroups(scopedInvoiceRows, isRefundPrincipal);

  // Check existing OrderSales
  const salePairs = Array.from(saleGroups.values()).map((s) => ({ orderId: s.orderId, sku: s.sku }));
  const existingSales = await db.orderSale.findMany({
    where: {
      marketplace,
      OR: salePairs.map((p) => ({ orderId: p.orderId, sku: p.sku })),
    },
  });
  const existingSalesSet = new Set(existingSales.map((s) => `${s.orderId}::${normalizeSku(s.sku)}`));
  for (const sale of saleGroups.values()) {
    const key = `${sale.orderId}::${sale.sku}`;
    if (existingSalesSet.has(key)) {
      blocks.push({
        code: 'ORDER_ALREADY_PROCESSED',
        message: 'Order already processed by Plutus',
        details: { orderId: sale.orderId, sku: sale.sku },
      });
    }
  }

  // Match refunds to historical sales (DB)
  const refundPairs = Array.from(refundGroups.values()).map((r) => ({ orderId: r.orderId, sku: r.sku }));
  const refundSaleRecords = await db.orderSale.findMany({
    where: {
      marketplace,
      OR: refundPairs.map((p) => ({ orderId: p.orderId, sku: p.sku })),
    },
  });
  const saleRecordByKey = new Map(refundSaleRecords.map((r) => [`${r.orderId}::${normalizeSku(r.sku)}`, r]));

  const existingReturns = await db.orderReturn.findMany({
    where: {
      marketplace,
      OR: refundPairs.map((p) => ({ orderId: p.orderId, sku: p.sku })),
    },
  });
  const returnedQtyByKey = new Map<string, number>();
  for (const r of existingReturns) {
    const key = `${r.orderId}::${normalizeSku(r.sku)}`;
    const current = returnedQtyByKey.get(key);
    returnedQtyByKey.set(key, (current === undefined ? 0 : current) + r.quantity);
  }

  const matchedReturns = matchRefundsToSales(refundGroups, saleRecordByKey, returnedQtyByKey, blocks);

  const maxDateObj = new Date(`${maxDate}T00:00:00Z`);

  const knownSalesRecords = await db.orderSale.findMany({
    where: {
      marketplace,
      saleDate: { lte: maxDateObj },
    },
  });
  const knownReturnRecords = await db.orderReturn.findMany({
    where: {
      marketplace,
      returnDate: { lte: maxDateObj },
    },
  });

  const knownSales: KnownLedgerEvent[] = knownSalesRecords.map((s) => ({
    date: dateToIsoDay(s.saleDate),
    orderId: s.orderId,
    sku: normalizeSku(s.sku),
    units: s.quantity,
    costByComponentCents: {
      manufacturing: s.costManufacturingCents,
      freight: s.costFreightCents,
      duty: s.costDutyCents,
      mfgAccessories: s.costMfgAccessoriesCents,
    },
  }));

  const knownReturns: KnownLedgerEvent[] = knownReturnRecords.map((r) => ({
    date: dateToIsoDay(r.returnDate),
    orderId: r.orderId,
    sku: normalizeSku(r.sku),
    units: r.quantity,
    costByComponentCents: {
      manufacturing: r.costManufacturingCents,
      freight: r.costFreightCents,
      duty: r.costDutyCents,
      mfgAccessories: r.costMfgAccessoriesCents,
    },
  }));

  // Include current refunds in knownReturns for the replay
  for (const ret of matchedReturns) {
    knownReturns.push({
      date: ret.date,
      orderId: ret.orderId,
      sku: ret.sku,
      units: ret.quantity,
      costByComponentCents: ret.costByComponentCents,
    });
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
  if (!hasBillsError) {
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
        if (!missingCostBasisSkus.has(sale.sku)) {
          throw new Error(`Missing computed cost basis but no ledger block emitted: ${sale.orderId} ${sale.sku}`);
        }
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

  const salesCogsByBrand = sumCentsByBrandComponent(computedSales, skuToBrand);
  const returnsCogsByBrand = sumCentsByBrandComponent(matchedReturns, skuToBrand);
  const netCogsByBrand = mergeBrandComponentCents(salesCogsByBrand, returnsCogsByBrand, 'sub');

  // Build JE lines (resolve brand sub-accounts)
  const brandNames = Array.from(new Set(skuToBrand.values())).sort();

  const cogsLines = buildCogsJournalLines(netCogsByBrand, brandNames, mapping, accountsResult.accounts, invoiceId, blocks);
  const pnlLines = buildPnlJournalLines(pnlAllocation.allocationsByBucket, mapping, accountsResult.accounts, invoiceId, blocks);

  const hashPrefix = processingHash.slice(0, 10);

  const cogsPreview: JournalEntryPreview = {
    txnDate: settlement.TxnDate,
    docNumber: `PLUTUS-COGS-${invoiceId}`,
    privateNote: `Plutus COGS | Invoice: ${invoiceId} | Hash: ${hashPrefix}`,
    lines: cogsLines,
  };

  const pnlPreview: JournalEntryPreview = {
    txnDate: settlement.TxnDate,
    docNumber: `PLUTUS-PNL-${invoiceId}`,
    privateNote: `Plutus P&L Reclass | Invoice: ${invoiceId} | Hash: ${hashPrefix}`,
    lines: pnlLines,
  };

  const preview: SettlementProcessingPreview = {
    marketplace,
    settlementJournalEntryId: settlement.Id,
    settlementDocNumber: settlement.DocNumber,
    settlementPostedDate: settlement.TxnDate,
    invoiceId,
    processingHash,
    minDate,
    maxDate,
    blocks,
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
  auditCsvText?: string;
  auditRows?: LmbAuditRow[];
  sourceFilename: string;
  invoiceId?: string;
}): Promise<{ result: SettlementProcessingResult; updatedConnection?: QboConnection }> {
  const computed = await computeSettlementPreview(input);

  if (computed.preview.blocks.length > 0) {
    return { result: { ok: false, preview: computed.preview }, updatedConnection: computed.updatedConnection };
  }

  const cogs = await createJournalEntry(computed.updatedConnection ? computed.updatedConnection : input.connection, {
    txnDate: computed.preview.cogsJournalEntry.txnDate,
    docNumber: computed.preview.cogsJournalEntry.docNumber,
    privateNote: computed.preview.cogsJournalEntry.privateNote,
    lines: computed.preview.cogsJournalEntry.lines.map((line) => ({
      amount: fromCents(line.amountCents),
      postingType: line.postingType,
      accountId: line.accountId,
      description: line.description,
    })),
  });

  const pnl = await createJournalEntry(cogs.updatedConnection ? cogs.updatedConnection : computed.updatedConnection ? computed.updatedConnection : input.connection, {
    txnDate: computed.preview.pnlJournalEntry.txnDate,
    docNumber: computed.preview.pnlJournalEntry.docNumber,
    privateNote: computed.preview.pnlJournalEntry.privateNote,
    lines: computed.preview.pnlJournalEntry.lines.map((line) => ({
      amount: fromCents(line.amountCents),
      postingType: line.postingType,
      accountId: line.accountId,
      description: line.description,
    })),
  });

  const activeConnection = pnl.updatedConnection
    ? pnl.updatedConnection
    : cogs.updatedConnection
      ? cogs.updatedConnection
      : computed.updatedConnection;

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
        lmbDocNumber: computed.preview.settlementDocNumber,
        lmbPostedDate: new Date(`${computed.preview.settlementPostedDate}T00:00:00Z`),
        invoiceId: computed.preview.invoiceId,
        processingHash: computed.preview.processingHash,
        sourceFilename: input.sourceFilename,
        qboCogsJournalEntryId: cogs.journalEntry.Id,
        qboPnlReclassJournalEntryId: pnl.journalEntry.Id,
      },
    });

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
  });

  return {
    result: {
      ok: true,
      preview: computed.preview,
      posted: {
        cogsJournalEntryId: cogs.journalEntry.Id,
        pnlJournalEntryId: pnl.journalEntry.Id,
      },
    },
    updatedConnection: activeConnection,
  };
}
