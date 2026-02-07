import type { QboAccount, QboBill, QboConnection } from '@/lib/qbo/api';
import { createJournalEntry, fetchAccounts, fetchBills, fetchJournalEntryById } from '@/lib/qbo/api';
import { parseLmbAuditCsv, type LmbAuditRow } from '@/lib/lmb/audit-csv';
import { parseLmbSettlementDocNumber } from '@/lib/lmb/settlements';
import { parseQboBillsToInventoryEvents, type InventoryAccountMappings } from '@/lib/inventory/qbo-bills';
import {
  replayInventoryLedger,
  type InventoryComponent,
  type LedgerBlock,
  type SaleCost,
} from '@/lib/inventory/ledger';
import { fromCents, removeProportionalComponents, toCents } from '@/lib/inventory/money';
import { computePnlAllocation } from '@/lib/pnl-allocation';
import { db } from '@/lib/db';
import { createHash } from 'crypto';

export type ProcessingBlock =
  | LedgerBlock
  | {
      code:
        | 'MISSING_SETUP'
        | 'MISSING_SKU_MAPPING'
        | 'MISSING_ACCOUNT_MAPPING'
        | 'MISSING_BRAND_SUBACCOUNT'
        | 'ALREADY_PROCESSED'
        | 'INVOICE_CONFLICT'
        | 'ORDER_ALREADY_PROCESSED'
        | 'REFUND_UNMATCHED'
        | 'REFUND_PARTIAL'
        | 'BILL_PARSE_ERROR';
      message: string;
      details?: Record<string, string | number>;
    };

type ProcessingSale = {
  orderId: string;
  sku: string;
  date: string;
  quantity: number;
  principalCents: number;
  costByComponentCents: Record<InventoryComponent, number>;
};

type ProcessingReturn = {
  orderId: string;
  sku: string;
  date: string;
  quantity: number;
  principalCents: number;
  costByComponentCents: Record<InventoryComponent, number>;
};

type KnownLedgerEvent = {
  date: string;
  orderId: string;
  sku: string;
  units: number;
  costByComponentCents: Record<InventoryComponent, number>;
};

export type JournalEntryLinePreview = {
  accountId: string;
  accountName: string;
  postingType: 'Debit' | 'Credit';
  amountCents: number;
  description: string;
};

export type JournalEntryPreview = {
  txnDate: string;
  docNumber: string;
  privateNote: string;
  lines: JournalEntryLinePreview[];
};

export type SettlementProcessingPreview = {
  marketplace: string;
  settlementJournalEntryId: string;
  settlementDocNumber: string;
  settlementPostedDate: string;

  invoiceId: string;
  processingHash: string;

  minDate: string;
  maxDate: string;

  blocks: ProcessingBlock[];

  sales: ProcessingSale[];
  returns: ProcessingReturn[];

  cogsByBrandComponentCents: Record<string, Record<InventoryComponent, number>>;
  pnlByBucketBrandCents: Record<string, Record<string, number>>;

  cogsJournalEntry: JournalEntryPreview;
  pnlJournalEntry: JournalEntryPreview;
};

export type SettlementProcessingResult =
  | { ok: false; preview: SettlementProcessingPreview }
  | {
      ok: true;
      preview: SettlementProcessingPreview;
      posted: {
        cogsJournalEntryId: string;
        pnlJournalEntryId: string;
      };
    };

function normalizeSku(raw: string): string {
  return raw.trim().replace(/\s+/g, '-').toUpperCase();
}

function dateToIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function computeProcessingHash(rows: LmbAuditRow[]): string {
  const normalized = rows.map((row) => ({
    invoice: row.invoice.trim(),
    market: row.market.trim(),
    date: row.date.trim(),
    orderId: row.orderId.trim(),
    sku: normalizeSku(row.sku),
    quantity: row.quantity,
    description: row.description.trim(),
    net: row.net,
  }));

  normalized.sort((a, b) => {
    if (a.invoice !== b.invoice) return a.invoice.localeCompare(b.invoice);
    if (a.market !== b.market) return a.market.localeCompare(b.market);
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.orderId !== b.orderId) return a.orderId.localeCompare(b.orderId);
    if (a.sku !== b.sku) return a.sku.localeCompare(b.sku);
    if (a.description !== b.description) return a.description.localeCompare(b.description);
    if (a.quantity !== b.quantity) return a.quantity - b.quantity;
    return a.net - b.net;
  });

  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function groupByInvoice(rows: LmbAuditRow[]): Map<string, LmbAuditRow[]> {
  const invoiceGroups = new Map<string, LmbAuditRow[]>();
  for (const row of rows) {
    const group = invoiceGroups.get(row.invoice);
    if (!group) {
      invoiceGroups.set(row.invoice, [row]);
    } else {
      group.push(row);
    }
  }
  return invoiceGroups;
}

function isSalePrincipal(description: string): boolean {
  return description.trim().startsWith('Amazon Sales - Principal');
}

function isRefundPrincipal(description: string): boolean {
  return description.trim().startsWith('Amazon Refunds - Refunded Principal');
}

function buildPrincipalGroups(
  rows: LmbAuditRow[],
  predicate: (description: string) => boolean,
): Map<string, { orderId: string; sku: string; date: string; quantity: number; principalCents: number }> {
  const groups = new Map<string, { orderId: string; sku: string; date: string; quantity: number; principalCents: number }>();

  for (const row of rows) {
    if (!predicate(row.description)) continue;
    const skuRaw = row.sku.trim();
    if (skuRaw === '') continue;

    const sku = normalizeSku(skuRaw);
    const orderId = row.orderId.trim();
    const date = row.date;

    if (!Number.isFinite(row.quantity) || !Number.isInteger(row.quantity) || row.quantity === 0) {
      continue;
    }

    const cents = toCents(row.net);

    const key = `${orderId}::${sku}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { orderId, sku, date, quantity: row.quantity, principalCents: cents });
      continue;
    }

    existing.quantity += row.quantity;
    existing.principalCents += cents;
    if (date < existing.date) existing.date = date;
  }

  return groups;
}

function requireAccountMapping(config: unknown, key: string): string {
  if (!config || typeof config !== 'object') {
    throw new Error('Missing setup config');
  }
  const value = (config as Record<string, unknown>)[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing account mapping: ${key}`);
  }
  return value;
}

function findRequiredSubAccountId(
  accounts: QboAccount[],
  parentAccountId: string,
  subAccountName: string,
): { id: string; name: string } {
  const account = accounts.find((a) => a.ParentRef?.value === parentAccountId && a.Name === subAccountName);
  if (!account) {
    throw new Error(`Missing brand sub-account in QBO: ${subAccountName}`);
  }
  return { id: account.Id, name: account.Name };
}

function sumCentsByBrandComponent(costs: Array<{ sku: string; costByComponentCents: Record<InventoryComponent, number> }>, skuToBrand: Map<string, string>) {
  const byBrand: Record<string, Record<InventoryComponent, number>> = {};

  for (const item of costs) {
    const brand = skuToBrand.get(item.sku);
    if (!brand) {
      throw new Error(`SKU not mapped to brand: ${item.sku}`);
    }

    const current = byBrand[brand];
    if (!current) {
      byBrand[brand] = { manufacturing: 0, freight: 0, duty: 0, mfgAccessories: 0 };
    }

    for (const component of Object.keys(item.costByComponentCents) as InventoryComponent[]) {
      byBrand[brand]![component] += item.costByComponentCents[component];
    }
  }

  return byBrand;
}

function mergeBrandComponentCents(
  left: Record<string, Record<InventoryComponent, number>>,
  right: Record<string, Record<InventoryComponent, number>>,
  op: 'add' | 'sub',
): Record<string, Record<InventoryComponent, number>> {
  const result: Record<string, Record<InventoryComponent, number>> = {};
  const brands = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (const brand of brands) {
    result[brand] = { manufacturing: 0, freight: 0, duty: 0, mfgAccessories: 0 };
    for (const component of Object.keys(result[brand]) as InventoryComponent[]) {
      const leftBrand = left[brand];
      const rightBrand = right[brand];
      const a = leftBrand ? leftBrand[component] : 0;
      const b = rightBrand ? rightBrand[component] : 0;
      result[brand]![component] = op === 'add' ? a + b : a - b;
    }
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

  const processingHash = computeProcessingHash(invoiceRows);

  let minDate = invoiceRows[0]?.date;
  let maxDate = invoiceRows[0]?.date;
  for (const row of invoiceRows) {
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
  for (const row of invoiceRows) {
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

  const accountsResult = await fetchAccounts(settlementResult.updatedConnection ? settlementResult.updatedConnection : input.connection, {
    includeInactive: true,
  });

  const accountsById = new Map<string, QboAccount>();
  for (const account of accountsResult.accounts) accountsById.set(account.Id, account);

  const inventoryMappings: InventoryAccountMappings = {
    invManufacturing: mapping.invManufacturing ? mapping.invManufacturing : '',
    invFreight: mapping.invFreight ? mapping.invFreight : '',
    invDuty: mapping.invDuty ? mapping.invDuty : '',
    invMfgAccessories: mapping.invMfgAccessories ? mapping.invMfgAccessories : '',
  };

  // QBO Bills → Inventory events (only inventory-account lines are used)
  let allBills: QboBill[] = [];
  let billsConnection = accountsResult.updatedConnection ? accountsResult.updatedConnection : settlementResult.updatedConnection ? settlementResult.updatedConnection : input.connection;

  try {
    let startPosition = 1;
    const pageSize = 100;

    while (true) {
      const page = await fetchBills(billsConnection, { maxResults: pageSize, startPosition });
      if (page.updatedConnection) {
        billsConnection = page.updatedConnection;
      }

      allBills = allBills.concat(page.bills);

      if (allBills.length >= page.totalCount) break;
      if (page.bills.length === 0) break;

      startPosition += page.bills.length;
    }
  } catch (error) {
    blocks.push({ code: 'BILL_PARSE_ERROR', message: 'Failed to fetch bills from QBO' });
  }

  let parsedBills;
  try {
    if (
      inventoryMappings.invManufacturing === '' ||
      inventoryMappings.invFreight === '' ||
      inventoryMappings.invDuty === '' ||
      inventoryMappings.invMfgAccessories === ''
    ) {
      parsedBills = { events: [], poUnitsBySku: new Map() };
    } else {
      parsedBills = parseQboBillsToInventoryEvents(allBills, accountsById, inventoryMappings);
    }
  } catch (error) {
    blocks.push({
      code: 'BILL_PARSE_ERROR',
      message: 'Failed to parse bills into inventory events',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    parsedBills = { events: [], poUnitsBySku: new Map() };
  }

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
    pnlAllocation = computePnlAllocation(invoiceRows, brandResolver);
  } catch (error) {
    blocks.push({
      code: 'BILL_PARSE_ERROR',
      message: 'Failed to compute P&L allocation',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    pnlAllocation = { invoiceId, allocationsByBucket: {} as never };
  }

  // Principal groups for unit movements
  const saleGroups = buildPrincipalGroups(invoiceRows, isSalePrincipal);
  const refundGroups = buildPrincipalGroups(invoiceRows, isRefundPrincipal);

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
  const matchedReturns: ProcessingReturn[] = [];

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

  for (const refund of refundGroups.values()) {
    const key = `${refund.orderId}::${refund.sku}`;
    const saleRecord = saleRecordByKey.get(key);
    if (!saleRecord) {
      blocks.push({
        code: 'REFUND_UNMATCHED',
        message: 'Refund cannot be matched to an original sale',
        details: { orderId: refund.orderId, sku: refund.sku },
      });
      continue;
    }

    const saleQty = saleRecord.quantity;
    const refundQty = Math.abs(refund.quantity);
    if (!Number.isInteger(refundQty) || refundQty <= 0) continue;

    const alreadyReturned = returnedQtyByKey.get(key);
    const returnedSoFar = alreadyReturned === undefined ? 0 : alreadyReturned;
    if (returnedSoFar + refundQty > saleQty) {
      blocks.push({
        code: 'REFUND_PARTIAL',
        message: 'Refund quantity exceeds remaining sale quantity',
        details: { orderId: refund.orderId, sku: refund.sku, saleQty, returnedSoFar, refundQty },
      });
      continue;
    }

    const expectedAbs = Math.round((Math.abs(saleRecord.principalCents) * refundQty) / saleQty);
    const actualAbs = Math.abs(refund.principalCents);
    if (expectedAbs === 0) {
      blocks.push({
        code: 'REFUND_PARTIAL',
        message: 'Cannot validate refund: expected principal is 0',
        details: { orderId: refund.orderId, sku: refund.sku },
      });
      continue;
    }

    const ratio = actualAbs / expectedAbs;
    if (ratio < 0.8 || ratio > 1.1) {
      blocks.push({
        code: 'REFUND_PARTIAL',
        message: 'Possible partial refund / promo adjustment (requires review)',
        details: { orderId: refund.orderId, sku: refund.sku, expectedAbs, actualAbs },
      });
      continue;
    }

    const saleCostTotals: Record<InventoryComponent, number> = {
      manufacturing: saleRecord.costManufacturingCents,
      freight: saleRecord.costFreightCents,
      duty: saleRecord.costDutyCents,
      mfgAccessories: saleRecord.costMfgAccessoriesCents,
    };
    const returnCost = removeProportionalComponents(saleCostTotals, refundQty, saleQty) as Record<InventoryComponent, number>;

    matchedReturns.push({
      orderId: refund.orderId,
      sku: refund.sku,
      date: refund.date,
      quantity: refundQty,
      principalCents: refund.principalCents,
      costByComponentCents: returnCost,
    });
  }

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

  const replay = replayInventoryLedger({
    parsedBills,
    knownSales,
    knownReturns,
    computeSales: ledgerComputeSales,
  });

  for (const block of replay.blocks) {
    blocks.push(block);
  }

  const computedCostByKey = new Map<string, SaleCost>();
  for (const cost of replay.computedCosts) {
    const key = `${cost.orderId}::${cost.sku}`;
    computedCostByKey.set(key, cost);
  }

  const computedSales: ProcessingSale[] = [];
  for (const sale of computeSales) {
    const key = `${sale.orderId}::${sale.sku}`;
    const cost = computedCostByKey.get(key);
    if (!cost) {
      blocks.push({
        code: 'MISSING_COST_BASIS',
        message: 'Missing computed cost basis for sale',
        details: { orderId: sale.orderId, sku: sale.sku },
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

  const salesCogsByBrand = sumCentsByBrandComponent(computedSales, skuToBrand);
  const returnsCogsByBrand = sumCentsByBrandComponent(matchedReturns, skuToBrand);
  const netCogsByBrand = mergeBrandComponentCents(salesCogsByBrand, returnsCogsByBrand, 'sub');

  // Build JE lines (resolve brand sub-accounts)
  const brandNames = Array.from(new Set(skuToBrand.values())).sort();

  const cogsLines: JournalEntryLinePreview[] = [];

  for (const brand of brandNames) {
    const componentTotals = netCogsByBrand[brand];
    if (!componentTotals) continue;

    for (const component of Object.keys(componentTotals) as InventoryComponent[]) {
      const cents = componentTotals[component];
      if (cents === 0) continue;

      const invParentKey =
        component === 'manufacturing'
          ? 'invManufacturing'
          : component === 'freight'
            ? 'invFreight'
            : component === 'duty'
              ? 'invDuty'
              : 'invMfgAccessories';

      const cogsParentKey =
        component === 'manufacturing'
          ? 'cogsManufacturing'
          : component === 'freight'
            ? 'cogsFreight'
            : component === 'duty'
              ? 'cogsDuty'
              : 'cogsMfgAccessories';

      const invLabel =
        component === 'manufacturing'
          ? 'Manufacturing'
          : component === 'freight'
            ? 'Freight'
            : component === 'duty'
              ? 'Duty'
              : 'Mfg Accessories';

      const cogsLabel =
        component === 'manufacturing'
          ? 'Manufacturing'
          : component === 'freight'
            ? 'Freight'
            : component === 'duty'
              ? 'Duty'
              : 'Mfg Accessories';

      const invSubName = `${invLabel} - ${brand}`;
      const cogsSubName = `${cogsLabel} - ${brand}`;

      let invAccount;
      let cogsAccount;
      try {
        const parentId = mapping[invParentKey];
        if (!parentId) throw new Error('Missing inventory parent mapping');
        invAccount = findRequiredSubAccountId(accountsResult.accounts, parentId, invSubName);
      } catch {
        blocks.push({ code: 'MISSING_BRAND_SUBACCOUNT', message: 'Missing inventory brand sub-account', details: { name: invSubName } });
        continue;
      }
      try {
        const parentId = mapping[cogsParentKey];
        if (!parentId) throw new Error('Missing COGS parent mapping');
        cogsAccount = findRequiredSubAccountId(accountsResult.accounts, parentId, cogsSubName);
      } catch {
        blocks.push({ code: 'MISSING_BRAND_SUBACCOUNT', message: 'Missing COGS brand sub-account', details: { name: cogsSubName } });
        continue;
      }

      const absCents = Math.abs(cents);
      if (cents > 0) {
        // Sale: Debit COGS, Credit Inventory
        cogsLines.push({
          accountId: cogsAccount.id,
          accountName: cogsAccount.name,
          postingType: 'Debit',
          amountCents: absCents,
          description: `${invoiceId} ${component} COGS`,
        });
        cogsLines.push({
          accountId: invAccount.id,
          accountName: invAccount.name,
          postingType: 'Credit',
          amountCents: absCents,
          description: `${invoiceId} ${component} inventory`,
        });
      } else {
        // Return: Debit Inventory, Credit COGS
        cogsLines.push({
          accountId: invAccount.id,
          accountName: invAccount.name,
          postingType: 'Debit',
          amountCents: absCents,
          description: `${invoiceId} ${component} inventory (return)`,
        });
        cogsLines.push({
          accountId: cogsAccount.id,
          accountName: cogsAccount.name,
          postingType: 'Credit',
          amountCents: absCents,
          description: `${invoiceId} ${component} COGS (return)`,
        });
      }
    }
  }

  const pnlLines: JournalEntryLinePreview[] = [];

  const bucketLabelByKey: Record<string, string> = {
    amazonSellerFees: 'Amazon Seller Fees',
    amazonFbaFees: 'Amazon FBA Fees',
    amazonStorageFees: 'Amazon Storage Fees',
    amazonAdvertisingCosts: 'Amazon Advertising Costs',
    amazonPromotions: 'Amazon Promotions',
    amazonFbaInventoryReimbursement: 'Amazon FBA Inventory Reimbursement',
  };

  for (const [bucketKey, perBrand] of Object.entries(pnlAllocation.allocationsByBucket)) {
    const parentAccountId = mapping[bucketKey];
    const label = bucketLabelByKey[bucketKey];
    if (!parentAccountId || !label) continue;

    for (const [brand, cents] of Object.entries(perBrand)) {
      if (cents === 0) continue;

      const subName = `${label} - ${brand}`;
      let brandAccount;
      try {
        brandAccount = findRequiredSubAccountId(accountsResult.accounts, parentAccountId, subName);
      } catch {
        blocks.push({ code: 'MISSING_BRAND_SUBACCOUNT', message: 'Missing P&L brand sub-account', details: { name: subName } });
        continue;
      }

      const absCents = Math.abs(cents);

      if (cents > 0) {
        // Move positive amount from parent -> brand (debit parent, credit brand)
        pnlLines.push({
          accountId: parentAccountId,
          accountName: label,
          postingType: 'Debit',
          amountCents: absCents,
          description: `${invoiceId} ${label}`,
        });
        pnlLines.push({
          accountId: brandAccount.id,
          accountName: brandAccount.name,
          postingType: 'Credit',
          amountCents: absCents,
          description: `${invoiceId} ${label} (${brand})`,
        });
      } else {
        // Move negative amount from parent -> brand (debit brand, credit parent)
        pnlLines.push({
          accountId: brandAccount.id,
          accountName: brandAccount.name,
          postingType: 'Debit',
          amountCents: absCents,
          description: `${invoiceId} ${label} (${brand})`,
        });
        pnlLines.push({
          accountId: parentAccountId,
          accountName: label,
          postingType: 'Credit',
          amountCents: absCents,
          description: `${invoiceId} ${label}`,
        });
      }
    }
  }

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

  await db.$transaction(async (tx) => {
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

    for (const sale of computed.preview.sales) {
      await tx.orderSale.create({
        data: {
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
        },
      });
    }

    for (const ret of computed.preview.returns) {
      await tx.orderReturn.create({
        data: {
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
        },
      });
    }
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
