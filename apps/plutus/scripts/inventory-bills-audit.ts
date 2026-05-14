import { promises as fs } from 'node:fs';
import path from 'node:path';
import { extractPoNumberFromBill } from '@/lib/plutus/bills/pull-sync';

import { parseSkuFromDescription, parseSkuQuantityFromDescription } from '@/lib/inventory/qbo-bills';

type CliOptions = {
  since: string;
  marketplace: 'all' | 'amazon.com' | 'amazon.co.uk';
};

type BillIssue =
  | {
      code: 'INVENTORY_BILL_UNMAPPED_MISSING_PO_MEMO';
      billId: string;
      txnDate: string;
      vendorName: string;
      docNumber: string;
      privateNote: string;
    }
  | {
      code: 'INVENTORY_BILL_UNMAPPED_PO_MEMO_CASE_MISMATCH';
      billId: string;
      txnDate: string;
      vendorName: string;
      docNumber: string;
      privateNote: string;
    }
  | {
      code: 'INVENTORY_BILL_MFG_DESC_PARSE_ERROR';
      billId: string;
      txnDate: string;
      vendorName: string;
      docNumber: string;
      privateNote: string;
      lineId: string;
      amount: number;
      description: string;
      error: string;
    }
  | {
      code: 'INVENTORY_BILL_COST_LINE_MISSING_MFG_UNITS';
      billId: string;
      txnDate: string;
      vendorName: string;
      docNumber: string;
      privateNote: string;
      poNumber: string;
      component: 'freight' | 'duty' | 'mfgAccessories';
      lineId: string;
      amount: number;
      description: string;
    }
  | {
      code: 'INVENTORY_BILL_MAPPING_SKU_WITHOUT_SOURCE';
      billId: string;
      txnDate: string;
      vendorName: string;
      docNumber: string;
      privateNote: string;
      lineId: string;
      amount: number;
      mappedSku: string;
      description: string;
    };

function printUsage(): void {
  console.log('Usage: pnpm -s exec tsx scripts/inventory-bills-audit.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --since <YYYY-MM-DD>   (default: 2024-01-01)');
  console.log('  --marketplace <all|amazon.com|amazon.co.uk>   (default: all)');
  console.log('');
}

function parseDotenvLine(rawLine: string): { key: string; value: string } | null {
  let line = rawLine.trim();
  if (line === '') return null;
  if (line.startsWith('#')) return null;

  if (line.startsWith('export ')) {
    line = line.slice('export '.length).trim();
  }

  const equalsIndex = line.indexOf('=');
  if (equalsIndex === -1) return null;

  const key = line.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  let value = line.slice(equalsIndex + 1).trim();
  if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1);
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

async function loadEnvFile(filePath: string): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') return;
    throw error;
  }

  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line);
    if (!parsed) continue;
    process.env[parsed.key] = parsed.value;
  }
}

async function loadPlutusEnv(): Promise<void> {
  const cwd = process.cwd();
  await loadEnvFile(path.join(cwd, '.env.local'));
  await loadEnvFile(path.join(cwd, '.env'));
}

function requireIsoDay(value: string, label: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`${label} must be YYYY-MM-DD (got "${value}")`);
  }
  return trimmed;
}

function parseArgs(argv: string[]): CliOptions {
  let since = '2024-01-01';
  let marketplace: CliOptions['marketplace'] = 'all';

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--since') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --since');
      since = requireIsoDay(next, '--since');
      i += 2;
      continue;
    }

    if (arg === '--marketplace') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --marketplace');
      if (next !== 'all' && next !== 'amazon.com' && next !== 'amazon.co.uk') {
        throw new Error(`Invalid --marketplace value: ${next}`);
      }
      marketplace = next;
      i += 2;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { since, marketplace };
}

type InventoryLine = {
  component: 'manufacturing' | 'freight' | 'duty' | 'mfgAccessories';
  marketplace: 'amazon.com' | 'amazon.co.uk' | null;
  lineId: string;
  amount: number;
  description: string;
};

type QboAccount = {
  Id: string;
  Name: string;
  FullyQualifiedName?: string;
  AccountType?: string;
  AccountSubType?: string;
};

function classifyInventoryComponentFromAccount(account: QboAccount): InventoryLine['component'] | null {
  if (account.AccountType !== 'Other Current Asset') return null;
  if (account.AccountSubType !== 'Inventory') return null;

  let name = account.Name.trim();
  if (name.startsWith('Inv ')) {
    name = name.slice('Inv '.length).trimStart();
  }

  if (name.startsWith('Manufacturing')) return 'manufacturing';
  if (name.startsWith('Freight')) return 'freight';
  if (name.startsWith('Duty')) return 'duty';
  if (name.startsWith('Mfg Accessories')) return 'mfgAccessories';
  return null;
}

function classifyInventoryMarketplaceFromAccount(account: QboAccount): InventoryLine['marketplace'] {
  const name = `${account.FullyQualifiedName ?? ''} ${account.Name}`.trim();
  if (name.includes('US-PDS')) return 'amazon.com';
  if (name.includes('UK-PDS')) return 'amazon.co.uk';
  return null;
}

function hasStructuredPlaceholderSku(description: string): boolean {
  return description
    .replace(/×/g, 'x')
    .split(';')
    .some((part) => {
      const trimmed = part.trim();
      return /^(?:SKU|FOR_SKU|FORSKU)\s*[:=]\s*N\/A$/i.test(trimmed);
    });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await loadPlutusEnv();

  const { db } = await import('@/lib/db');
  const { fetchAccounts, fetchBills } = await import('@/lib/qbo/api');
  const { getQboConnection, saveServerQboConnection } = await import('@/lib/qbo/connection-store');

  let connection = await getQboConnection();
  if (!connection) {
    throw new Error('Missing QBO connection. Connect to QBO in Plutus first.');
  }

  const accountsResult = await fetchAccounts(connection, { includeInactive: true });
  if (accountsResult.updatedConnection) {
    connection = accountsResult.updatedConnection;
    await saveServerQboConnection(accountsResult.updatedConnection);
  }

  const accountsById = new Map<string, QboAccount>();
  for (const account of accountsResult.accounts) {
    accountsById.set(account.Id, account);
  }

  const mappedBills = await db.billMapping.findMany({ include: { lines: true } });
  const mappingByBillId = new Map(mappedBills.map((m) => [m.qboBillId, m]));

  const startDate = options.since;
  const endDate = new Date().toISOString().slice(0, 10);

  const bills: Array<any> = [];
  let startPosition = 1;
  const pageSize = 100;

  while (true) {
    const page = await fetchBills(connection, { startDate, endDate, startPosition, maxResults: pageSize });
    if (page.updatedConnection) {
      connection = page.updatedConnection;
      await saveServerQboConnection(page.updatedConnection);
    }

    bills.push(...page.bills);
    if (bills.length >= page.totalCount) break;
    if (page.bills.length === 0) break;
    startPosition += page.bills.length;
  }

  const issues: BillIssue[] = [];
  const poUnitsBySku = new Map<string, Map<string, number>>();

  function addPoUnits(poNumber: string, sku: string, units: number) {
    const existing = poUnitsBySku.get(poNumber);
    if (!existing) {
      const next = new Map<string, number>();
      next.set(sku, units);
      poUnitsBySku.set(poNumber, next);
      return;
    }
    const current = existing.get(sku);
    existing.set(sku, (current === undefined ? 0 : current) + units);
  }

  const inventoryBills: Array<{
    billId: string;
    txnDate: string;
    vendorName: string;
    docNumber: string;
    privateNote: string;
    mapped: boolean;
    poNumber: string | null;
    lines: InventoryLine[];
  }> = [];

  for (const bill of bills) {
    const billId = String(bill.Id);
    const txnDate = typeof bill.TxnDate === 'string' ? bill.TxnDate : '';
    const vendorName = bill.VendorRef?.name ? String(bill.VendorRef.name) : '';
    const docNumber = bill.DocNumber ? String(bill.DocNumber) : '';
    const privateNote = bill.PrivateNote ? String(bill.PrivateNote) : '';

    const lineItems: InventoryLine[] = [];
    const rawLines = Array.isArray(bill.Line) ? bill.Line : [];
    for (const line of rawLines) {
      const detail = line.AccountBasedExpenseLineDetail;
      const accountId = detail?.AccountRef?.value;
      if (typeof accountId !== 'string') continue;
      const account = accountsById.get(accountId);
      if (!account) continue;
      const component = classifyInventoryComponentFromAccount(account);
      if (component === null) continue;
      const lineMarketplace = classifyInventoryMarketplaceFromAccount(account);
      if (options.marketplace !== 'all' && lineMarketplace !== options.marketplace) continue;

      const amount = typeof line.Amount === 'number' ? line.Amount : 0;
      const description = typeof line.Description === 'string' ? line.Description : '';

      lineItems.push({
        component,
        marketplace: lineMarketplace,
        lineId: String(line.Id),
        amount,
        description,
      });
    }

    if (lineItems.length === 0) continue;

    const mapping = mappingByBillId.get(billId);
    const mapped = mapping !== undefined;
    const lineItemById = new Map(lineItems.map((line) => [line.lineId, line]));

    let poNumber: string | null = null;
    if (mapped) {
      poNumber = mapping.poNumber;
      for (const mLine of mapping.lines) {
        const sourceLine = lineItemById.get(mLine.qboLineId);
        if (mLine.sku && sourceLine && hasStructuredPlaceholderSku(sourceLine.description)) {
          let parsedSku: string | null = null;
          try {
            parsedSku = parseSkuFromDescription(sourceLine.description);
          } catch {
            parsedSku = null;
          }

          if (parsedSku === null) {
            issues.push({
              code: 'INVENTORY_BILL_MAPPING_SKU_WITHOUT_SOURCE',
              billId,
              txnDate,
              vendorName,
              docNumber,
              privateNote,
              lineId: sourceLine.lineId,
              amount: sourceLine.amount,
              mappedSku: mLine.sku,
              description: sourceLine.description,
            });
          }
        }

        if (mLine.component === 'manufacturing') {
          if (!mLine.sku || !mLine.quantity || mLine.quantity <= 0) {
            continue;
          }
          addPoUnits(poNumber, mLine.sku, mLine.quantity);
        }
      }
    } else {
      const extractedPoNumber = extractPoNumberFromBill(bill);
      if (extractedPoNumber === '') {
        issues.push({ code: 'INVENTORY_BILL_UNMAPPED_MISSING_PO_MEMO', billId, txnDate, vendorName, docNumber, privateNote });
      } else {
        poNumber = extractedPoNumber;
        for (const line of lineItems) {
          if (line.component !== 'manufacturing') continue;
          try {
            const parsed = parseSkuQuantityFromDescription(line.description);
            addPoUnits(poNumber, parsed.sku, parsed.quantity);
          } catch (error) {
            issues.push({
              code: 'INVENTORY_BILL_MFG_DESC_PARSE_ERROR',
              billId,
              txnDate,
              vendorName,
              docNumber,
              privateNote,
              lineId: line.lineId,
              amount: line.amount,
              description: line.description,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }

    inventoryBills.push({
      billId,
      txnDate,
      vendorName,
      docNumber,
      privateNote,
      mapped,
      poNumber,
      lines: lineItems,
    });
  }

  for (const bill of inventoryBills) {
    const poNumber = bill.poNumber;
    if (!poNumber) continue;

    const canAllocatePo = poUnitsBySku.has(poNumber);
    for (const line of bill.lines) {
      if (line.component === 'manufacturing') continue;

      let parsedSku: string | null = null;
      try {
        parsedSku = parseSkuFromDescription(line.description);
      } catch {
        parsedSku = null;
      }

      if (parsedSku !== null) continue;
      if (canAllocatePo) continue;

      issues.push({
        code: 'INVENTORY_BILL_COST_LINE_MISSING_MFG_UNITS',
        billId: bill.billId,
        txnDate: bill.txnDate,
        vendorName: bill.vendorName,
        docNumber: bill.docNumber,
        privateNote: bill.privateNote,
        poNumber,
        component: line.component,
        lineId: line.lineId,
        amount: line.amount,
        description: line.description,
      });
    }
  }

  const unmappedInventoryBills = inventoryBills.filter((b) => !b.mapped);
  const mappedInventoryBills = inventoryBills.filter((b) => b.mapped);

  console.log(
    JSON.stringify(
      {
        ok: issues.length === 0,
        since: options.since,
        marketplace: options.marketplace,
        totals: {
          billsFetched: bills.length,
          inventoryBills: inventoryBills.length,
          mappedInventoryBills: mappedInventoryBills.length,
          unmappedInventoryBills: unmappedInventoryBills.length,
          billMappings: mappedBills.length,
          posWithUnits: poUnitsBySku.size,
          issues: issues.length,
        },
        issues,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
