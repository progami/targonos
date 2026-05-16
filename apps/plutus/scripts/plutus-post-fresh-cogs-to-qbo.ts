import { createJournalEntry, fetchAccounts, type QboAccount } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { buildFreshCogsDocNumber } from '@/lib/plutus/fresh-start-fifo-cogs';
import { db } from '@/lib/db';

type CliOptions = {
  settlementId: string;
  marketplace: string;
  apply: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  let settlementId = '';
  let marketplace = 'amazon.com';
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];
    if (arg === '--settlement-id') {
      if (!next) throw new Error('Missing value for --settlement-id');
      settlementId = next;
      index += 1;
    } else if (arg === '--marketplace') {
      if (!next) throw new Error('Missing value for --marketplace');
      marketplace = next;
      index += 1;
    } else if (arg === '--apply') {
      apply = true;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  if (settlementId === '') throw new Error('Usage: pnpm inventory:fresh:cogs:post -- --settlement-id ID [--apply]');
  return { settlementId, marketplace, apply };
}

function requireOneActiveAccountByName(accounts: QboAccount[], accountName: string): QboAccount {
  const matches = accounts.filter((account) => account.Active !== false && account.Name === accountName);
  if (matches.length !== 1) throw new Error(`Expected exactly one active QBO account named ${accountName}, found ${matches.length}`);
  return matches[0]!;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const posting = await db.settlementPosting.findUnique({
    where: {
      marketplace_settlementId_postingType: {
        marketplace: options.marketplace,
        settlementId: options.settlementId,
        postingType: 'COGS',
      },
    },
    include: { cogsConsumptions: true },
  });
  if (!posting) throw new Error(`No COGS posting found for ${options.marketplace} ${options.settlementId}`);
  if (posting.cogsConsumptions.length === 0) throw new Error(`COGS posting ${posting.id} has no consumption lines`);
  if (posting.qboJournalId !== null) throw new Error(`COGS posting ${posting.id} is already linked to QBO JE ${posting.qboJournalId}`);

  const totalCents = posting.cogsConsumptions.reduce((sum, line) => sum + line.cogsAmountCents, 0);
  const description = posting.cogsConsumptions
    .map((line) => `SKU=${line.sku} | PO=${line.poNumber} | Qty=${line.qtyConsumed} | UnitCost=${Number(line.unitCost).toFixed(6)}`)
    .join('\n');
  const connection = await getQboConnection();
  if (connection === null) throw new Error('QBO connection is not configured');
  const accountResult = await fetchAccounts(connection);
  const activeConnection = accountResult.updatedConnection ?? connection;
  if (accountResult.updatedConnection) await saveServerQboConnection(accountResult.updatedConnection);
  const accounts = accountResult.accounts;
  const cogsAccount = requireOneActiveAccountByName(accounts, 'COGS - Product FIFO');
  const inventoryAccount = requireOneActiveAccountByName(accounts, 'Inventory Asset - Plutus');
  const amount = Math.round(totalCents) / 100;

  const payload = {
    txnDate: posting.txnDate,
    docNumber: posting.qboDocNumber ?? buildFreshCogsDocNumber(posting.settlementId),
    privateNote: `Plutus FIFO COGS | Settlement ${posting.settlementId}`,
    currencyCode: posting.currency,
    lines: [
      { amount, postingType: 'Debit' as const, accountId: cogsAccount.Id, description },
      { amount, postingType: 'Credit' as const, accountId: inventoryAccount.Id, description },
    ],
  };

  if (!options.apply) {
    process.stdout.write(JSON.stringify({ dryRun: true, payload }, null, 2));
    process.stdout.write('\n');
    return;
  }

  const created = await createJournalEntry(activeConnection, payload);
  if (created.updatedConnection) await saveServerQboConnection(created.updatedConnection);
  await db.$transaction([
    db.settlementPosting.update({
      where: { id: posting.id },
      data: { qboJournalId: created.journalEntry.Id, qboDocNumber: created.journalEntry.DocNumber ?? payload.docNumber },
    }),
    db.cogsConsumption.updateMany({
      where: { settlementPostingId: posting.id },
      data: { qboJournalId: created.journalEntry.Id },
    }),
  ]);
  process.stdout.write(JSON.stringify({ posted: true, qboJournalId: created.journalEntry.Id }, null, 2));
  process.stdout.write('\n');
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
