import crypto from 'node:crypto';

import { normalizeSettlementOperatingMemo } from '@/lib/amazon-finances/settlement-memo-normalization';
import { db } from '@/lib/db';
import {
  buildExactCogsPlan,
  type ComponentAmounts,
  type ExactCostLayerConsumptionInput,
  type ExactCostLayerInput,
  type ExactSoldUnitInput,
} from '@/lib/plutus/exact-cost-layer-subledger';
import type { QboInventoryAssetComponent } from '@/lib/plutus/qbo-inventory-asset-lines';
import { fetchJournalEntries, type QboConnection } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { isSettlementDocNumber, normalizeSettlementDocNumber, parseSettlementDocNumber } from '@/lib/plutus/settlement-doc-number';
import { loadSharedPlutusEnv } from './shared-env';

type CliOptions = {
  marketplace: string;
};

type CostLayerRow = {
  id: string;
  purchaseOrderId: string;
  canonicalProductId: string;
  internalRef: string;
  marketplace: string;
  sellerSku: string;
  component: string;
  quantity: number;
  amountCents: number;
  currency: string;
  receiptDate: Date;
  sourceDocumentName: string | null;
  sourceQboTxnId: string | null;
  sourceQboLineId: string | null;
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

const COMPONENTS: QboInventoryAssetComponent[] = ['manufacturing', 'freight', 'duty', 'mfgAccessories'];

function parseArgs(argv: string[]): CliOptions {
  let marketplace = 'amazon.com';

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
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { marketplace };
}

function marketForMarketplace(marketplace: string): string {
  if (marketplace === 'amazon.com') return 'us';
  if (marketplace === 'amazon.co.uk') return 'uk';
  throw new Error(`Unsupported marketplace for exact COGS sync: ${marketplace}`);
}

function currencyForMarketplace(marketplace: string): string {
  if (marketplace === 'amazon.com') return 'USD';
  if (marketplace === 'amazon.co.uk') return 'GBP';
  throw new Error(`Unsupported marketplace for exact COGS sync: ${marketplace}`);
}

function emptyComponentAmounts(): ComponentAmounts {
  return {
    manufacturing: 0,
    freight: 0,
    duty: 0,
    mfgAccessories: 0,
  };
}

function normalizeComponent(value: string): QboInventoryAssetComponent {
  if (value === 'manufacturing') return 'manufacturing';
  if (value === 'freight') return 'freight';
  if (value === 'duty') return 'duty';
  if (value === 'mfgAccessories') return 'mfgAccessories';
  throw new Error(`Unsupported exact cost-layer component: ${value}`);
}

function dollarsFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function hashJson(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
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

function settlementTxnDate(rows: AuditRow[]): string {
  const dates = rows.map((row) => row.date).sort();
  const last = dates[dates.length - 1];
  if (last === undefined) throw new Error('Cannot determine settlement txn date without audit rows');
  return last;
}

function buildLayers(rows: CostLayerRow[]): {
  layers: ExactCostLayerInput[];
  metadataByLayerId: Map<string, { purchaseOrderId: string; canonicalProductId: string; anchorPoCostLayerId: string }>;
} {
  const grouped = new Map<
    string,
    {
      layerId: string;
      purchaseOrderId: string;
      canonicalProductId: string;
      anchorPoCostLayerId: string;
      marketplace: string;
      internalPo: string;
      sellerSku: string;
      receiptDate: string;
      quantity: number;
      componentAmounts: ComponentAmounts;
      sourceRefs: string[];
      qboBillLineRefs: string[];
    }
  >();

  for (const row of rows) {
    const layerId = `${row.internalRef}:${row.sellerSku}`;
    const existing = grouped.get(layerId) ?? {
      layerId,
      purchaseOrderId: row.purchaseOrderId,
      canonicalProductId: row.canonicalProductId,
      anchorPoCostLayerId: row.id,
      marketplace: row.marketplace,
      internalPo: row.internalRef,
      sellerSku: row.sellerSku,
      receiptDate: row.receiptDate.toISOString().slice(0, 10),
      quantity: row.quantity,
      componentAmounts: emptyComponentAmounts(),
      sourceRefs: [],
      qboBillLineRefs: [],
    };
    if (existing.quantity !== row.quantity) {
      throw new Error(`PO cost layer quantity mismatch for ${row.internalRef} ${row.sellerSku}`);
    }
    if (row.component === 'manufacturing') {
      existing.anchorPoCostLayerId = row.id;
    }
    const component = normalizeComponent(row.component);
    existing.componentAmounts[component] += dollarsFromCents(row.amountCents);
    if (row.sourceDocumentName !== null && !existing.sourceRefs.includes(row.sourceDocumentName)) {
      existing.sourceRefs.push(row.sourceDocumentName);
    }
    if (row.sourceQboTxnId !== null && row.sourceQboLineId !== null) {
      const ref = `${row.sourceQboTxnId}:${row.sourceQboLineId}`;
      if (!existing.qboBillLineRefs.includes(ref)) existing.qboBillLineRefs.push(ref);
    }
    grouped.set(layerId, existing);
  }

  const metadataByLayerId = new Map<string, { purchaseOrderId: string; canonicalProductId: string; anchorPoCostLayerId: string }>();
  const layers = Array.from(grouped.values())
    .sort((left, right) => {
      const dateCompare = left.receiptDate.localeCompare(right.receiptDate);
      if (dateCompare !== 0) return dateCompare;
      const poCompare = left.internalPo.localeCompare(right.internalPo);
      if (poCompare !== 0) return poCompare;
      return left.sellerSku.localeCompare(right.sellerSku);
    })
    .map((layer) => {
      metadataByLayerId.set(layer.layerId, {
        purchaseOrderId: layer.purchaseOrderId,
        canonicalProductId: layer.canonicalProductId,
        anchorPoCostLayerId: layer.anchorPoCostLayerId,
      });
      return {
        layerId: layer.layerId,
        marketplace: layer.marketplace,
        internalPo: layer.internalPo,
        sellerSku: layer.sellerSku,
        receiptDate: layer.receiptDate,
        quantity: layer.quantity,
        componentAmounts: layer.componentAmounts,
        sourceRefs: layer.sourceRefs.sort(),
        qboBillLineRefs: layer.qboBillLineRefs.sort(),
      };
    });

  return { layers, metadataByLayerId };
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

async function main(): Promise<void> {
  loadSharedPlutusEnv();
  const options = parseArgs(process.argv.slice(2));
  const market = marketForMarketplace(options.marketplace);
  const currency = currencyForMarketplace(options.marketplace);

  const [layerRows, auditRows] = await Promise.all([
    db.$queryRawUnsafe<CostLayerRow[]>(
      `
        SELECT
          layer."id",
          layer."purchaseOrderId",
          layer."canonicalProductId",
          po."internalRef",
          layer."marketplace",
          layer."sellerSku",
          layer."component",
          layer."quantity",
          layer."amountCents",
          layer."currency",
          layer."receiptDate",
          layer."sourceDocumentName",
          layer."sourceQboTxnId",
          layer."sourceQboLineId"
        FROM "PoCostLayer" layer
        INNER JOIN "PurchaseOrder" po ON po."id" = layer."purchaseOrderId"
        WHERE layer."marketplace" = $1
        ORDER BY po."internalRef" ASC, layer."sellerSku" ASC, layer."component" ASC
      `,
      options.marketplace,
    ),
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
  ]);

  const qboConnection = await getQboConnection();
  if (qboConnection === null) throw new Error('QBO connection is not configured');
  const postedSettlements = await fetchPostedSettlementDocNumbers({
    connection: qboConnection,
    marketplace: options.marketplace,
    startDate: '2025-12-01',
  });
  await saveServerQboConnection(postedSettlements.updatedConnection);
  const postedSettlementDocNumbers = Array.from(postedSettlements.docNumbers).sort();

  const { layers, metadataByLayerId } = buildLayers(layerRows);
  if (layers.length === 0) {
    throw new Error(`No exact cost layers exist for ${options.marketplace}`);
  }

  await db.cogsPostingBatch.deleteMany({
    where: {
      marketplace: options.marketplace,
      settlementDocNumber: { notIn: postedSettlementDocNumbers },
    },
  });

  const rowsByInvoice = new Map<string, AuditRow[]>();
  for (const row of auditRows) {
    if (!postedSettlements.docNumbers.has(row.invoiceId)) continue;
    const existing = rowsByInvoice.get(row.invoiceId);
    if (existing === undefined) {
      rowsByInvoice.set(row.invoiceId, [row]);
    } else {
      existing.push(row);
    }
  }

  const priorConsumptions: ExactCostLayerConsumptionInput[] = [];
  let batches = 0;
  let consumptionRows = 0;
  let sellerboardRows = 0;

  for (const [invoiceId, rows] of Array.from(rowsByInvoice.entries()).sort((left, right) => {
    const dateCompare = settlementTxnDate(left[1]).localeCompare(settlementTxnDate(right[1]));
    if (dateCompare !== 0) return dateCompare;
    return left[0].localeCompare(right[0]);
  })) {
    const plan = buildExactCogsPlan({
      marketplace: options.marketplace,
      settlementDocNumber: invoiceId,
      txnDate: settlementTxnDate(rows),
      soldUnits: soldUnitsFromRows(rows),
      layers,
      priorConsumptions,
      componentAccountIds: {
        manufacturing: 'QBO_COGS_MANUFACTURING_ACCOUNT_REQUIRED',
        freight: 'QBO_COGS_FREIGHT_ACCOUNT_REQUIRED',
        duty: 'QBO_COGS_DUTY_ACCOUNT_REQUIRED',
        mfgAccessories: 'QBO_COGS_ACCESSORIES_ACCOUNT_REQUIRED',
      },
      inventoryAssetAccountId: 'QBO_INVENTORY_ASSET_PLUTUS_ACCOUNT_REQUIRED',
    });
    if (!plan.ok) {
      throw new Error(`Exact COGS blocked for ${invoiceId}: ${JSON.stringify(plan.blocks)}`);
    }

    const existingBatch = await db.cogsPostingBatch.findUnique({
      where: {
        marketplace_settlementDocNumber: {
          marketplace: options.marketplace,
          settlementDocNumber: invoiceId,
        },
      },
      select: {
        status: true,
        qboJournalEntryId: true,
        qboDocNumber: true,
      },
    });
    const preservePostedBatch = existingBatch?.status === 'posted';
    if (preservePostedBatch && existingBatch.qboJournalEntryId === null) {
      throw new Error(`Exact COGS batch ${invoiceId} is posted without qboJournalEntryId`);
    }
    const batch = await db.cogsPostingBatch.upsert({
      where: {
        marketplace_settlementDocNumber: {
          marketplace: options.marketplace,
          settlementDocNumber: invoiceId,
        },
      },
      update: {
        txnDate: settlementTxnDate(rows),
        currency,
        status: preservePostedBatch ? 'posted' : 'processed',
        qboJournalEntryId: preservePostedBatch ? existingBatch.qboJournalEntryId : null,
        qboDocNumber: preservePostedBatch ? existingBatch.qboDocNumber : plan.qboJournalEntryDraft?.docNumber ?? null,
        sourceHash: hashJson(rows),
        postingHash: hashJson(plan.qboJournalEntryDraft),
      },
      create: {
        marketplace: options.marketplace,
        settlementDocNumber: invoiceId,
        txnDate: settlementTxnDate(rows),
        currency,
        status: 'processed',
        qboJournalEntryId: null,
        qboDocNumber: plan.qboJournalEntryDraft?.docNumber ?? null,
        sourceHash: hashJson(rows),
        postingHash: hashJson(plan.qboJournalEntryDraft),
      },
    });
    batches += 1;

    for (const consumption of plan.consumptions) {
      const metadata = metadataByLayerId.get(consumption.layerId);
      if (metadata === undefined) {
        throw new Error(`Missing exact layer metadata for ${consumption.layerId}`);
      }
      const amountCents = cents(consumption.totalAmount);
      const rowHash = hashJson(consumption);
      await db.costLayerConsumption.upsert({
        where: {
          cogsPostingBatchId_internalPo_sellerSku: {
            cogsPostingBatchId: batch.id,
            internalPo: consumption.internalPo,
            sellerSku: consumption.sellerSku,
          },
        },
        update: {
          poCostLayerId: metadata.anchorPoCostLayerId,
          canonicalProductId: metadata.canonicalProductId,
          marketplace: options.marketplace,
          settlementDocNumber: invoiceId,
          quantity: consumption.quantity,
          amountCents,
          currency,
          componentAmounts: consumption.componentAmounts,
          sourceHash: rowHash,
        },
        create: {
          cogsPostingBatchId: batch.id,
          poCostLayerId: metadata.anchorPoCostLayerId,
          canonicalProductId: metadata.canonicalProductId,
          marketplace: options.marketplace,
          settlementDocNumber: invoiceId,
          internalPo: consumption.internalPo,
          sellerSku: consumption.sellerSku,
          quantity: consumption.quantity,
          amountCents,
          currency,
          componentAmounts: consumption.componentAmounts,
          sourceHash: rowHash,
        },
      });
      consumptionRows += 1;

      await db.sellerboardCogsExport.upsert({
        where: {
          cogsPostingBatchId_sellerSku_internalPo: {
            cogsPostingBatchId: batch.id,
            sellerSku: consumption.sellerSku,
            internalPo: consumption.internalPo,
          },
        },
        update: {
          canonicalProductId: metadata.canonicalProductId,
          marketplace: options.marketplace,
          settlementDocNumber: invoiceId,
          quantity: consumption.quantity,
          amountCents,
          currency,
          status: 'ready',
        },
        create: {
          cogsPostingBatchId: batch.id,
          canonicalProductId: metadata.canonicalProductId,
          marketplace: options.marketplace,
          settlementDocNumber: invoiceId,
          sellerSku: consumption.sellerSku,
          internalPo: consumption.internalPo,
          quantity: consumption.quantity,
          amountCents,
          currency,
          status: 'ready',
        },
      });
      sellerboardRows += 1;
    }

    priorConsumptions.push(
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

  console.log(
    JSON.stringify(
      {
        ok: true,
        marketplace: options.marketplace,
        exactLayers: layers.length,
        postedSettlements: postedSettlementDocNumbers.length,
        settlements: rowsByInvoice.size,
        batches,
        consumptionRows,
        sellerboardRows,
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
