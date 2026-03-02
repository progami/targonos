import { promises as fs } from 'node:fs';

import type { QboConnection } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import type { SettlementAuditRow } from '@/lib/plutus/settlement-audit';

type CliOptions = {
  invoiceId: string | null;
  marketplace: string | null;
  amazonEnvPath: string | null;
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

async function loadAmazonEnvFile(filePath: string): Promise<void> {
  const raw = await fs.readFile(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line);
    if (!parsed) continue;
    const isAmazon = parsed.key.startsWith('AMAZON_') || parsed.key.startsWith('AWS_');
    if (!isAmazon) continue;
    process.env[parsed.key] = parsed.value;
  }
}

function parseArgs(argv: string[]): CliOptions {
  let invoiceId: string | null = null;
  let marketplace: string | null = null;
  let amazonEnvPath: string | null = null;
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

    if (arg === '--amazon-env') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --amazon-env');
      amazonEnvPath = next.trim();
      if (amazonEnvPath === '') amazonEnvPath = null;
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

  return { invoiceId, marketplace, amazonEnvPath, apply, plutusEnvPath };
}

async function loadAuditRowsFromDb(input: {
  db: any;
  invoiceId: string;
  marketplace: string;
  sourceFilename: string;
  processedAt: Date;
}): Promise<SettlementAuditRow[]> {
  const { normalizeAuditMarketToMarketplaceId } = await import('@/lib/plutus/audit-invoice-matching');

  const buildScopedRows = async (uploadId: string): Promise<SettlementAuditRow[]> => {
    const storedRows = await input.db.auditDataRow.findMany({
      where: { uploadId, invoiceId: input.invoiceId },
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
    });

    const scoped: SettlementAuditRow[] = [];
    for (const row of storedRows) {
      const marketplaceId = normalizeAuditMarketToMarketplaceId(row.market);
      if (marketplaceId !== input.marketplace) continue;

      scoped.push({
        invoiceId: row.invoiceId,
        market: row.market,
        date: row.date,
        orderId: row.orderId,
        sku: row.sku,
        quantity: row.quantity,
        description: row.description,
        net: row.net / 100,
      });
    }

    return scoped;
  };

  const uploads = await input.db.auditDataUpload.findMany({
    where: { filename: input.sourceFilename },
    orderBy: { uploadedAt: 'desc' },
    select: { id: true, uploadedAt: true },
  });

  if (uploads.length === 0) {
    throw new Error(`No audit upload found with filename=${input.sourceFilename}`);
  }

  const candidates = uploads.filter((u: any) => u.uploadedAt <= input.processedAt);
  const orderedCandidates = candidates.length > 0 ? candidates : uploads;

  for (const upload of orderedCandidates) {
    const scoped = await buildScopedRows(upload.id);
    if (scoped.length > 0) {
      return scoped;
    }
  }

  const fallbackUploads = await input.db.auditDataUpload.findMany({
    where: { rows: { some: { invoiceId: input.invoiceId } } },
    orderBy: { uploadedAt: 'desc' },
    select: { id: true, filename: true, uploadedAt: true },
    take: 20,
  });

  for (const upload of fallbackUploads) {
    const scoped = await buildScopedRows(upload.id);
    if (scoped.length > 0) {
      return scoped;
    }
  }

  throw new Error(
    `No stored audit rows found for invoice=${input.invoiceId} marketplace=${input.marketplace} (filename=${input.sourceFilename}, fallbackUploads=${fallbackUploads.length})`,
  );
}

function isQboNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('Object Not Found') && error.message.includes('"code":"610"');
}

async function resolveSettlementJournalEntryId(input: {
  connection: QboConnection;
  settlementJournalEntryId: string;
  invoiceId: string;
}): Promise<{ settlementJournalEntryId: string; updatedConnection?: QboConnection }> {
  let activeConnection = input.connection;
  const { fetchJournalEntryById, fetchJournalEntries } = await import('@/lib/qbo/api');
  const { isSettlementDocNumber, normalizeSettlementDocNumber } = await import('@/lib/plutus/settlement-doc-number');

  const isCanonicalSettlementDocNumber = (docNumber: string): boolean => {
    const trimmedUpper = docNumber.trim().toUpperCase();
    if (!isSettlementDocNumber(trimmedUpper)) return false;
    return trimmedUpper === normalizeSettlementDocNumber(trimmedUpper);
  };

  const pickPreferredSettlementEntry = (a: any, b: any): any => {
    const aDocNumber = typeof a.DocNumber === 'string' ? a.DocNumber : '';
    const bDocNumber = typeof b.DocNumber === 'string' ? b.DocNumber : '';

    const aCanonical = isCanonicalSettlementDocNumber(aDocNumber);
    const bCanonical = isCanonicalSettlementDocNumber(bDocNumber);

    if (aCanonical && !bCanonical) return a;
    if (bCanonical && !aCanonical) return b;

    const aTxnDate = typeof a.TxnDate === 'string' ? a.TxnDate : '';
    const bTxnDate = typeof b.TxnDate === 'string' ? b.TxnDate : '';

    if (aTxnDate !== bTxnDate) {
      return aTxnDate > bTxnDate ? a : b;
    }

    return a.Id > b.Id ? a : b;
  };

  try {
    const existing = await fetchJournalEntryById(activeConnection, input.settlementJournalEntryId);
    if (existing.updatedConnection) {
      activeConnection = existing.updatedConnection;
    }
    return {
      settlementJournalEntryId: input.settlementJournalEntryId,
      updatedConnection: activeConnection === input.connection ? undefined : activeConnection,
    };
  } catch (error) {
    if (!isQboNotFoundError(error)) throw error;
  }

  const search = await fetchJournalEntries(activeConnection, {
    docNumberContains: input.invoiceId,
    maxResults: 10,
    startPosition: 1,
  });
  if (search.updatedConnection) {
    activeConnection = search.updatedConnection;
  }

  const normalizedTarget = normalizeSettlementDocNumber(input.invoiceId);
  const candidates = search.journalEntries.filter((je: any) => {
    const docNumber = typeof je.DocNumber === 'string' ? je.DocNumber : '';
    if (docNumber === '') return false;
    if (!isSettlementDocNumber(docNumber)) return false;
    return normalizeSettlementDocNumber(docNumber) === normalizedTarget;
  });

  if (candidates.length === 0) {
    throw new Error(`Missing settlement journal entry in QBO for invoiceId=${input.invoiceId}`);
  }

  let selected = candidates[0]!;
  for (const candidate of candidates.slice(1)) {
    selected = pickPreferredSettlementEntry(selected, candidate);
  }

  return {
    settlementJournalEntryId: selected.Id,
    updatedConnection: activeConnection === input.connection ? undefined : activeConnection,
  };
}

export async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await loadPlutusEnvFile(options.plutusEnvPath);
  if (options.amazonEnvPath !== null) {
    await loadAmazonEnvFile(options.amazonEnvPath);
  }

  const connectionMaybe = await getQboConnection();
  if (!connectionMaybe) throw new Error('Not connected to QBO (missing server connection file)');
  let activeConnection: QboConnection = connectionMaybe;

  const { db } = await import('@/lib/db');
  const { processSettlement } = await import('@/lib/plutus/settlement-processing');

  const rollbackRows = await db.settlementRollback.findMany({
    where: {
      ...(options.invoiceId ? { invoiceId: options.invoiceId } : {}),
      ...(options.marketplace ? { marketplace: options.marketplace } : {}),
    },
    orderBy: { rolledBackAt: 'desc' },
  });

  const processed = await db.settlementProcessing.findMany({
    select: { marketplace: true, invoiceId: true, qboSettlementJournalEntryId: true },
  });
  const processedSettlementIds = new Set(processed.map((p: any) => p.qboSettlementJournalEntryId));
  const processedInvoiceKeys = new Set(processed.map((p: any) => `${p.marketplace}::${p.invoiceId}`));

  const latestByKey = new Map<string, any>();
  for (const row of rollbackRows) {
    const key = `${row.marketplace}::${row.invoiceId}`;
    if (processedSettlementIds.has(row.qboSettlementJournalEntryId)) continue;
    if (processedInvoiceKeys.has(key)) continue;
    if (latestByKey.has(key)) continue;
    latestByKey.set(key, row);
  }

  const targets = Array.from(latestByKey.values()).sort((a: any, b: any) => {
    const ma = a.marketplace.localeCompare(b.marketplace);
    if (ma !== 0) return ma;
    return a.invoiceId.localeCompare(b.invoiceId);
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
            rollbackRows: rollbackRows.length,
            targets: targets.length,
          },
          plan: targets.map((row: any) => ({
            marketplace: row.marketplace,
            invoiceId: row.invoiceId,
            settlementJournalEntryId: row.qboSettlementJournalEntryId,
            sourceFilename: row.sourceFilename,
            rolledBackAt: row.rolledBackAt,
          })),
          next: {
            command:
              'pnpm -C apps/plutus exec tsx scripts/reprocess-rolledback-settlements.ts --apply [--invoice-id <ID>] [--marketplace <amazon.com|amazon.co.uk>] --plutus-env <path>',
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const results: Array<{
    marketplace: string;
    invoiceId: string;
    settlementJournalEntryId: string;
    ok: boolean;
    blocks?: string[];
    posted?: { cogsJournalEntryId: string; pnlJournalEntryId: string };
    error?: string;
  }> = [];

  for (const rollback of targets) {
    try {
      const auditRows = await loadAuditRowsFromDb({
        db,
        invoiceId: rollback.invoiceId,
        marketplace: rollback.marketplace,
        sourceFilename: rollback.sourceFilename,
        processedAt: rollback.processedAt,
      });

      const resolvedSettlement = await resolveSettlementJournalEntryId({
        connection: activeConnection,
        settlementJournalEntryId: rollback.qboSettlementJournalEntryId,
        invoiceId: rollback.invoiceId,
      });
      if (resolvedSettlement.updatedConnection) {
        activeConnection = resolvedSettlement.updatedConnection;
      }

      const processedResult = await processSettlement({
        connection: activeConnection,
        settlementJournalEntryId: resolvedSettlement.settlementJournalEntryId,
        sourceFilename: rollback.sourceFilename,
        invoiceId: rollback.invoiceId,
        auditRows,
      });
      if (processedResult.updatedConnection) {
        activeConnection = processedResult.updatedConnection;
      }

      if (!processedResult.result.ok) {
        results.push({
          marketplace: rollback.marketplace,
          invoiceId: rollback.invoiceId,
          settlementJournalEntryId: rollback.qboSettlementJournalEntryId,
          ok: false,
          blocks: processedResult.result.preview.blocks.map((b: any) => b.code),
        });
        continue;
      }

      results.push({
        marketplace: rollback.marketplace,
        invoiceId: rollback.invoiceId,
        settlementJournalEntryId: rollback.qboSettlementJournalEntryId,
        ok: true,
        posted: {
          cogsJournalEntryId: processedResult.result.posted.cogsJournalEntryId,
          pnlJournalEntryId: processedResult.result.posted.pnlJournalEntryId,
        },
      });
    } catch (error) {
      results.push({
        marketplace: rollback.marketplace,
        invoiceId: rollback.invoiceId,
        settlementJournalEntryId: rollback.qboSettlementJournalEntryId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (activeConnection !== connectionMaybe) {
    await saveServerQboConnection(activeConnection);
  }

  const okCount = results.filter((r) => r.ok).length;
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
          targets: targets.length,
          ok: okCount,
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
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
