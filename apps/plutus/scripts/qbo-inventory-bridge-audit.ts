import { db } from '@/lib/db';
import {
  buildQboInventoryAssetReclassPlan,
  buildQboInventoryLandedCostPlan,
  type QboInventoryAssetComponent,
  type QboInventoryAssetLineAllocation,
  type QboInventoryAssetLineInput,
  type QboInventoryAssetLineNativePurchaseOrderRef,
  type QboInventoryLandedCostLayer,
  type ParsedQboInventoryAssetLine,
} from '@/lib/plutus/qbo-inventory-asset-lines';
import {
  buildExactCogsPlan,
  buildPlutusInventoryValuation,
  type ExactCostLayerConsumptionInput,
  type ExactCostLayerInput,
  type ExactSoldUnitInput,
} from '@/lib/plutus/exact-cost-layer-subledger';
import {
  assessQboInventoryValuationTieout,
  parseQboInventoryValuationSummary,
} from '@/lib/plutus/qbo-inventory-valuation';
import { normalizeSettlementOperatingMemo } from '@/lib/amazon-finances/settlement-memo-normalization';
import {
  fetchAccountsByFullyQualifiedName,
  fetchBills,
  fetchJournalEntries,
  fetchPurchaseOrderById,
  fetchQboReport,
  type QboBill,
  type QboConnection,
  type QboLinkedTxn,
  type QboPurchaseOrder,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { isSettlementDocNumber, normalizeSettlementDocNumber, parseSettlementDocNumber } from '@/lib/plutus/settlement-doc-number';
import { getActiveQboConnection, qboQueryAll } from '@/lib/qbo/full-history-audit/fetch';
import { loadSharedPlutusEnv } from './shared-env';

type CliOptions = {
  marketplace: string;
  assetStartDate: string;
  assetEndDate: string;
};

type AuditRow = {
  invoiceId: string;
  market: string;
  date: string;
  orderId: string;
  sku: string;
  quantity: number;
  description: string;
  net: number;
};

type QboInventoryAdjustment = {
  Id?: string;
  SyncToken?: string;
  DocNumber?: string;
  TxnDate?: string;
  PrivateNote?: string;
  Line?: Array<{
    ItemAdjustmentLineDetail?: {
      ItemRef?: { value?: string; name?: string };
      QtyDiff?: number;
    };
  }>;
};

type QboBillLine = NonNullable<QboBill['Line']>[number];

type QboLandedCostAllocationRow = {
  qboBillId: string;
  qboBillLineId: string;
  qboPurchaseOrderId: string;
  qboPurchaseOrderLineId: string;
  qboPurchaseOrderDocNumber: string;
  sellerSku: string;
  component: QboInventoryAssetComponent;
  amountCents: number;
  quantity: number | null;
  allocationMethod: string;
  sourceRef: string | null;
};

function parseArgs(argv: string[]): CliOptions {
  let marketplace = 'amazon.com';
  let assetStartDate = '2025-01-01';
  let assetEndDate = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < argv.length; ) {
    const arg = argv[i]!;
    if (arg === '--marketplace') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('Missing value for --marketplace');
      marketplace = next;
      i += 2;
      continue;
    }
    if (arg.startsWith('--marketplace=')) {
      marketplace = arg.slice('--marketplace='.length);
      i += 1;
      continue;
    }
    if (arg === '--asset-start-date') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('Missing value for --asset-start-date');
      assetStartDate = next;
      i += 2;
      continue;
    }
    if (arg.startsWith('--asset-start-date=')) {
      assetStartDate = arg.slice('--asset-start-date='.length);
      i += 1;
      continue;
    }
    if (arg === '--asset-end-date') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('Missing value for --asset-end-date');
      assetEndDate = next;
      i += 2;
      continue;
    }
    if (arg.startsWith('--asset-end-date=')) {
      assetEndDate = arg.slice('--asset-end-date='.length);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { marketplace, assetStartDate, assetEndDate };
}

function marketForMarketplace(marketplace: string): string {
  if (marketplace === 'amazon.com') return 'us';
  if (marketplace === 'amazon.co.uk') return 'uk';
  throw new Error(`Unsupported marketplace for QBO inventory bridge audit: ${marketplace}`);
}

function settlementTxnDate(rows: AuditRow[]): string {
  const dates = rows.map((row) => row.date).sort();
  const last = dates[dates.length - 1];
  if (last === undefined) throw new Error('Cannot determine settlement txn date without audit rows');
  return last;
}

function isSoldPrincipalRow(row: AuditRow): boolean {
  return row.quantity > 0 && normalizeSettlementOperatingMemo(row.description) === 'Amazon Sales - Principal';
}

function soldUnitsFromRows(rows: AuditRow[]): ExactSoldUnitInput[] {
  const qtyBySku = new Map<string, number>();
  for (const row of rows) {
    if (!isSoldPrincipalRow(row)) continue;
    const sellerSku = row.sku.trim().toUpperCase();
    if (sellerSku === '') continue;
    qtyBySku.set(sellerSku, (qtyBySku.get(sellerSku) ?? 0) + row.quantity);
  }
  return Array.from(qtyBySku.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([sellerSku, quantity]) => ({ sellerSku, quantity }));
}

function parsePlutusNativeInventoryAdjustment(
  adjustment: QboInventoryAdjustment,
): { settlementDocNumber: string; marketplace: string } | null {
  const note = adjustment.PrivateNote?.trim();
  if (note === undefined || note === '') return null;

  const match = /^Plutus inventory movement \| Settlement: (US-\d{6}-\d{6}-S\d+) \| Marketplace: (amazon\.com)$/.exec(note);
  if (match === null) return null;

  return {
    settlementDocNumber: match[1]!,
    marketplace: match[2]!,
  };
}

function nativeInventoryAdjustmentQuantity(adjustment: QboInventoryAdjustment): number {
  return (adjustment.Line ?? []).reduce((sum, line) => {
    const qty = line.ItemAdjustmentLineDetail?.QtyDiff;
    if (qty === undefined) return sum;
    return sum + qty;
  }, 0);
}

async function fetchQboLegacyNativeInventoryAdjustments(input: { marketplace: string }) {
  const activeConnection = await getActiveQboConnection();
  const result = await qboQueryAll(activeConnection, 'SELECT * FROM InventoryAdjustment');
  return (result.rows as QboInventoryAdjustment[])
    .map((adjustment) => {
      const parsed = parsePlutusNativeInventoryAdjustment(adjustment);
      if (parsed === null) return null;
      if (parsed.marketplace !== input.marketplace) return null;
      return {
        id: adjustment.Id ?? null,
        docNumber: adjustment.DocNumber ?? null,
        txnDate: adjustment.TxnDate ?? null,
        settlementDocNumber: parsed.settlementDocNumber,
        quantityDelta: nativeInventoryAdjustmentQuantity(adjustment),
        privateNote: adjustment.PrivateNote ?? null,
      };
    })
    .filter((row) => row !== null)
    .sort((left, right) => {
      const dateCompare = (left.txnDate ?? '').localeCompare(right.txnDate ?? '');
      if (dateCompare !== 0) return dateCompare;
      return (left.docNumber ?? '').localeCompare(right.docNumber ?? '');
    });
}

function qboLineRefFromIds(billId: string, qboLineId: string): string {
  return `${billId}:${qboLineId}`;
}

function qboSourceLineKey(line: ParsedQboInventoryAssetLine): string {
  return [
    line.billId,
    line.qboLineId,
    line.purchaseOrderSourceType,
    line.purchaseOrderSourceId,
    line.sellerSku ?? 'NO_SKU',
    line.component,
  ].join(':');
}

function centsToMoney(value: number): number {
  return value / 100;
}

function linkedPurchaseOrder(line: QboBillLine): QboLinkedTxn | null {
  for (const linkedTxn of line.LinkedTxn ?? []) {
    if (linkedTxn.TxnType === 'PurchaseOrder') return linkedTxn;
  }
  return null;
}

function collectLinkedPurchaseOrderIds(bills: QboBill[]): string[] {
  const ids = new Set<string>();
  for (const bill of bills) {
    for (const line of bill.Line ?? []) {
      const linkedTxn = linkedPurchaseOrder(line);
      if (linkedTxn === null) continue;
      ids.add(linkedTxn.TxnId);
    }
  }
  return Array.from(ids).sort();
}

async function fetchLinkedPurchaseOrders(input: {
  connection: QboConnection;
  purchaseOrderIds: string[];
}): Promise<{ purchaseOrdersById: Map<string, QboPurchaseOrder>; updatedConnection: QboConnection }> {
  let activeConnection = input.connection;
  const purchaseOrdersById = new Map<string, QboPurchaseOrder>();
  for (const purchaseOrderId of input.purchaseOrderIds) {
    const result = await fetchPurchaseOrderById(activeConnection, purchaseOrderId);
    if (result.updatedConnection !== undefined) {
      activeConnection = result.updatedConnection;
    }
    purchaseOrdersById.set(result.purchaseOrder.Id, result.purchaseOrder);
  }
  return { purchaseOrdersById, updatedConnection: activeConnection };
}

function purchaseOrderLine(input: {
  purchaseOrder: QboPurchaseOrder;
  linkedTxn: QboLinkedTxn;
}): NonNullable<QboPurchaseOrder['Line']>[number] | null {
  const txnLineId = input.linkedTxn.TxnLineId;
  if (txnLineId === undefined || txnLineId === '') return null;
  for (const line of input.purchaseOrder.Line ?? []) {
    if (line.Id === txnLineId) return line;
  }
  throw new Error(`QBO PurchaseOrder ${input.purchaseOrder.Id} does not contain linked line ${txnLineId}`);
}

function nativePurchaseOrderRef(input: {
  line: QboBillLine;
  purchaseOrdersById: Map<string, QboPurchaseOrder>;
}): QboInventoryAssetLineNativePurchaseOrderRef | undefined {
  const linkedTxn = linkedPurchaseOrder(input.line);
  if (linkedTxn === null) return undefined;
  const purchaseOrder = input.purchaseOrdersById.get(linkedTxn.TxnId);
  if (purchaseOrder === undefined) {
    throw new Error(`QBO PurchaseOrder ${linkedTxn.TxnId} was linked from bill line ${input.line.Id} but was not fetched`);
  }
  const docNumber = purchaseOrder.DocNumber?.trim();
  if (docNumber === undefined || docNumber === '') {
    throw new Error(`QBO PurchaseOrder ${purchaseOrder.Id} is missing DocNumber`);
  }
  const poLine = purchaseOrderLine({ purchaseOrder, linkedTxn });
  const billItem = input.line.ItemBasedExpenseLineDetail?.ItemRef;
  const poItem = poLine?.ItemBasedExpenseLineDetail?.ItemRef;
  const item = poItem ?? billItem ?? null;
  return {
    qboPurchaseOrderId: purchaseOrder.Id,
    qboPurchaseOrderLineId: linkedTxn.TxnLineId ?? null,
    qboPurchaseOrderDocNumber: docNumber,
    qboItemId: item?.value ?? null,
    qboItemName: item?.name ?? null,
    quantity: poLine?.ItemBasedExpenseLineDetail?.Qty ?? input.line.ItemBasedExpenseLineDetail?.Qty ?? null,
  };
}

function allocationInput(row: QboLandedCostAllocationRow): QboInventoryAssetLineAllocation {
  return {
    qboPurchaseOrderId: row.qboPurchaseOrderId,
    qboPurchaseOrderLineId: row.qboPurchaseOrderLineId,
    qboPurchaseOrderDocNumber: row.qboPurchaseOrderDocNumber,
    sellerSku: row.sellerSku,
    component: row.component,
    amount: centsToMoney(row.amountCents),
    quantity: row.quantity,
    allocationMethod: row.allocationMethod,
    sourceRef: row.sourceRef,
  };
}

function receiptDateForLayer(input: {
  layer: QboInventoryLandedCostLayer;
  parsedLines: ParsedQboInventoryAssetLine[];
}): string {
  const qboRefs = new Set(input.layer.qboSourceLineKeys);
  const dates = input.parsedLines
    .filter((line) => qboRefs.has(qboSourceLineKey(line)))
    .map((line) => line.billDate)
    .sort();
  const lastDate = dates[dates.length - 1];
  if (lastDate === undefined) {
    throw new Error(`Cannot determine receipt date for ${input.layer.internalPo} ${input.layer.sellerSku}`);
  }
  return lastDate;
}

function exactLayersFromQbo(input: {
  marketplace: string;
  layers: QboInventoryLandedCostLayer[];
  parsedLines: ParsedQboInventoryAssetLine[];
}): ExactCostLayerInput[] {
  return input.layers.map((layer) => ({
    layerId: `${layer.internalPo}:${layer.sellerSku}`,
    marketplace: input.marketplace,
    internalPo: layer.internalPo,
    sellerSku: layer.sellerSku,
    receiptDate: receiptDateForLayer({ layer, parsedLines: input.parsedLines }),
    quantity: layer.quantity,
    componentAmounts: layer.componentAmounts,
    sourceRefs: layer.sourceRefs,
    qboBillLineRefs: layer.qboBillLineRefs,
  }));
}

async function fetchAllBillsInWindow(input: {
  connection: QboConnection;
  startDate: string;
  endDate: string;
}): Promise<{ bills: QboBill[]; updatedConnection: QboConnection }> {
  const maxResults = 1000;
  let startPosition = 1;
  let activeConnection = input.connection;
  const bills: QboBill[] = [];

  while (true) {
    const page = await fetchBills(activeConnection, {
      startDate: input.startDate,
      endDate: input.endDate,
      maxResults,
      startPosition,
      includeTotalCount: false,
    });
    if (page.updatedConnection !== undefined) {
      activeConnection = page.updatedConnection;
    }

    bills.push(...page.bills);
    if (page.bills.length < maxResults) break;
    startPosition += page.bills.length;
  }

  return { bills, updatedConnection: activeConnection };
}

async function fetchPostedSettlementDocNumbers(input: {
  connection: QboConnection;
  marketplace: string;
  startDate: string;
}): Promise<{ docNumbers: Set<string>; updatedConnection: QboConnection }> {
  const docNumberContains = input.marketplace === 'amazon.com' ? 'US-' : 'UK-';
  const pageSize = 100;
  let startPosition = 1;
  let connection = input.connection;
  const docNumbers = new Set<string>();

  while (true) {
    const page = await fetchJournalEntries(connection, {
      docNumberContains,
      startDate: input.startDate,
      maxResults: pageSize,
      startPosition,
    });
    if (page.updatedConnection !== undefined) {
      connection = page.updatedConnection;
    }

    for (const entry of page.journalEntries) {
      const docNumber = entry.DocNumber?.trim();
      if (docNumber === undefined || docNumber === '') continue;
      if (docNumber.toUpperCase().startsWith('COGS-')) continue;
      if (docNumber.toUpperCase().startsWith('C-')) continue;
      if (!isSettlementDocNumber(docNumber)) continue;
      const parsed = parseSettlementDocNumber(docNumber);
      if (parsed.marketplace.id !== input.marketplace) continue;
      docNumbers.add(normalizeSettlementDocNumber(docNumber));
    }

    if (page.journalEntries.length === 0) break;
    startPosition += page.journalEntries.length;
    if (startPosition > page.totalCount) break;
  }

  return { docNumbers, updatedConnection: connection };
}

function collectInventoryAssetLines(input: {
  bills: QboBill[];
  purchaseOrdersById: Map<string, QboPurchaseOrder>;
  allocationsByBillLineRef: Map<string, QboLandedCostAllocationRow[]>;
}): QboInventoryAssetLineInput[] {
  const lines: QboInventoryAssetLineInput[] = [];
  for (const bill of input.bills) {
    for (const line of bill.Line ?? []) {
      const accountName =
        line.AccountBasedExpenseLineDetail?.AccountRef.name ??
        line.ItemBasedExpenseLineDetail?.AccountRef?.name ??
        (line.ItemBasedExpenseLineDetail?.ItemRef !== undefined && linkedPurchaseOrder(line) !== null ? 'Inventory Asset' : undefined);
      if (accountName === undefined) continue;
      if (accountName !== 'Inventory Asset' && !accountName.startsWith('Inventory Asset:')) continue;
      if (line.Id === undefined) throw new Error(`QBO bill ${bill.Id} has an inventory asset line without line id`);
      const nativeRef = nativePurchaseOrderRef({ line, purchaseOrdersById: input.purchaseOrdersById });
      const baseLine = {
        billId: bill.Id,
        ...(bill.DocNumber !== undefined ? { billDocNumber: bill.DocNumber } : {}),
        billDate: bill.TxnDate,
        ...(bill.VendorRef?.name !== undefined ? { vendorName: bill.VendorRef.name } : {}),
        qboLineId: line.Id,
        accountName,
        amount: line.Amount,
        ...(line.Description !== undefined ? { description: line.Description } : {}),
        ...(line.ItemBasedExpenseLineDetail?.ItemRef?.value !== undefined
          ? { qboItemId: line.ItemBasedExpenseLineDetail.ItemRef.value }
          : {}),
        ...(line.ItemBasedExpenseLineDetail?.ItemRef?.name !== undefined
          ? { qboItemName: line.ItemBasedExpenseLineDetail.ItemRef.name }
          : {}),
        ...(line.ItemBasedExpenseLineDetail?.Qty !== undefined ? { qboQuantity: line.ItemBasedExpenseLineDetail.Qty } : {}),
      };
      const allocations = input.allocationsByBillLineRef.get(qboLineRefFromIds(bill.Id, line.Id)) ?? [];
      if (allocations.length > 0) {
        for (const allocation of allocations) {
          lines.push({
            ...baseLine,
            landedCostAllocation: allocationInput(allocation),
          });
        }
        continue;
      }
      lines.push({
        ...baseLine,
        ...(nativeRef !== undefined ? { nativePurchaseOrderRef: nativeRef } : {}),
      });
    }
  }
  return lines;
}

async function main(): Promise<void> {
  loadSharedPlutusEnv();
  const options = parseArgs(process.argv.slice(2));
  const market = marketForMarketplace(options.marketplace);
  const qboConnection = await getQboConnection();
  if (qboConnection === null) throw new Error('QBO connection is not configured');

  const [auditRows, qboBillsResult] = await Promise.all([
    db.auditDataRow.findMany({
      where: { market: { equals: market, mode: 'insensitive' } },
      select: {
        invoiceId: true,
        market: true,
        date: true,
        orderId: true,
        sku: true,
        quantity: true,
        description: true,
        net: true,
      },
      orderBy: [{ invoiceId: 'asc' }, { date: 'asc' }, { sku: 'asc' }],
    }),
    fetchAllBillsInWindow({
      connection: qboConnection,
      startDate: options.assetStartDate,
      endDate: options.assetEndDate,
    }),
  ]);
  const postedSettlements = await fetchPostedSettlementDocNumbers({
    connection: qboBillsResult.updatedConnection,
    marketplace: options.marketplace,
    startDate: '2025-12-01',
  });
  const linkedPurchaseOrderIds = collectLinkedPurchaseOrderIds(qboBillsResult.bills);
  const linkedPurchaseOrders = await fetchLinkedPurchaseOrders({
    connection: postedSettlements.updatedConnection,
    purchaseOrderIds: linkedPurchaseOrderIds,
  });
  await saveServerQboConnection(linkedPurchaseOrders.updatedConnection);

  const rowsByInvoice = new Map<string, AuditRow[]>();
  for (const row of auditRows) {
    const existing = rowsByInvoice.get(row.invoiceId);
    if (existing === undefined) {
      rowsByInvoice.set(row.invoiceId, [row]);
    } else {
      existing.push(row);
    }
  }

  const allocations = await db.qboLandedCostAllocation.findMany({
    where: {
      qboBillId: { in: qboBillsResult.bills.map((bill) => bill.Id) },
    },
  });
  const allocationsByBillLineRef = new Map<string, QboLandedCostAllocationRow[]>();
  for (const allocation of allocations) {
    const key = qboLineRefFromIds(allocation.qboBillId, allocation.qboBillLineId);
    const existing = allocationsByBillLineRef.get(key) ?? [];
    existing.push(allocation as QboLandedCostAllocationRow);
    allocationsByBillLineRef.set(key, existing);
  }

  const qboInventoryAssetLines = collectInventoryAssetLines({
    bills: qboBillsResult.bills,
    purchaseOrdersById: linkedPurchaseOrders.purchaseOrdersById,
    allocationsByBillLineRef,
  });
  const qboAssetPlan = buildQboInventoryLandedCostPlan({
    marketplace: options.marketplace,
    lines: qboInventoryAssetLines,
  });
  const qboInventoryAssetReclassPlan = buildQboInventoryAssetReclassPlan({
    marketplace: options.marketplace,
    lines: qboInventoryAssetLines,
  });
  const marketAssetLines = qboAssetPlan.parsedLines.filter((line) => {
    if (line.marketCode === qboAssetPlan.marketCode) return true;
    return line.marketCode === null && line.qboPurchaseOrderId !== null;
  });
  const exactCostLayers = exactLayersFromQbo({
    marketplace: options.marketplace,
    layers: qboAssetPlan.layers,
    parsedLines: marketAssetLines,
  });

  const previewExactConsumptions: ExactCostLayerConsumptionInput[] = [];
  const sortedInvoiceRows = Array.from(rowsByInvoice.entries()).sort((left, right) => {
      const dateCompare = settlementTxnDate(left[1]).localeCompare(settlementTxnDate(right[1]));
      if (dateCompare !== 0) return dateCompare;
      return left[0].localeCompare(right[0]);
  });

  const plutusExactCogsPreview = sortedInvoiceRows.map(([invoiceId, rows]) => {
      const plan = buildExactCogsPlan({
        marketplace: options.marketplace,
        settlementDocNumber: invoiceId,
        txnDate: settlementTxnDate(rows),
        soldUnits: soldUnitsFromRows(rows),
        layers: exactCostLayers,
        priorConsumptions: previewExactConsumptions,
        componentAccountIds: {
          manufacturing: 'QBO_COGS_MANUFACTURING_ACCOUNT_REQUIRED',
          freight: 'QBO_COGS_FREIGHT_ACCOUNT_REQUIRED',
          duty: 'QBO_COGS_DUTY_ACCOUNT_REQUIRED',
          mfgAccessories: 'QBO_COGS_ACCESSORIES_ACCOUNT_REQUIRED',
        },
        inventoryAssetAccountId: 'QBO_INVENTORY_ASSET_PLUTUS_ACCOUNT_REQUIRED',
      });
      if (plan.ok) {
        const mappedConsumptions = plan.consumptions.map((consumption) => ({
          layerId: consumption.layerId,
          settlementDocNumber: consumption.settlementDocNumber,
          sellerSku: consumption.sellerSku,
          quantity: consumption.quantity,
          componentAmounts: consumption.componentAmounts,
          totalAmount: consumption.totalAmount,
        }));
        previewExactConsumptions.push(...mappedConsumptions);
      }
      return {
        settlementDocNumber: invoiceId,
        txnDate: settlementTxnDate(rows),
        ok: plan.ok,
        soldUnits: soldUnitsFromRows(rows),
        blocks: plan.blocks,
        consumptionCount: plan.consumptions.length,
        componentTotals: plan.componentTotals,
        totalCogsAmount: plan.consumptions.reduce((sum, consumption) => sum + consumption.totalAmount, 0),
        qboJournalEntryDraft: plan.qboJournalEntryDraft,
      };
    });

  const processedExactConsumptions: ExactCostLayerConsumptionInput[] = [];
  const plutusExactPostedCogsPreview = sortedInvoiceRows
    .filter(([invoiceId]) => postedSettlements.docNumbers.has(invoiceId))
    .map(([invoiceId, rows]) => {
      const plan = buildExactCogsPlan({
        marketplace: options.marketplace,
        settlementDocNumber: invoiceId,
        txnDate: settlementTxnDate(rows),
        soldUnits: soldUnitsFromRows(rows),
        layers: exactCostLayers,
        priorConsumptions: processedExactConsumptions,
        componentAccountIds: {
          manufacturing: 'QBO_COGS_MANUFACTURING_ACCOUNT_REQUIRED',
          freight: 'QBO_COGS_FREIGHT_ACCOUNT_REQUIRED',
          duty: 'QBO_COGS_DUTY_ACCOUNT_REQUIRED',
          mfgAccessories: 'QBO_COGS_ACCESSORIES_ACCOUNT_REQUIRED',
        },
        inventoryAssetAccountId: 'QBO_INVENTORY_ASSET_PLUTUS_ACCOUNT_REQUIRED',
      });
      if (plan.ok) {
        processedExactConsumptions.push(
          ...plan.consumptions.map((consumption) => ({
            layerId: consumption.layerId,
            settlementDocNumber: consumption.settlementDocNumber,
            sellerSku: consumption.sellerSku,
            quantity: consumption.quantity,
            componentAmounts: consumption.componentAmounts,
            totalAmount: consumption.totalAmount,
          })),
        );
      }
      return {
        settlementDocNumber: invoiceId,
        txnDate: settlementTxnDate(rows),
        ok: plan.ok,
        soldUnits: soldUnitsFromRows(rows),
        blocks: plan.blocks,
        consumptionCount: plan.consumptions.length,
        componentTotals: plan.componentTotals,
        totalCogsAmount: plan.consumptions.reduce((sum, consumption) => sum + consumption.totalAmount, 0),
        qboJournalEntryDraft: plan.qboJournalEntryDraft,
      };
    });
  const plutusExactInventoryValuation = buildPlutusInventoryValuation({
    layers: exactCostLayers,
    consumptions: processedExactConsumptions,
  });

  let activeConnection = qboBillsResult.updatedConnection;
  const valuationReportResult = await fetchQboReport(activeConnection, 'InventoryValuationSummary', {
    report_date: options.assetEndDate,
  });
  if (valuationReportResult.updatedConnection !== undefined) {
    activeConnection = valuationReportResult.updatedConnection;
  }
  const qboInventoryValuation = parseQboInventoryValuationSummary(
    valuationReportResult.report as Parameters<typeof parseQboInventoryValuationSummary>[0],
  );

  const inventoryAssetAccountResult = await fetchAccountsByFullyQualifiedName(activeConnection, 'Inventory Asset');
  if (inventoryAssetAccountResult.updatedConnection !== undefined) {
    activeConnection = inventoryAssetAccountResult.updatedConnection;
  }
  await saveServerQboConnection(activeConnection);

  const inventoryAssetAccount = inventoryAssetAccountResult.accounts.find((account) => account.Active !== false);
  if (inventoryAssetAccount === undefined) {
    throw new Error('Active QBO account not found: Inventory Asset');
  }
  const inventoryAssetBalance = inventoryAssetAccount.CurrentBalanceWithSubAccounts ?? inventoryAssetAccount.CurrentBalance;
  if (inventoryAssetBalance === undefined) {
    throw new Error('QBO Inventory Asset account is missing current balance');
  }
  const qboInventoryValuationTieout = assessQboInventoryValuationTieout({
    inventoryAssetBalance,
    inventoryValuationAssetValue: qboInventoryValuation.totalAssetValue,
  });
  const qboVsPlutusExactInventoryTieout = {
    ok: Math.abs(inventoryAssetBalance - plutusExactInventoryValuation.totalRemainingAmount) <= 0.01,
    qboInventoryAssetBalance: inventoryAssetBalance,
    plutusExactRemainingAmount: plutusExactInventoryValuation.totalRemainingAmount,
    delta: Number((inventoryAssetBalance - plutusExactInventoryValuation.totalRemainingAmount).toFixed(2)),
    tolerance: 0.01,
  };
  const qboLegacyNativeInventoryAdjustments = await fetchQboLegacyNativeInventoryAdjustments({
    marketplace: options.marketplace,
  });

  const ok =
    qboAssetPlan.blocks.length === 0 &&
    plutusExactCogsPreview.every((preview) => preview.ok) &&
    plutusExactPostedCogsPreview.every((preview) => preview.ok) &&
    qboInventoryAssetReclassPlan.lines.length === 0 &&
    qboLegacyNativeInventoryAdjustments.length === 0 &&
    qboVsPlutusExactInventoryTieout.ok;

  console.log(
    JSON.stringify(
      {
        ok,
        marketplace: options.marketplace,
        market,
        invoicesScanned: rowsByInvoice.size,
        qboInventoryAssetWindow: {
          startDate: options.assetStartDate,
          endDate: options.assetEndDate,
        },
        postedSettlementCount: postedSettlements.docNumbers.size,
        qboInventoryAssetLines: marketAssetLines.length,
        qboLandedCostLayers: qboAssetPlan.layers,
        qboInventoryAssetBlocks: qboAssetPlan.blocks,
        qboLegacyNativeInventoryAdjustments,
        plutusExactInventoryValuation,
        plutusExactCogsPreview,
        plutusExactPostedCogsPreview,
        qboInventoryAssetReclassPlan,
        qboInventoryValuation,
        qboInventoryValuationTieout,
        qboVsPlutusExactInventoryTieout,
      },
      null,
      2,
    ),
  );

  if (!ok) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
