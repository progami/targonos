import { db } from '@/lib/db';
import {
  createJournalEntry,
  fetchAccounts,
  fetchJournalEntries,
  type QboAccount,
  type QboConnection,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import type { QboInventoryAssetComponent } from '@/lib/plutus/qbo-inventory-asset-lines';
import { loadSharedPlutusEnv } from './shared-env';

type CliOptions = {
  marketplace: string;
  settlementDocNumbers: string[];
  post: boolean;
};

type ComponentAmounts = Record<QboInventoryAssetComponent, number>;

type CogsBatchRow = {
  id: string;
  marketplace: string;
  settlementDocNumber: string;
  txnDate: string;
  currency: string;
  status: string;
  qboJournalEntryId: string | null;
  qboDocNumber: string | null;
  consumptions: Array<{
    internalPo: string;
    sellerSku: string;
    quantity: number;
    amountCents: number;
    componentAmounts: unknown;
  }>;
};

const COMPONENTS: QboInventoryAssetComponent[] = ['manufacturing', 'freight', 'duty', 'mfgAccessories'];

const COMPONENT_LABELS: Record<QboInventoryAssetComponent, string> = {
  manufacturing: 'Manufacturing',
  freight: 'Freight',
  duty: 'Duty',
  mfgAccessories: 'Mfg Accessories',
};

const COMPONENT_ACCOUNT_NAMES: Record<QboInventoryAssetComponent, string> = {
  manufacturing: 'Manufacturing',
  freight: 'Freight & Custom Duty',
  duty: 'Freight & Custom Duty',
  mfgAccessories: 'Mfg Accessories',
};

function parseArgs(argv: string[]): CliOptions {
  let marketplace = 'amazon.com';
  let settlementDocNumbers: string[] = [];
  let post = false;

  for (let i = 0; i < argv.length; ) {
    const arg = argv[i]!;
    if (arg === '--marketplace') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('Missing value for --marketplace');
      marketplace = next;
      i += 2;
      continue;
    }
    if (arg === '--settlement-doc-number') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('Missing value for --settlement-doc-number');
      settlementDocNumbers = settlementDocNumbers.concat(
        next
          .split(',')
          .map((value) => value.trim())
          .filter((value) => value !== ''),
      );
      i += 2;
      continue;
    }
    if (arg === '--post') {
      post = true;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (settlementDocNumbers.length === 0) {
    throw new Error('Usage: pnpm inventory:exact:cogs:post --settlement-doc-number <doc[,doc...]> [--post]');
  }

  return {
    marketplace,
    settlementDocNumbers: Array.from(new Set(settlementDocNumbers)).sort(),
    post,
  };
}

function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function requireComponentAmounts(value: unknown): ComponentAmounts {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('COGS consumption is missing componentAmounts');
  }
  const raw = value as Record<string, unknown>;
  const result = {} as ComponentAmounts;
  for (const component of COMPONENTS) {
    const amount = raw[component];
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      throw new Error(`COGS consumption has invalid ${component} amount`);
    }
    result[component] = roundMoney(amount);
  }
  return result;
}

function requireOneActiveAccountByName(accounts: QboAccount[], name: string): string {
  const matches = accounts.filter((account) => account.Active !== false && account.Name.trim() === name);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one active QBO account named "${name}", found ${matches.length}`);
  }
  return matches[0]!.Id;
}

async function findExistingJournalEntryIdByDocNumber(input: {
  connection: QboConnection;
  docNumber: string;
}): Promise<{ id: string | null; updatedConnection?: QboConnection }> {
  const result = await fetchJournalEntries(input.connection, {
    docNumberContains: input.docNumber,
    maxResults: 10,
    startPosition: 1,
  });
  const exactMatches = result.journalEntries.filter((entry) => entry.DocNumber === input.docNumber);
  if (exactMatches.length > 1) {
    throw new Error(`Multiple QBO journal entries already exist for ${input.docNumber}`);
  }
  return {
    id: exactMatches[0]?.Id ?? null,
    updatedConnection: result.updatedConnection,
  };
}

function buildJournalEntry(input: {
  batch: CogsBatchRow;
  componentAccountIds: Record<QboInventoryAssetComponent, string>;
  inventoryAssetAccountId: string;
}): {
  docNumber: string;
  txnDate: string;
  privateNote: string;
  lines: Array<{ accountId: string; postingType: 'Debit' | 'Credit'; amount: number; description: string }>;
} {
  const docNumber = `C-${input.batch.settlementDocNumber}`;
  const lines: Array<{ accountId: string; postingType: 'Debit' | 'Credit'; amount: number; description: string }> = [];

  for (const consumption of input.batch.consumptions) {
    const componentAmounts = requireComponentAmounts(consumption.componentAmounts);
    for (const component of COMPONENTS) {
      const amount = componentAmounts[component];
      if (amount === 0) continue;
      const unitCost = roundMoney(amount / consumption.quantity).toFixed(6);
      lines.push({
        accountId: input.componentAccountIds[component],
        postingType: 'Debit',
        amount,
        description: `${COMPONENT_LABELS[component]} COGS; SKU=${consumption.sellerSku}; PO=${consumption.internalPo}; QTY=${consumption.quantity}; UNIT=${unitCost}`,
      });
    }
    const totalAmount = centsToDollars(consumption.amountCents);
    lines.push({
      accountId: input.inventoryAssetAccountId,
      postingType: 'Credit',
      amount: totalAmount,
      description: `Inventory Asset release; SKU=${consumption.sellerSku}; PO=${consumption.internalPo}; QTY=${consumption.quantity}; UNIT=${roundMoney(
        totalAmount / consumption.quantity,
      ).toFixed(6)}`,
    });
  }

  const debits = roundMoney(lines.filter((line) => line.postingType === 'Debit').reduce((sum, line) => sum + line.amount, 0));
  const credits = roundMoney(lines.filter((line) => line.postingType === 'Credit').reduce((sum, line) => sum + line.amount, 0));
  if (Math.abs(debits - credits) > 0.01) {
    throw new Error(`Exact COGS journal ${docNumber} is not balanced: debits=${debits}, credits=${credits}`);
  }

  return {
    docNumber,
    txnDate: input.batch.txnDate,
    privateNote: `Plutus exact COGS | Settlement: ${input.batch.settlementDocNumber} | Marketplace: ${input.batch.marketplace}`,
    lines,
  };
}

async function main(): Promise<void> {
  loadSharedPlutusEnv();
  const options = parseArgs(process.argv.slice(2));

  const batches = await db.cogsPostingBatch.findMany({
    where: {
      marketplace: options.marketplace,
      settlementDocNumber: { in: options.settlementDocNumbers },
    },
    include: {
      consumptions: {
        orderBy: [{ internalPo: 'asc' }, { sellerSku: 'asc' }],
      },
    },
    orderBy: [{ txnDate: 'asc' }, { settlementDocNumber: 'asc' }],
  });
  if (batches.length !== options.settlementDocNumbers.length) {
    const found = new Set(batches.map((batch) => batch.settlementDocNumber));
    const missing = options.settlementDocNumbers.filter((docNumber) => !found.has(docNumber));
    throw new Error(`Missing exact COGS batch for settlement(s): ${missing.join(', ')}`);
  }

  const maybeConnection = await getQboConnection();
  if (maybeConnection === null) throw new Error('QBO connection is not configured');
  let connection = maybeConnection;

  const accountsResult = await fetchAccounts(connection, { includeInactive: true });
  if (accountsResult.updatedConnection !== undefined) connection = accountsResult.updatedConnection;
  const accounts = accountsResult.accounts;
  const componentAccountIds: Record<QboInventoryAssetComponent, string> = {
    manufacturing: requireOneActiveAccountByName(accounts, COMPONENT_ACCOUNT_NAMES.manufacturing),
    freight: requireOneActiveAccountByName(accounts, COMPONENT_ACCOUNT_NAMES.freight),
    duty: requireOneActiveAccountByName(accounts, COMPONENT_ACCOUNT_NAMES.duty),
    mfgAccessories: requireOneActiveAccountByName(accounts, COMPONENT_ACCOUNT_NAMES.mfgAccessories),
  };
  const inventoryAssetAccountId = requireOneActiveAccountByName(accounts, 'Inventory Asset');

  const runSummary: Array<Record<string, unknown>> = [];

  for (const batch of batches) {
    if (batch.consumptions.length === 0) {
      runSummary.push({
        settlementDocNumber: batch.settlementDocNumber,
        action: 'skipped',
        reason: 'No COGS consumption lines',
      });
      continue;
    }

    const journalEntry = buildJournalEntry({
      batch,
      componentAccountIds,
      inventoryAssetAccountId,
    });
    const existing = await findExistingJournalEntryIdByDocNumber({ connection, docNumber: journalEntry.docNumber });
    if (existing.updatedConnection !== undefined) connection = existing.updatedConnection;

    if (existing.id !== null) {
      await db.cogsPostingBatch.update({
        where: { id: batch.id },
        data: {
          status: 'posted',
          qboJournalEntryId: existing.id,
          qboDocNumber: journalEntry.docNumber,
        },
      });
      await db.sellerboardCogsExport.updateMany({
        where: { cogsPostingBatchId: batch.id },
        data: { status: 'ready' },
      });
      runSummary.push({
        settlementDocNumber: batch.settlementDocNumber,
        action: 'existing',
        qboJournalEntryId: existing.id,
        docNumber: journalEntry.docNumber,
      });
      continue;
    }

    if (!options.post) {
      runSummary.push({
        settlementDocNumber: batch.settlementDocNumber,
        action: 'dry_run',
        docNumber: journalEntry.docNumber,
        lines: journalEntry.lines.length,
        totalAmount: roundMoney(
          journalEntry.lines.filter((line) => line.postingType === 'Credit').reduce((sum, line) => sum + line.amount, 0),
        ),
      });
      continue;
    }

    const posted = await createJournalEntry(connection, {
      txnDate: journalEntry.txnDate,
      docNumber: journalEntry.docNumber,
      privateNote: journalEntry.privateNote,
      currencyCode: batch.currency,
      lines: journalEntry.lines,
    });
    if (posted.updatedConnection !== undefined) connection = posted.updatedConnection;

    await db.cogsPostingBatch.update({
      where: { id: batch.id },
      data: {
        status: 'posted',
        qboJournalEntryId: posted.journalEntry.Id,
        qboDocNumber: journalEntry.docNumber,
      },
    });
    await db.sellerboardCogsExport.updateMany({
      where: { cogsPostingBatchId: batch.id },
      data: { status: 'ready' },
    });

    runSummary.push({
      settlementDocNumber: batch.settlementDocNumber,
      action: 'posted',
      qboJournalEntryId: posted.journalEntry.Id,
      docNumber: journalEntry.docNumber,
    });
  }

  await saveServerQboConnection(connection);
  console.log(JSON.stringify({ options, runSummary }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
