import { promises as fs } from 'node:fs';

type CliOptions = {
  startDate: string;
  endDate: string | undefined;
  amazonEnvPath: string;
  plutusEnvPath: string;
  apply: boolean;
  resync: boolean;
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

async function loadAmazonEnvFile(filePath: string): Promise<void> {
  const raw = await fs.readFile(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line);
    if (!parsed) continue;
    const isAmazon = parsed.key.startsWith('AMAZON_') || parsed.key.startsWith('AWS_');
    if (!isAmazon) continue;
    if (process.env[parsed.key] !== undefined) continue;
    process.env[parsed.key] = parsed.value;
  }
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

function requireIsoDay(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return trimmed;
}

function parseArgs(argv: string[]): CliOptions {
  let startDate = '2025-12-01';
  let endDate: string | undefined;
  let amazonEnvPath = '../talos/.env.local';
  let plutusEnvPath = '.env.local';
  let apply = false;
  let resync = true;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === '--start-date') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --start-date');
      startDate = next;
      i += 2;
      continue;
    }

    if (arg === '--end-date') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --end-date');
      endDate = next;
      i += 2;
      continue;
    }

    if (arg === '--amazon-env') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --amazon-env');
      amazonEnvPath = next;
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

    if (arg === '--no-resync') {
      resync = false;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { startDate, endDate, amazonEnvPath, plutusEnvPath, apply, resync };
}

function buildQboJournalHref(journalEntryId: string): string {
  return `https://app.qbo.intuit.com/app/journal?txnId=${journalEntryId}`;
}

function isNoopJournalEntryId(value: string): boolean {
  return value.trim().startsWith('NOOP-');
}

type TargetKind = 'settlement' | 'cogs' | 'pnl' | 'unknown';

function classifyDocNumber(docNumber: string): TargetKind {
  const trimmed = docNumber.trim();
  if (trimmed === '') return 'unknown';

  const first = trimmed[0] ? trimmed[0].toUpperCase() : '';
  if (first === 'C') return 'cogs';
  if (first === 'P') return 'pnl';
  if (/^US-/i.test(trimmed) || /^LMB-US-/i.test(trimmed) || /#LMB-US-/i.test(trimmed)) return 'settlement';
  if (/US-/i.test(trimmed)) return 'unknown';
  return 'unknown';
}

type DeletionTarget = {
  journalEntryId: string;
  txnDate: string | null;
  docNumber: string | null;
  kind: TargetKind;
  source: 'qbo-search' | 'db-processing' | 'db-rollback';
  existsInQbo: boolean;
};

function toIsoStart(startDate: string): Date {
  return new Date(`${startDate}T00:00:00.000Z`);
}

function toIsoEnd(endDate: string | undefined): Date {
  if (endDate !== undefined) {
    return new Date(`${endDate}T23:59:59.999Z`);
  }
  return new Date();
}

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Failed to fetch journal entry: 404')) return true;
  if (message.includes('Failed to delete journal entry: 404')) return true;
  if (message.includes('Object Not Found')) return true;
  if (message.includes('"code":"610"')) return true;
  return false;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const startDate = requireIsoDay(options.startDate, 'startDate');
  const endDate = options.endDate === undefined ? undefined : requireIsoDay(options.endDate, 'endDate');

  await loadAmazonEnvFile(options.amazonEnvPath);
  await loadPlutusEnvFile(options.plutusEnvPath);

  const { db } = await import('@/lib/db');
  const { fetchJournalEntries, fetchJournalEntryById, deleteJournalEntry } = await import('@/lib/qbo/api');
  const { getQboConnection, saveServerQboConnection } = await import('@/lib/qbo/connection-store');
  const { syncUsSettlementsFromSpApiFinances } = await import('@/lib/amazon-finances/us-settlement-sync');

  const connection = await getQboConnection();
  if (!connection) {
    throw new Error('Not connected to QBO');
  }
  let activeConnection = connection;

  const rangeStart = toIsoStart(startDate);
  const rangeEnd = toIsoEnd(endDate);

  const processingRows = await db.settlementProcessing.findMany({
    where: {
      marketplace: 'amazon.com',
      lmbDocNumber: { contains: 'US-' },
      lmbPostedDate: { gte: rangeStart, lte: rangeEnd },
    },
    select: {
      id: true,
      invoiceId: true,
      lmbDocNumber: true,
      qboSettlementJournalEntryId: true,
      qboCogsJournalEntryId: true,
      qboPnlReclassJournalEntryId: true,
    },
  });

  const rollbackRows = await db.settlementRollback.findMany({
    where: {
      marketplace: 'amazon.com',
      lmbDocNumber: { contains: 'US-' },
      lmbPostedDate: { gte: rangeStart, lte: rangeEnd },
    },
    select: {
      id: true,
      invoiceId: true,
      lmbDocNumber: true,
      qboSettlementJournalEntryId: true,
      qboCogsJournalEntryId: true,
      qboPnlReclassJournalEntryId: true,
    },
  });

  const qboIdsToDelete = new Set<string>();
  const invoiceIdsToDelete = new Set<string>();
  const auditUploadsMaybeEmpty = new Set<string>();

  for (const row of processingRows) {
    qboIdsToDelete.add(row.qboSettlementJournalEntryId);
    if (!isNoopJournalEntryId(row.qboCogsJournalEntryId)) {
      qboIdsToDelete.add(row.qboCogsJournalEntryId);
    }
    if (!isNoopJournalEntryId(row.qboPnlReclassJournalEntryId)) {
      qboIdsToDelete.add(row.qboPnlReclassJournalEntryId);
    }
    invoiceIdsToDelete.add(row.invoiceId);
    invoiceIdsToDelete.add(row.lmbDocNumber);
  }

  for (const row of rollbackRows) {
    qboIdsToDelete.add(row.qboSettlementJournalEntryId);
    if (!isNoopJournalEntryId(row.qboCogsJournalEntryId)) {
      qboIdsToDelete.add(row.qboCogsJournalEntryId);
    }
    if (!isNoopJournalEntryId(row.qboPnlReclassJournalEntryId)) {
      qboIdsToDelete.add(row.qboPnlReclassJournalEntryId);
    }
    invoiceIdsToDelete.add(row.invoiceId);
    invoiceIdsToDelete.add(row.lmbDocNumber);
  }

  // QBO search by DocNumber contains "US-" catches:
  // - settlement JEs (US-... and legacy LMB-US-...)
  // - processing JEs when invoiceId is a settlement doc number (CUS-... / PUS-... and legacy CLMB-US-... / PLMB-US-...)
  // It does NOT catch processing JEs for numeric invoiceIds (e.g. C18299627).
  const qboSearchResults: Array<{ id: string; txnDate: string; docNumber: string }> = [];

  let startPosition = 1;
  const queryPageSize = 100;
  while (true) {
    const page = await fetchJournalEntries(activeConnection, {
      startDate,
      endDate,
      docNumberContains: 'US-',
      maxResults: queryPageSize,
      startPosition,
    });
    if (page.updatedConnection) {
      activeConnection = page.updatedConnection;
    }

    for (const je of page.journalEntries) {
      if (!je.DocNumber) continue;
      qboSearchResults.push({ id: je.Id, txnDate: je.TxnDate, docNumber: je.DocNumber });
    }

    if (qboSearchResults.length >= page.totalCount) break;
    if (page.journalEntries.length === 0) break;
    startPosition += page.journalEntries.length;
  }

  for (const r of qboSearchResults) {
    qboIdsToDelete.add(r.id);
  }

  const targets: DeletionTarget[] = [];

  for (const r of qboSearchResults) {
    targets.push({
      journalEntryId: r.id,
      txnDate: r.txnDate,
      docNumber: r.docNumber,
      kind: classifyDocNumber(r.docNumber),
      source: 'qbo-search',
      existsInQbo: true,
    });
  }

  const seenFromSearch = new Set(qboSearchResults.map((r) => r.id));

  for (const row of processingRows) {
    const ids = [row.qboSettlementJournalEntryId, row.qboCogsJournalEntryId, row.qboPnlReclassJournalEntryId];
    for (const id of ids) {
      if (isNoopJournalEntryId(id)) continue;
      if (seenFromSearch.has(id)) continue;
      targets.push({ journalEntryId: id, txnDate: null, docNumber: null, kind: 'unknown', source: 'db-processing', existsInQbo: true });
    }
  }

  for (const row of rollbackRows) {
    const ids = [row.qboSettlementJournalEntryId, row.qboCogsJournalEntryId, row.qboPnlReclassJournalEntryId];
    for (const id of ids) {
      if (isNoopJournalEntryId(id)) continue;
      if (seenFromSearch.has(id)) continue;
      targets.push({ journalEntryId: id, txnDate: null, docNumber: null, kind: 'unknown', source: 'db-rollback', existsInQbo: true });
    }
  }

  // Fetch missing DocNumber/TxnDate for db-sourced targets so the plan is auditable.
  for (const target of targets) {
    if (target.docNumber !== null && target.txnDate !== null) continue;
    try {
      const full = await fetchJournalEntryById(activeConnection, target.journalEntryId);
      if (full.updatedConnection) {
        activeConnection = full.updatedConnection;
      }
      target.docNumber = full.journalEntry.DocNumber ? full.journalEntry.DocNumber : null;
      target.txnDate = full.journalEntry.TxnDate ? full.journalEntry.TxnDate : null;
      target.kind = target.docNumber ? classifyDocNumber(target.docNumber) : 'unknown';
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      target.existsInQbo = false;
      target.docNumber = null;
      target.txnDate = null;
      target.kind = 'unknown';
    }
  }

  // Stable, safer delete order: processing JEs first, then settlement JEs.
  targets.sort((a, b) => {
    const kindOrder: Record<TargetKind, number> = { cogs: 0, pnl: 1, unknown: 2, settlement: 3 };
    const ka = kindOrder[a.kind];
    const kb = kindOrder[b.kind];
    if (ka !== kb) return ka - kb;
    const da = a.txnDate ? a.txnDate : '';
    const db = b.txnDate ? b.txnDate : '';
    if (da !== db) return da.localeCompare(db);
    const na = a.docNumber ? a.docNumber : '';
    const nb = b.docNumber ? b.docNumber : '';
    if (na !== nb) return na.localeCompare(nb);
    return a.journalEntryId.localeCompare(b.journalEntryId);
  });

  const deletionPlan = targets.map((t) => ({
    source: t.source,
    kind: t.kind,
    existsInQbo: t.existsInQbo,
    txnDate: t.txnDate,
    docNumber: t.docNumber,
    journalEntryId: t.journalEntryId,
    qboUrl: buildQboJournalHref(t.journalEntryId),
  }));

  const existingTargetCount = targets.filter((t) => t.existsInQbo).length;
  const missingTargetCount = targets.length - existingTargetCount;

  if (!options.apply) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          options: { startDate, endDate, resync: options.resync },
          totals: {
            qboJournalEntriesMatchedByDocNumber: qboSearchResults.length,
            qboJournalEntriesToDelete: existingTargetCount,
            qboJournalEntriesMissing: missingTargetCount,
            dbSettlementProcessingRows: processingRows.length,
            dbSettlementRollbackRows: rollbackRows.length,
            auditInvoiceIdsToDelete: Array.from(invoiceIdsToDelete).length,
          },
          plan: deletionPlan,
          next: {
            command: 'pnpm -C apps/plutus exec tsx scripts/us-settlement-reset-spapi.ts --apply --start-date <YYYY-MM-DD> [--end-date <YYYY-MM-DD>]',
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const deletions: Array<{ journalEntryId: string; ok: boolean; skipped: boolean; error?: string }> = [];
  for (const target of targets) {
    if (!target.existsInQbo) {
      deletions.push({ journalEntryId: target.journalEntryId, ok: true, skipped: true });
      continue;
    }

    try {
      const res = await deleteJournalEntry(activeConnection, target.journalEntryId);
      if (res.updatedConnection) {
        activeConnection = res.updatedConnection;
      }
      deletions.push({ journalEntryId: target.journalEntryId, ok: true, skipped: false });
    } catch (error) {
      if (isNotFoundError(error)) {
        deletions.push({ journalEntryId: target.journalEntryId, ok: true, skipped: true });
        continue;
      }

      deletions.push({
        journalEntryId: target.journalEntryId,
        ok: false,
        skipped: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const failedDeletions = deletions.filter((d) => !d.ok);
  if (failedDeletions.length > 0) {
    await saveServerQboConnection(activeConnection);
    console.log(
      JSON.stringify(
        {
          dryRun: false,
          options: { startDate, endDate, resync: options.resync },
          error: 'Some QBO deletions failed; aborting DB cleanup and resync.',
          failedDeletions,
          qboLinks: failedDeletions.map((d) => ({ journalEntryId: d.journalEntryId, qboUrl: buildQboJournalHref(d.journalEntryId) })),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const deletedCount = deletions.filter((d) => d.ok && !d.skipped).length;
  const skippedCount = deletions.filter((d) => d.skipped).length;

  // DB cleanup (Plutus only) — remove processed/rollback records and invoice audit rows for this US range.
  await db.settlementProcessing.deleteMany({
    where: { id: { in: processingRows.map((r) => r.id) } },
  });
  await db.settlementRollback.deleteMany({
    where: { id: { in: rollbackRows.map((r) => r.id) } },
  });

  const affectedUploadIds = await db.auditDataRow.findMany({
    where: { invoiceId: { in: Array.from(invoiceIdsToDelete) }, market: { equals: 'us', mode: 'insensitive' } },
    select: { uploadId: true },
    distinct: ['uploadId'],
  });
  for (const row of affectedUploadIds) {
    auditUploadsMaybeEmpty.add(row.uploadId);
  }

  await db.auditDataRow.deleteMany({
    where: { invoiceId: { in: Array.from(invoiceIdsToDelete) }, market: { equals: 'us', mode: 'insensitive' } },
  });

  for (const uploadId of auditUploadsMaybeEmpty) {
    const remaining = await db.auditDataRow.count({ where: { uploadId } });
    if (remaining === 0) {
      await db.auditDataUpload.delete({ where: { id: uploadId } });
    }
  }

  await saveServerQboConnection(activeConnection);

  let resyncResult: unknown = null;
  if (options.resync) {
    resyncResult = await syncUsSettlementsFromSpApiFinances({
      startDate,
      endDate,
      postToQbo: true,
      process: true,
    });
  }

  console.log(
    JSON.stringify(
      {
        dryRun: false,
        options: { startDate, endDate, resync: options.resync },
        totals: {
          deletedQboJournalEntries: deletedCount,
          skippedQboJournalEntries: skippedCount,
          deletedSettlementProcessingRows: processingRows.length,
          deletedSettlementRollbackRows: rollbackRows.length,
          deletedAuditInvoiceIds: Array.from(invoiceIdsToDelete).length,
        },
        resyncResult,
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
