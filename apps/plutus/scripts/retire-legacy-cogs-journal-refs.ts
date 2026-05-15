import { db } from '@/lib/db';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { fetchJournalEntryById } from '@/lib/qbo/api';
import { HUMAN_APPROVAL_PHRASE } from '@/lib/plutus/human-approval';
import { buildNoopJournalEntryId, isNoopJournalEntryId } from '@/lib/plutus/journal-entry-id';
import { loadSharedPlutusEnv } from './shared-env';

type CliOptions = {
  apply: boolean;
  marketplace: string | undefined;
  humanApproval: string | null;
};

function parseArgs(argv: string[]): CliOptions {
  let apply = false;
  let marketplace: string | undefined;
  let humanApproval: string | null = null;

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

    if (arg === '--human-approval') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('Missing value for --human-approval');
      humanApproval = next;
      i += 2;
      continue;
    }

    if (arg.startsWith('--human-approval=')) {
      humanApproval = arg.slice('--human-approval='.length);
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (apply && humanApproval !== HUMAN_APPROVAL_PHRASE) {
    throw new Error(`Live Plutus settlement-state mutation requires --human-approval "${HUMAN_APPROVAL_PHRASE}"`);
  }

  return { apply, marketplace, humanApproval };
}

function isPlutusCogsJournalEntry(journalEntry: { DocNumber?: string; PrivateNote?: string }): boolean {
  const docNumber = journalEntry.DocNumber ?? '';
  const privateNote = journalEntry.PrivateNote ?? '';
  return docNumber.startsWith('C') && privateNote.startsWith('Plutus COGS |');
}

async function main(): Promise<void> {
  loadSharedPlutusEnv();

  const options = parseArgs(process.argv.slice(2));
  const connection = await getQboConnection();
  if (connection === null) {
    throw new Error('Not connected to QBO (missing server connection file)');
  }
  let activeConnection = connection;

  const rows = await db.settlementProcessing.findMany({
    where: {
      ...(options.marketplace === undefined ? {} : { marketplace: options.marketplace }),
    },
    orderBy: [{ settlementPostedDate: 'asc' }, { invoiceId: 'asc' }],
  });

  const candidates = rows.filter((row) => !isNoopJournalEntryId(row.qboCogsJournalEntryId));
  const verifiedCandidates = [];

  for (const row of candidates) {
    const fetched = await fetchJournalEntryById(activeConnection, row.qboCogsJournalEntryId);
    if (fetched.updatedConnection) {
      activeConnection = fetched.updatedConnection;
      await saveServerQboConnection(activeConnection);
    }

    if (!isPlutusCogsJournalEntry(fetched.journalEntry)) {
      throw new Error(
        `Refusing to retire non-Plutus COGS reference ${row.qboCogsJournalEntryId} for invoice ${row.invoiceId}`,
      );
    }

    verifiedCandidates.push({
      id: row.id,
      marketplace: row.marketplace,
      invoiceId: row.invoiceId,
      settlementDocNumber: row.settlementDocNumber,
      settlementPostedDate: row.settlementPostedDate.toISOString().slice(0, 10),
      qboCogsJournalEntryId: row.qboCogsJournalEntryId,
      qboCogsDocNumber: fetched.journalEntry.DocNumber ?? null,
      targetNoopId: buildNoopJournalEntryId('COGS', row.invoiceId),
    });
  }

  console.log(
    JSON.stringify(
      {
        apply: options.apply,
        marketplace: options.marketplace ?? 'ALL',
        scanned: rows.length,
        candidates: verifiedCandidates,
      },
      null,
      2,
    ),
  );

  if (!options.apply) {
    return;
  }

  for (const candidate of verifiedCandidates) {
    await db.settlementProcessing.update({
      where: { id: candidate.id },
      data: {
        qboCogsJournalEntryId: candidate.targetNoopId,
      },
    });

    console.log(
      JSON.stringify({
        retired: true,
        invoiceId: candidate.invoiceId,
        preservedQboJournalEntryId: candidate.qboCogsJournalEntryId,
        qboCogsJournalEntryId: candidate.targetNoopId,
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
