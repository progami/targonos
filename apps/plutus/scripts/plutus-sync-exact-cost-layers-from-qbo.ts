import crypto from 'node:crypto';

import { db } from '@/lib/db';
import {
  buildQboInventoryLandedCostPlan,
  type QboInventoryAssetLineAllocation,
  type QboInventoryAssetLineNativePurchaseOrderRef,
  type ParsedQboInventoryAssetLine,
  type QboInventoryAssetComponent,
  type QboInventoryAssetLineInput,
  type QboInventoryLandedCostLayer,
} from '@/lib/plutus/qbo-inventory-asset-lines';
import {
  fetchBills,
  fetchPurchaseOrderById,
  type QboBill,
  type QboConnection,
  type QboLinkedTxn,
  type QboPurchaseOrder,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { loadSharedPlutusEnv } from './shared-env';

type CliOptions = {
  marketplace: string;
  startDate: string;
  endDate: string;
};

type SyncSummary = {
  purchaseOrders: number;
  canonicalProducts: number;
  sourceDocuments: number;
  poCostLayers: number;
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

const PRODUCT_GROUP_CODE = 'PDS';
const PRODUCT_GROUP_NAME = 'PDS Products';

function parseArgs(argv: string[]): CliOptions {
  let marketplace = 'amazon.com';
  let startDate = '2025-01-01';
  let endDate = new Date().toISOString().slice(0, 10);

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
    if (arg === '--start-date') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('Missing value for --start-date');
      startDate = next;
      i += 2;
      continue;
    }
    if (arg.startsWith('--start-date=')) {
      startDate = arg.slice('--start-date='.length);
      i += 1;
      continue;
    }
    if (arg === '--end-date') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('Missing value for --end-date');
      endDate = next;
      i += 2;
      continue;
    }
    if (arg.startsWith('--end-date=')) {
      endDate = arg.slice('--end-date='.length);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { marketplace, startDate, endDate };
}

function currencyForMarketplace(marketplace: string): string {
  if (marketplace === 'amazon.com') return 'USD';
  if (marketplace === 'amazon.co.uk') return 'GBP';
  throw new Error(`Unsupported marketplace for exact cost-layer sync: ${marketplace}`);
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

function qboLineRefFromIds(billId: string, qboLineId: string): string {
  return `${billId}:${qboLineId}`;
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

function qboLineRef(line: ParsedQboInventoryAssetLine): string {
  return `${line.billId}:${line.qboLineId}`;
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

function hashJson(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function sourceDocumentHash(line: ParsedQboInventoryAssetLine): string {
  return hashJson({
    billId: line.billId,
    qboLineId: line.qboLineId,
    accountName: line.accountName,
    amount: line.amount,
    descriptionKind: line.descriptionKind,
    internalPo: line.internalPo,
    purchaseOrderSourceType: line.purchaseOrderSourceType,
    purchaseOrderSourceId: line.purchaseOrderSourceId,
    qboPurchaseOrderId: line.qboPurchaseOrderId,
    qboPurchaseOrderLineId: line.qboPurchaseOrderLineId,
    qboItemId: line.qboItemId,
    sellerSku: line.sellerSku,
    quantity: line.quantity,
    sourceRef: line.sourceRef,
  });
}

function sourceAllocationMethod(lines: ParsedQboInventoryAssetLine[]): string {
  const methods = new Set(
    lines.map((line) => {
      if (line.qboPurchaseOrderId !== null && line.qboPurchaseOrderLineId !== null) return 'QBO_NATIVE_PO_LINE';
      if (line.qboPurchaseOrderId !== null) return 'PLUTUS_QBO_PO_ALLOCATION';
      return 'LEGACY_DESCRIPTION';
    }),
  );
  if (methods.size !== 1) {
    throw new Error(`Cannot collapse mixed allocation methods into one cost layer component: ${Array.from(methods).sort().join(', ')}`);
  }
  const method = Array.from(methods)[0];
  if (method === undefined) throw new Error('Cannot resolve allocation method for empty source lines');
  return method;
}

async function syncQboLayer(input: {
  layer: QboInventoryLandedCostLayer;
  parsedLines: ParsedQboInventoryAssetLine[];
  marketplace: string;
  currency: string;
  productGroupId: string;
}): Promise<SyncSummary> {
  const layerLines = input.parsedLines.filter((line) => input.layer.qboSourceLineKeys.includes(qboSourceLineKey(line)));
  if (layerLines.length === 0) {
    throw new Error(`No source bill lines found for ${input.layer.internalPo} ${input.layer.sellerSku}`);
  }

  const po = await db.purchaseOrder.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: input.layer.purchaseOrderSourceType,
        sourceId: input.layer.purchaseOrderSourceId,
      },
    },
    update: {
      supplierRef: input.layer.sourceRefs.join('; '),
      marketplace: input.marketplace,
      status: 'LOCKED',
    },
    create: {
      internalRef: input.layer.internalPo,
      sourceType: input.layer.purchaseOrderSourceType,
      sourceId: input.layer.purchaseOrderSourceId,
      supplierRef: input.layer.sourceRefs.join('; '),
      marketplace: input.marketplace,
      status: 'LOCKED',
    },
  });

  const product = await db.canonicalProduct.upsert({
    where: { code: input.layer.sellerSku },
    update: {
      name: input.layer.sellerSku,
      active: true,
    },
    create: {
      productGroupId: input.productGroupId,
      code: input.layer.sellerSku,
      name: input.layer.sellerSku,
      active: true,
    },
  });

  await db.skuAlias.upsert({
    where: {
      marketplace_normalizedSellerSku: {
        marketplace: input.marketplace,
        normalizedSellerSku: input.layer.sellerSku,
      },
    },
    update: {
      canonicalProductId: product.id,
      aliasType: 'SELLER_SKU',
      value: input.layer.sellerSku,
      active: true,
    },
    create: {
      canonicalProductId: product.id,
      marketplace: input.marketplace,
      aliasType: 'SELLER_SKU',
      value: input.layer.sellerSku,
      normalizedSellerSku: input.layer.sellerSku,
      active: true,
    },
  });

  const batch = await db.landedCostBatch.upsert({
    where: {
      purchaseOrderId_batchRef: {
        purchaseOrderId: po.id,
        batchRef: `LCB-${input.layer.internalPo}`,
      },
    },
    update: {
      marketplace: input.marketplace,
      currency: input.currency,
      status: 'LOCKED',
      lockedAt: new Date(),
    },
    create: {
      purchaseOrderId: po.id,
      batchRef: `LCB-${input.layer.internalPo}`,
      marketplace: input.marketplace,
      currency: input.currency,
      status: 'LOCKED',
      lockedAt: new Date(),
    },
  });

  let sourceDocuments = 0;
  for (const line of layerLines) {
    await db.sourceDocument.upsert({
      where: {
        qboTxnType_qboTxnId_qboLineId: {
          qboTxnType: 'Bill',
          qboTxnId: line.billId,
          qboLineId: line.qboLineId,
        },
      },
      update: {
        purchaseOrderId: po.id,
        landedCostBatchId: batch.id,
        docNumber: line.billDocNumber ?? line.sourceRef,
        vendorName: line.vendorName,
        txnDate: line.billDate,
        qboPurchaseOrderId: line.qboPurchaseOrderId,
        qboPurchaseOrderLineId: line.qboPurchaseOrderLineId,
        amountCents: cents(line.amount),
        currency: input.currency,
        attachmentStatus: 'qbo',
        sourceHash: sourceDocumentHash(line),
      },
      create: {
        purchaseOrderId: po.id,
        landedCostBatchId: batch.id,
        qboTxnType: 'Bill',
        qboTxnId: line.billId,
        qboLineId: line.qboLineId,
        qboPurchaseOrderId: line.qboPurchaseOrderId,
        qboPurchaseOrderLineId: line.qboPurchaseOrderLineId,
        docNumber: line.billDocNumber ?? line.sourceRef,
        vendorName: line.vendorName,
        txnDate: line.billDate,
        amountCents: cents(line.amount),
        currency: input.currency,
        attachmentStatus: 'qbo',
        sourceHash: sourceDocumentHash(line),
      },
    });
    sourceDocuments += 1;
  }

  let poCostLayers = 0;
  for (const component of Object.keys(input.layer.componentAmounts) as QboInventoryAssetComponent[]) {
    const amount = input.layer.componentAmounts[component];
    if (amount === 0) continue;
    const sourceLines = layerLines.filter((line) => line.component === component);
    const sourceNames = sourceLines
      .map((line) => line.sourceRef ?? line.billDocNumber ?? `Bill:${line.billId}`)
      .sort()
      .join('; ');
    const allocationMethod = sourceAllocationMethod(sourceLines);

    await db.poCostLayer.upsert({
      where: {
        purchaseOrderId_canonicalProductId_component: {
          purchaseOrderId: po.id,
          canonicalProductId: product.id,
          component,
        },
      },
      update: {
        landedCostBatchId: batch.id,
        marketplace: input.marketplace,
        sellerSku: input.layer.sellerSku,
        quantity: input.layer.quantity,
        amountCents: cents(amount),
        currency: input.currency,
        allocationMethod,
        receiptDate: new Date(`${receiptDateForLayer({ layer: input.layer, parsedLines: input.parsedLines })}T00:00:00Z`),
        sourceQboTxnType: sourceLines.length === 1 ? 'Bill' : null,
        sourceQboTxnId: sourceLines.length === 1 ? sourceLines[0]!.billId : null,
        sourceQboLineId: sourceLines.length === 1 ? sourceLines[0]!.qboLineId : null,
        sourceDocumentName: sourceNames,
      },
      create: {
        purchaseOrderId: po.id,
        landedCostBatchId: batch.id,
        canonicalProductId: product.id,
        marketplace: input.marketplace,
        sellerSku: input.layer.sellerSku,
        component,
        quantity: input.layer.quantity,
        amountCents: cents(amount),
        currency: input.currency,
        allocationMethod,
        receiptDate: new Date(`${receiptDateForLayer({ layer: input.layer, parsedLines: input.parsedLines })}T00:00:00Z`),
        sourceQboTxnType: sourceLines.length === 1 ? 'Bill' : null,
        sourceQboTxnId: sourceLines.length === 1 ? sourceLines[0]!.billId : null,
        sourceQboLineId: sourceLines.length === 1 ? sourceLines[0]!.qboLineId : null,
        sourceDocumentName: sourceNames,
      },
    });
    poCostLayers += 1;
  }

  return {
    purchaseOrders: 1,
    canonicalProducts: 1,
    sourceDocuments,
    poCostLayers,
  };
}

async function main(): Promise<void> {
  loadSharedPlutusEnv();
  const options = parseArgs(process.argv.slice(2));
  const currency = currencyForMarketplace(options.marketplace);
  const qboConnection = await getQboConnection();
  if (qboConnection === null) throw new Error('QBO connection is not configured');

  const qboBillsResult = await fetchAllBillsInWindow({
    connection: qboConnection,
    startDate: options.startDate,
    endDate: options.endDate,
  });
  const linkedPurchaseOrderIds = collectLinkedPurchaseOrderIds(qboBillsResult.bills);
  const linkedPurchaseOrders = await fetchLinkedPurchaseOrders({
    connection: qboBillsResult.updatedConnection,
    purchaseOrderIds: linkedPurchaseOrderIds,
  });
  await saveServerQboConnection(linkedPurchaseOrders.updatedConnection);

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
  if (qboAssetPlan.blocks.length > 0) {
    throw new Error(`Cannot sync exact cost layers while QBO asset blocks exist: ${JSON.stringify(qboAssetPlan.blocks)}`);
  }

  const marketAssetLines = qboAssetPlan.parsedLines.filter((line) => {
    if (line.marketCode === qboAssetPlan.marketCode) return true;
    return line.marketCode === null && line.qboPurchaseOrderId !== null;
  });
  const productGroup = await db.productGroup.upsert({
    where: { code: PRODUCT_GROUP_CODE },
    update: {
      name: PRODUCT_GROUP_NAME,
      active: true,
    },
    create: {
      code: PRODUCT_GROUP_CODE,
      name: PRODUCT_GROUP_NAME,
      active: true,
    },
  });

  const summary: SyncSummary = {
    purchaseOrders: 0,
    canonicalProducts: 0,
    sourceDocuments: 0,
    poCostLayers: 0,
  };

  for (const layer of qboAssetPlan.layers) {
    const synced = await syncQboLayer({
      layer,
      parsedLines: marketAssetLines,
      marketplace: options.marketplace,
      currency,
      productGroupId: productGroup.id,
    });
    summary.purchaseOrders += synced.purchaseOrders;
    summary.canonicalProducts += synced.canonicalProducts;
    summary.sourceDocuments += synced.sourceDocuments;
    summary.poCostLayers += synced.poCostLayers;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        marketplace: options.marketplace,
        window: {
          startDate: options.startDate,
          endDate: options.endDate,
        },
        qboLandedCostLayers: qboAssetPlan.layers.length,
        summary,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
