import {
  buildQboInventoryAssetReclassPlan,
  type QboInventoryAssetLineInput,
  type QboInventoryAssetReclassPlan,
} from '@/lib/plutus/qbo-inventory-asset-lines';
import {
  assessQboInventoryValuationTieout,
  parseQboInventoryValuationSummary,
  type QboInventoryValuationTieout,
} from '@/lib/plutus/qbo-inventory-valuation';
import {
  createAccount,
  fetchAccounts,
  fetchAccountsByFullyQualifiedName,
  fetchBills,
  fetchQboReport,
  updateAccountActive,
  updateBillLineAccounts,
  type QboAccount,
  type QboBill,
  type QboConnection,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { loadSharedPlutusEnv } from './shared-env';

type CliOptions = {
  apply: boolean;
  marketplace: string;
  assetStartDate: string;
  assetEndDate: string;
};

const INVENTORY_ASSET_ACCOUNT_NAME = 'Inventory Asset';
const INVENTORY_CLEARING_ACCOUNT_NAME = 'Inventory Clearing';
const INVENTORY_COGS_RELEASE_ACCOUNT_NAME = 'Inventory COGS Release';
const LEGACY_INVENTORY_SHRINKAGE_ACCOUNT_NAME = 'Inventory Shrinkage';

function parseArgs(argv: string[]): CliOptions {
  let apply = false;
  let marketplace = 'amazon.com';
  let assetStartDate = '2025-01-01';
  let assetEndDate = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < argv.length; ) {
    const arg = argv[i]!;
    if (arg === '--apply') {
      apply = true;
      i += 1;
      continue;
    }
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

  return { apply, marketplace, assetStartDate, assetEndDate };
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
      if (accountName !== INVENTORY_ASSET_ACCOUNT_NAME && !accountName.startsWith(`${INVENTORY_ASSET_ACCOUNT_NAME}:`)) continue;
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

function activeExactAccount(accounts: QboAccount[], name: string): QboAccount | null {
  const match = accounts.find((account) => account.Active !== false && account.FullyQualifiedName === name);
  return match ?? null;
}

async function ensureInventoryClearingAccount(input: {
  connection: QboConnection;
  accounts: QboAccount[];
  apply: boolean;
}): Promise<{ connection: QboConnection; account: QboAccount | null; action: string }> {
  const existing = activeExactAccount(input.accounts, INVENTORY_CLEARING_ACCOUNT_NAME);
  if (existing !== null) {
    return { connection: input.connection, account: existing, action: 'exists' };
  }

  if (!input.apply) {
    return { connection: input.connection, account: null, action: 'would_create' };
  }

  const created = await createAccount(input.connection, {
    name: INVENTORY_CLEARING_ACCOUNT_NAME,
    accountType: 'Other Current Asset',
    accountSubType: 'OtherCurrentAssets',
  });
  return {
    connection: created.updatedConnection ?? input.connection,
    account: created.account,
    action: 'created',
  };
}

async function ensureInventoryCogsReleaseAccount(input: {
  connection: QboConnection;
  accounts: QboAccount[];
  apply: boolean;
}): Promise<{ connection: QboConnection; account: QboAccount | null; action: string }> {
  const existing = activeExactAccount(input.accounts, INVENTORY_COGS_RELEASE_ACCOUNT_NAME);
  if (existing !== null) {
    return { connection: input.connection, account: existing, action: 'exists' };
  }

  const legacy = activeExactAccount(input.accounts, LEGACY_INVENTORY_SHRINKAGE_ACCOUNT_NAME);
  if (legacy === null) {
    throw new Error(`QBO account not found: ${INVENTORY_COGS_RELEASE_ACCOUNT_NAME}`);
  }

  if (!input.apply) {
    return { connection: input.connection, account: legacy, action: 'would_rename_legacy_inventory_shrinkage' };
  }

  const renamed = await updateAccountActive(
    input.connection,
    legacy.Id,
    legacy.SyncToken,
    INVENTORY_COGS_RELEASE_ACCOUNT_NAME,
    true,
  );
  return {
    connection: renamed.updatedConnection ?? input.connection,
    account: renamed.account,
    action: 'renamed_legacy_inventory_shrinkage',
  };
}

async function fetchInventoryValuationTieout(input: {
  connection: QboConnection;
  assetEndDate: string;
}): Promise<{ connection: QboConnection; tieout: QboInventoryValuationTieout }> {
  let activeConnection = input.connection;
  const valuationReportResult = await fetchQboReport(activeConnection, 'InventoryValuationSummary', {
    report_date: input.assetEndDate,
  });
  if (valuationReportResult.updatedConnection !== undefined) {
    activeConnection = valuationReportResult.updatedConnection;
  }
  const valuation = parseQboInventoryValuationSummary(
    valuationReportResult.report as Parameters<typeof parseQboInventoryValuationSummary>[0],
  );

  const inventoryAssetAccountResult = await fetchAccountsByFullyQualifiedName(activeConnection, INVENTORY_ASSET_ACCOUNT_NAME);
  if (inventoryAssetAccountResult.updatedConnection !== undefined) {
    activeConnection = inventoryAssetAccountResult.updatedConnection;
  }
  const account = inventoryAssetAccountResult.accounts.find((candidate) => candidate.Active !== false);
  if (account === undefined) throw new Error(`Active QBO account not found: ${INVENTORY_ASSET_ACCOUNT_NAME}`);
  const balance = account.CurrentBalanceWithSubAccounts ?? account.CurrentBalance;
  if (balance === undefined) throw new Error(`${INVENTORY_ASSET_ACCOUNT_NAME} is missing current balance`);

  return {
    connection: activeConnection,
    tieout: assessQboInventoryValuationTieout({
      inventoryAssetBalance: balance,
      inventoryValuationAssetValue: valuation.totalAssetValue,
    }),
  };
}

function summarizeReclassPlan(plan: QboInventoryAssetReclassPlan) {
  return {
    marketplace: plan.marketplace,
    marketCode: plan.marketCode,
    totalAmount: plan.totalAmount,
    lineCount: plan.lines.length,
    lines: plan.lines.map((line) => ({
      billId: line.billId,
      billDocNumber: line.billDocNumber ?? null,
      qboLineId: line.qboLineId,
      billDate: line.billDate,
      vendorName: line.vendorName ?? null,
      amount: line.amount,
      reason: line.reason,
      fromAccount: line.accountName,
      toAccount: INVENTORY_CLEARING_ACCOUNT_NAME,
      description: line.description ?? null,
    })),
  };
}

async function main(): Promise<void> {
  loadSharedPlutusEnv();
  const options = parseArgs(process.argv.slice(2));
  const qboConnection = await getQboConnection();
  if (qboConnection === null) throw new Error('QBO connection is not configured');

  let activeConnection = qboConnection;
  const accountsResult = await fetchAccounts(activeConnection, { includeInactive: true });
  if (accountsResult.updatedConnection !== undefined) {
    activeConnection = accountsResult.updatedConnection;
  }

  const beforeTieout = await fetchInventoryValuationTieout({
    connection: activeConnection,
    assetEndDate: options.assetEndDate,
  });
  activeConnection = beforeTieout.connection;

  const qboBillsResult = await fetchAllBillsInWindow({
    connection: activeConnection,
    startDate: options.assetStartDate,
    endDate: options.assetEndDate,
  });
  activeConnection = qboBillsResult.updatedConnection;

  const reclassPlan = buildQboInventoryAssetReclassPlan({
    marketplace: options.marketplace,
    lines: collectInventoryAssetLines(qboBillsResult.bills),
  });

  const clearingAccountResult = await ensureInventoryClearingAccount({
    connection: activeConnection,
    accounts: accountsResult.accounts,
    apply: options.apply,
  });
  activeConnection = clearingAccountResult.connection;

  const cogsReleaseAccountResult = await ensureInventoryCogsReleaseAccount({
    connection: activeConnection,
    accounts: accountsResult.accounts,
    apply: options.apply,
  });
  activeConnection = cogsReleaseAccountResult.connection;

  const updatedBills: Array<{ billId: string; docNumber: string | null; movedLineIds: string[] }> = [];
  if (options.apply && reclassPlan.lines.length > 0) {
    if (clearingAccountResult.account === null) {
      throw new Error(`${INVENTORY_CLEARING_ACCOUNT_NAME} account was not created`);
    }

    const billsById = new Map(qboBillsResult.bills.map((bill) => [bill.Id, bill]));
    const linesByBillId = new Map<string, typeof reclassPlan.lines>();
    for (const line of reclassPlan.lines) {
      const existing = linesByBillId.get(line.billId);
      if (existing === undefined) {
        linesByBillId.set(line.billId, [line]);
      } else {
        existing.push(line);
      }
    }

    for (const [billId, lines] of Array.from(linesByBillId.entries()).sort(([left], [right]) => left.localeCompare(right))) {
      const bill = billsById.get(billId);
      if (bill === undefined) throw new Error(`Fetched bill not found for reclass plan: ${billId}`);
      const updated = await updateBillLineAccounts(
        activeConnection,
        bill.Id,
        bill.SyncToken,
        lines.map((line) => ({
          lineId: line.qboLineId,
          accountId: clearingAccountResult.account!.Id,
          accountName: INVENTORY_CLEARING_ACCOUNT_NAME,
        })),
      );
      activeConnection = updated.updatedConnection ?? activeConnection;
      updatedBills.push({
        billId,
        docNumber: updated.bill.DocNumber ?? null,
        movedLineIds: lines.map((line) => line.qboLineId),
      });
    }
  }

  const afterTieout = options.apply
    ? await fetchInventoryValuationTieout({
        connection: activeConnection,
        assetEndDate: options.assetEndDate,
      })
    : null;
  if (afterTieout !== null) {
    activeConnection = afterTieout.connection;
  }
  await saveServerQboConnection(activeConnection);

  console.log(
    JSON.stringify(
      {
        mode: options.apply ? 'apply' : 'dry-run',
        beforeTieout: beforeTieout.tieout,
        clearingAccount: {
          name: INVENTORY_CLEARING_ACCOUNT_NAME,
          action: clearingAccountResult.action,
          id: clearingAccountResult.account?.Id ?? null,
        },
        cogsReleaseAccount: {
          name: INVENTORY_COGS_RELEASE_ACCOUNT_NAME,
          action: cogsReleaseAccountResult.action,
          id: cogsReleaseAccountResult.account?.Id ?? null,
        },
        reclassPlan: summarizeReclassPlan(reclassPlan),
        updatedBills,
        afterTieout: afterTieout?.tieout ?? null,
      },
      null,
      2,
    ),
  );

  if (options.apply && afterTieout !== null && !afterTieout.tieout.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
