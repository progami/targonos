import { db } from '@/lib/db';
import {
  buildQboInventoryAssetReclassPlan,
  buildQboInventoryLandedCostPlan,
  type QboInventoryAssetLineInput,
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
  fetchQboReport,
  type QboBill,
  type QboConnection,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
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

function receiptDateForLayer(input: {
  layer: QboInventoryLandedCostLayer;
  parsedLines: ParsedQboInventoryAssetLine[];
}): string {
  const qboRefs = new Set(input.layer.qboBillLineRefs);
  const dates = input.parsedLines
    .filter((line) => qboRefs.has(`${line.billId}:${line.qboLineId}`))
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
  await saveServerQboConnection(qboBillsResult.updatedConnection);

  const rowsByInvoice = new Map<string, AuditRow[]>();
  for (const row of auditRows) {
    const existing = rowsByInvoice.get(row.invoiceId);
    if (existing === undefined) {
      rowsByInvoice.set(row.invoiceId, [row]);
    } else {
      existing.push(row);
    }
  }

  const qboInventoryAssetLines = collectInventoryAssetLines(qboBillsResult.bills);
  const qboAssetPlan = buildQboInventoryLandedCostPlan({
    marketplace: options.marketplace,
    lines: qboInventoryAssetLines,
  });
  const qboInventoryAssetReclassPlan = buildQboInventoryAssetReclassPlan({
    marketplace: options.marketplace,
    lines: qboInventoryAssetLines,
  });
  const marketAssetLines = qboAssetPlan.parsedLines.filter((line) => line.marketCode === qboAssetPlan.marketCode);
  const exactCostLayers = exactLayersFromQbo({
    marketplace: options.marketplace,
    layers: qboAssetPlan.layers,
    parsedLines: marketAssetLines,
  });

  const exactConsumptions: ExactCostLayerConsumptionInput[] = [];
  const plutusExactCogsPreview = Array.from(rowsByInvoice.entries())
    .sort((left, right) => {
      const dateCompare = settlementTxnDate(left[1]).localeCompare(settlementTxnDate(right[1]));
      if (dateCompare !== 0) return dateCompare;
      return left[0].localeCompare(right[0]);
    })
    .map(([invoiceId, rows]) => {
      const plan = buildExactCogsPlan({
        marketplace: options.marketplace,
        settlementDocNumber: invoiceId,
        txnDate: settlementTxnDate(rows),
        soldUnits: soldUnitsFromRows(rows),
        layers: exactCostLayers,
        priorConsumptions: exactConsumptions,
        componentAccountIds: {
          manufacturing: 'QBO_COGS_MANUFACTURING_ACCOUNT_REQUIRED',
          freight: 'QBO_COGS_FREIGHT_ACCOUNT_REQUIRED',
          duty: 'QBO_COGS_DUTY_ACCOUNT_REQUIRED',
          mfgAccessories: 'QBO_COGS_ACCESSORIES_ACCOUNT_REQUIRED',
        },
        inventoryAssetAccountId: 'QBO_INVENTORY_ASSET_PLUTUS_ACCOUNT_REQUIRED',
      });
      if (plan.ok) {
        exactConsumptions.push(
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
    consumptions: exactConsumptions,
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
    ok: Math.abs(qboInventoryValuation.totalAssetValue - plutusExactInventoryValuation.totalRemainingAmount) <= 0.01,
    qboInventoryValuationAssetValue: qboInventoryValuation.totalAssetValue,
    plutusExactRemainingAmount: plutusExactInventoryValuation.totalRemainingAmount,
    delta: Number((qboInventoryValuation.totalAssetValue - plutusExactInventoryValuation.totalRemainingAmount).toFixed(2)),
    tolerance: 0.01,
  };

  const ok =
    qboAssetPlan.blocks.length === 0 &&
    plutusExactCogsPreview.every((preview) => preview.ok) &&
    qboInventoryAssetReclassPlan.lines.length === 0 &&
    qboInventoryValuationTieout.ok;

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
        qboInventoryAssetLines: marketAssetLines.length,
        qboLandedCostLayers: qboAssetPlan.layers,
        qboInventoryAssetBlocks: qboAssetPlan.blocks,
        plutusExactInventoryValuation,
        plutusExactCogsPreview,
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
