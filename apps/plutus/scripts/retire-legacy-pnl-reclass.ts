import { db } from '@/lib/db';
import { deleteJournalEntry } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { buildNoopJournalEntryId, isNoopJournalEntryId } from '@/lib/plutus/journal-entry-id';
import { loadSharedPlutusEnv } from './shared-env';

async function main() {
  loadSharedPlutusEnv();

  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const marketplaceArg = args.find((arg) => arg.startsWith('--marketplace='));
  const marketplace = marketplaceArg ? marketplaceArg.slice('--marketplace='.length) : undefined;

  const connectionMaybe = await getQboConnection();
  if (connectionMaybe === null) {
    throw new Error('Not connected to QBO (missing server connection file)');
  }
  let activeConnection = connectionMaybe;

  const rows = await db.settlementProcessing.findMany({
    where: {
      ...(marketplace ? { marketplace } : {}),
    },
    orderBy: [{ settlementPostedDate: 'asc' }, { invoiceId: 'asc' }],
  });

  const candidates = rows.filter((row) => !isNoopJournalEntryId(row.qboPnlReclassJournalEntryId));

  console.log(
    JSON.stringify(
      {
        apply,
        marketplace: marketplace ?? 'ALL',
        scanned: rows.length,
        candidates: candidates.map((row) => ({
          id: row.id,
          marketplace: row.marketplace,
          invoiceId: row.invoiceId,
          qboPnlReclassJournalEntryId: row.qboPnlReclassJournalEntryId,
          targetNoopId: buildNoopJournalEntryId('PNL', row.invoiceId),
        })),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    return;
  }

  for (const row of candidates) {
    const deleted = await deleteJournalEntry(activeConnection, row.qboPnlReclassJournalEntryId);
    if (deleted.updatedConnection) {
      activeConnection = deleted.updatedConnection;
      await saveServerQboConnection(activeConnection);
    }

    await db.settlementProcessing.update({
      where: { id: row.id },
      data: {
        qboPnlReclassJournalEntryId: buildNoopJournalEntryId('PNL', row.invoiceId),
      },
    });

    console.log(
      JSON.stringify({
        retired: true,
        invoiceId: row.invoiceId,
        deletedQboJournalEntryId: row.qboPnlReclassJournalEntryId,
        qboPnlReclassJournalEntryId: buildNoopJournalEntryId('PNL', row.invoiceId),
      }),
    );
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
