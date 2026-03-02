import { promises as fs } from 'node:fs';

import { deleteJournalEntry, QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { isQboJournalEntryId } from '@/lib/plutus/journal-entry-id';

type CliOptions = {
  invoiceId: string | null;
  marketplace: string | null;
  apply: boolean;
  plutusEnvPath: string;
};

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

async function loadPlutusEnvFile(filePath: string): Promise<void> {
  const raw = await fs.readFile(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line);
    if (!parsed) continue;
    const isPlutus = parsed.key === 'DATABASE_URL' || parsed.key.startsWith('QBO_') || parsed.key.startsWith('PLUTUS_');
    if (!isPlutus) continue;
    process.env[parsed.key] = parsed.value;
  }
}

function parseArgs(argv: string[]): CliOptions {
  let invoiceId: string | null = null;
  let marketplace: string | null = null;
  let apply = false;
  let plutusEnvPath = '.env.local';

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === '--invoice-id') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --invoice-id');
      invoiceId = next.trim();
      i += 2;
      continue;
    }

    if (arg === '--marketplace') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --marketplace');
      marketplace = next.trim();
      i += 2;
      continue;
    }

    if (arg === '--plutus-env') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --plutus-env');
      plutusEnvPath = next;
      i += 2;
      continue;
    }

    if (arg === '--apply') {
      apply = true;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { invoiceId, marketplace, apply, plutusEnvPath };
}

function isQboNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('Object Not Found') && error.message.includes('"code":"610"');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await loadPlutusEnvFile(options.plutusEnvPath);
  const { db } = await import('@/lib/db');

  const connection = await getQboConnection();
  if (!connection) {
    throw new Error('Not connected to QBO (missing server connection file)');
  }
  let activeConnection = connection;

  const processingRows = await db.settlementProcessing.findMany({
    where: {
      ...(options.invoiceId ? { invoiceId: options.invoiceId } : {}),
      ...(options.marketplace ? { marketplace: options.marketplace } : {}),
    },
    include: {
      _count: { select: { orderSales: true, orderReturns: true } },
    },
    orderBy: { uploadedAt: 'desc' },
  });

  if (!options.apply) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          options: {
            invoiceId: options.invoiceId,
            marketplace: options.marketplace,
          },
          totals: {
            settlementProcessingRows: processingRows.length,
          },
          plan: processingRows.map((row) => ({
            id: row.id,
            marketplace: row.marketplace,
            invoiceId: row.invoiceId,
            settlementJournalEntryId: row.qboSettlementJournalEntryId,
            settlementDocNumber: row.settlementDocNumber,
            settlementPostedDate: row.settlementPostedDate,
            cogsJournalEntryId: row.qboCogsJournalEntryId,
            pnlJournalEntryId: row.qboPnlReclassJournalEntryId,
            uploadedAt: row.uploadedAt,
            sourceFilename: row.sourceFilename,
            orderSalesCount: row._count.orderSales,
            orderReturnsCount: row._count.orderReturns,
          })),
          next: {
            command:
              'pnpm -C apps/plutus exec tsx scripts/rollback-settlement-processing.ts --apply [--invoice-id <ID>] [--marketplace <amazon.com|amazon.co.uk>] --plutus-env <path>',
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const results: Array<{ settlementProcessingId: string; invoiceId: string; ok: boolean; error?: string }> = [];

  for (const row of processingRows) {
    try {
      if (isQboJournalEntryId(row.qboCogsJournalEntryId)) {
        try {
          const deleted = await deleteJournalEntry(activeConnection, row.qboCogsJournalEntryId);
          if (deleted.updatedConnection) activeConnection = deleted.updatedConnection;
        } catch (error) {
          if (!isQboNotFoundError(error)) throw error;
        }
      }

      if (isQboJournalEntryId(row.qboPnlReclassJournalEntryId)) {
        try {
          const deleted = await deleteJournalEntry(activeConnection, row.qboPnlReclassJournalEntryId);
          if (deleted.updatedConnection) activeConnection = deleted.updatedConnection;
        } catch (error) {
          if (!isQboNotFoundError(error)) throw error;
        }
      }

      await db.settlementRollback.create({
        data: {
          marketplace: row.marketplace,
          qboSettlementJournalEntryId: row.qboSettlementJournalEntryId,
          settlementDocNumber: row.settlementDocNumber,
          settlementPostedDate: row.settlementPostedDate,
          invoiceId: row.invoiceId,
          processingHash: row.processingHash,
          sourceFilename: row.sourceFilename,
          processedAt: row.uploadedAt,
          qboCogsJournalEntryId: row.qboCogsJournalEntryId,
          qboPnlReclassJournalEntryId: row.qboPnlReclassJournalEntryId,
          orderSalesCount: row._count.orderSales,
          orderReturnsCount: row._count.orderReturns,
        },
      });

      await db.settlementProcessing.delete({ where: { id: row.id } });

      results.push({ settlementProcessingId: row.id, invoiceId: row.invoiceId, ok: true });
    } catch (error) {
      results.push({
        settlementProcessingId: row.id,
        invoiceId: row.invoiceId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (activeConnection !== connection) {
    await saveServerQboConnection(activeConnection);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    JSON.stringify(
      {
        dryRun: false,
        options: {
          invoiceId: options.invoiceId,
          marketplace: options.marketplace,
        },
        totals: {
          settlementProcessingRows: processingRows.length,
          rolledBack: results.filter((r) => r.ok).length,
          failed: failed.length,
        },
        failures: failed,
      },
      null,
      2,
    ),
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  if (error instanceof QboAuthError) {
    console.error(error.message);
    process.exit(1);
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
