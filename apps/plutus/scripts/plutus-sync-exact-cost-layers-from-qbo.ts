import crypto from 'node:crypto';

import { db } from '@/lib/db';
import {
  buildQboInventoryLandedCostPlan,
  type ParsedQboInventoryAssetLine,
  type QboInventoryAssetComponent,
  type QboInventoryAssetLineInput,
  type QboInventoryLandedCostLayer,
} from '@/lib/plutus/qbo-inventory-asset-lines';
import { fetchBills, type QboBill, type QboConnection } from '@/lib/qbo/api';
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

function collectInventoryAssetLines(bills: QboBill[]): QboInventoryAssetLineInput[] {
  const lines: QboInventoryAssetLineInput[] = [];
  for (const bill of bills) {
    for (const line of bill.Line ?? []) {
      const accountName = line.AccountBasedExpenseLineDetail?.AccountRef.name;
      if (accountName === undefined) continue;
      if (accountName !== 'Inventory Asset' && !accountName.startsWith('Inventory Asset:')) continue;
      if (line.Id === undefined) throw new Error(`QBO bill ${bill.Id} has an inventory asset line without line id`);
      lines.push({
        billId: bill.Id,
        ...(bill.DocNumber !== undefined ? { billDocNumber: bill.DocNumber } : {}),
        billDate: bill.TxnDate,
        ...(bill.VendorRef?.name !== undefined ? { vendorName: bill.VendorRef.name } : {}),
        qboLineId: line.Id,
        accountName,
        amount: line.Amount,
        ...(line.Description !== undefined ? { description: line.Description } : {}),
      });
    }
  }
  return lines;
}

function qboLineRef(line: ParsedQboInventoryAssetLine): string {
  return `${line.billId}:${line.qboLineId}`;
}

function receiptDateForLayer(input: {
  layer: QboInventoryLandedCostLayer;
  parsedLines: ParsedQboInventoryAssetLine[];
}): string {
  const qboRefs = new Set(input.layer.qboBillLineRefs);
  const dates = input.parsedLines
    .filter((line) => qboRefs.has(qboLineRef(line)))
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
    sellerSku: line.sellerSku,
    quantity: line.quantity,
    sourceRef: line.sourceRef,
  });
}

async function syncQboLayer(input: {
  layer: QboInventoryLandedCostLayer;
  parsedLines: ParsedQboInventoryAssetLine[];
  marketplace: string;
  currency: string;
  productGroupId: string;
}): Promise<SyncSummary> {
  const layerLines = input.parsedLines.filter((line) => input.layer.qboBillLineRefs.includes(qboLineRef(line)));
  if (layerLines.length === 0) {
    throw new Error(`No source bill lines found for ${input.layer.internalPo} ${input.layer.sellerSku}`);
  }

  const po = await db.purchaseOrder.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: 'QBO_PO',
        sourceId: input.layer.internalPo,
      },
    },
    update: {
      supplierRef: input.layer.sourceRefs.join('; '),
      marketplace: input.marketplace,
      status: 'LOCKED',
    },
    create: {
      internalRef: input.layer.internalPo,
      sourceType: 'QBO_PO',
      sourceId: input.layer.internalPo,
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
        allocationMethod: 'QBO_BILL_LINE',
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
        allocationMethod: 'QBO_BILL_LINE',
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
  await saveServerQboConnection(qboBillsResult.updatedConnection);

  const qboInventoryAssetLines = collectInventoryAssetLines(qboBillsResult.bills);
  const qboAssetPlan = buildQboInventoryLandedCostPlan({
    marketplace: options.marketplace,
    lines: qboInventoryAssetLines,
  });
  if (qboAssetPlan.blocks.length > 0) {
    throw new Error(`Cannot sync exact cost layers while QBO asset blocks exist: ${JSON.stringify(qboAssetPlan.blocks)}`);
  }

  const marketAssetLines = qboAssetPlan.parsedLines.filter((line) => line.marketCode === qboAssetPlan.marketCode);
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
