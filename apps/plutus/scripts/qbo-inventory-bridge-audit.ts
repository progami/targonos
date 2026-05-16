import { db } from '@/lib/db';
import {
  buildQboInventoryAssetReclassPlan,
  buildQboInventoryLandedCostPlan,
  type QboInventoryAssetLineInput,
} from '@/lib/plutus/qbo-inventory-asset-lines';
import {
  assessQboInventoryValuationTieout,
  parseQboInventoryValuationSummary,
} from '@/lib/plutus/qbo-inventory-valuation';
import { buildSettlementInventoryMovementPlan, type QboInventoryItemMapping } from '@/lib/plutus/qbo-inventory-movements';
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

type MappingRow = {
  marketplace: string;
  sellerSku: string;
  qboItemId: string;
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

async function fetchMappings(marketplace: string): Promise<QboInventoryItemMapping[]> {
  const rows = await db.$queryRawUnsafe<MappingRow[]>(
    'SELECT "marketplace", "sellerSku", "qboItemId" FROM "QboInventoryItemMapping" WHERE "marketplace" = $1 AND "active" = true ORDER BY "sellerSku"',
    marketplace,
  );
  return rows.map((row) => ({
    marketplace: row.marketplace,
    sellerSku: row.sellerSku,
    qboItemId: row.qboItemId,
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

  const [mappings, auditRows, qboBillsResult] = await Promise.all([
    fetchMappings(options.marketplace),
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

  const plans = Array.from(rowsByInvoice.entries()).map(([invoiceId, rows]) =>
    buildSettlementInventoryMovementPlan({
      marketplace: options.marketplace,
      settlementDocNumber: invoiceId,
      txnDate: settlementTxnDate(rows),
      adjustmentAccountId: 'QBO_COGS_ADJUSTMENT_ACCOUNT_REQUIRED',
      auditRows: rows,
      itemMappings: mappings,
    }),
  );

  const missingMappings = new Set<string>();
  for (const plan of plans) {
    for (const block of plan.blocks) {
      if (block.code === 'MISSING_QBO_ITEM_MAPPING') missingMappings.add(block.sellerSku);
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

  const ok =
    plans.every((plan) => plan.ok) &&
    missingMappings.size === 0 &&
    qboAssetPlan.blocks.length === 0 &&
    qboInventoryAssetReclassPlan.lines.length === 0 &&
    qboInventoryValuationTieout.ok;

  console.log(
    JSON.stringify(
      {
        ok,
        marketplace: options.marketplace,
        market,
        invoicesScanned: rowsByInvoice.size,
        qboItemMappings: mappings.length,
        movementPlans: plans.length,
        blockedPlans: plans.filter((plan) => !plan.ok).length,
        adjustmentLines: plans.reduce((sum, plan) => sum + plan.adjustmentLines.length, 0),
        missingMappings: Array.from(missingMappings).sort(),
        qboInventoryAssetWindow: {
          startDate: options.assetStartDate,
          endDate: options.assetEndDate,
        },
        qboInventoryAssetLines: marketAssetLines.length,
        qboLandedCostLayers: qboAssetPlan.layers,
        qboInventoryAssetBlocks: qboAssetPlan.blocks,
        qboInventoryAssetReclassPlan,
        qboInventoryValuation,
        qboInventoryValuationTieout,
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
