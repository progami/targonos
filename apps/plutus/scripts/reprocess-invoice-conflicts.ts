import { promises as fs } from 'node:fs';
import path from 'node:path';

import { fromCents } from '@/lib/inventory/money';
import { isQboJournalEntryId } from '@/lib/plutus/journal-entry-id';
import type { SettlementAuditRow } from '@/lib/plutus/settlement-audit';
import { computeProcessingHash } from '@/lib/plutus/settlement-validation';
import { deleteJournalEntry, fetchJournalEntries, QboAuthError, type QboConnection } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

type DbClient = typeof import('@/lib/db').db;

type CliOptions = {
  marketplace: 'amazon.com' | 'amazon.co.uk';
  apply: boolean;
  max: number | null;
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

function parseArgs(argv: string[]): CliOptions {
  let marketplace: CliOptions['marketplace'] = 'amazon.com';
  let apply = false;
  let max: number | null = null;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === '--marketplace') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --marketplace');
      if (next !== 'amazon.com' && next !== 'amazon.co.uk') {
        throw new Error(`Invalid marketplace: ${next}`);
      }
      marketplace = next;
      i += 2;
      continue;
    }

    if (arg === '--apply') {
      apply = true;
      i += 1;
      continue;
    }

    if (arg === '--max') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --max');
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid --max value: ${next}`);
      }
      max = parsed;
      i += 2;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { marketplace, apply, max };
}

function inferMarketCode(marketplace: CliOptions['marketplace']): 'us' | 'uk' {
  if (marketplace === 'amazon.com') return 'us';
  return 'uk';
}

function buildProcessingDocNumber(kind: 'C' | 'P', invoiceId: string): string {
  const base = `${kind}${invoiceId}`;
  if (base.length <= 21) return base;
  return `${kind}${invoiceId.slice(-20)}`;
}

function isQboNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('Object Not Found') && error.message.includes('"code":"610"');
}

async function findInvoiceJournalEntryIds(input: {
  connection: QboConnection;
  invoiceId: string;
}): Promise<{
  updatedConnection?: QboConnection;
  settlementJournalEntryId: string | null;
  cogsJournalEntryId: string | null;
  pnlJournalEntryId: string | null;
}> {
  const query = await fetchJournalEntries(input.connection, {
    docNumberContains: input.invoiceId,
    maxResults: 50,
    startPosition: 1,
  });

  const settlementDocNumber = input.invoiceId.trim();
  const cogsDocNumber = buildProcessingDocNumber('C', settlementDocNumber);
  const pnlDocNumber = buildProcessingDocNumber('P', settlementDocNumber);

  const matches = query.journalEntries.map((je) => ({
    id: je.Id,
    txnDate: je.TxnDate,
    docNumber: je.DocNumber ? je.DocNumber.trim() : '',
    privateNote: je.PrivateNote ? je.PrivateNote : '',
  }));

  const pick = (docNumber: string): { id: string; privateNote: string } | null => {
    const exact = matches.filter((m) => m.docNumber.toUpperCase() === docNumber.toUpperCase());
    if (exact.length === 0) return null;
    exact.sort((a, b) => {
      if (a.txnDate !== b.txnDate) return b.txnDate.localeCompare(a.txnDate);
      return b.id.localeCompare(a.id);
    });
    const best = exact[0]!;
    return { id: best.id, privateNote: best.privateNote };
  };

  const settlement = pick(settlementDocNumber);
  const cogs = pick(cogsDocNumber);
  const pnl = pick(pnlDocNumber);

  if (cogs && !cogs.privateNote.includes('Plutus')) {
    throw new Error(`Refusing to delete COGS JE ${cogs.id} (${cogsDocNumber}) — missing Plutus private note`);
  }
  if (pnl && !pnl.privateNote.includes('Plutus')) {
    throw new Error(`Refusing to delete P&L JE ${pnl.id} (${pnlDocNumber}) — missing Plutus private note`);
  }

  return {
    updatedConnection: query.updatedConnection,
    settlementJournalEntryId: settlement ? settlement.id : null,
    cogsJournalEntryId: cogs ? cogs.id : null,
    pnlJournalEntryId: pnl ? pnl.id : null,
  };
}

async function loadAuditRowsFromDb(input: {
  db: DbClient;
  invoiceId: string;
  marketplace: CliOptions['marketplace'];
  sourceFilename: string;
  processedAt: Date;
}): Promise<{ rows: SettlementAuditRow[]; sourceFilename: string }> {
  const market = inferMarketCode(input.marketplace);

  const uploads = await input.db.auditDataUpload.findMany({
    where: { filename: input.sourceFilename },
    orderBy: { uploadedAt: 'desc' },
    select: { id: true, filename: true, uploadedAt: true },
  });

  if (uploads.length === 0) {
    throw new Error(
      `No audit upload found for ${input.invoiceId} (${input.marketplace}) with filename=${input.sourceFilename} at or before ${input.processedAt.toISOString()}`,
    );
  }

  const candidates = uploads.filter((u) => u.uploadedAt <= input.processedAt);
  const orderedCandidates = candidates.length > 0 ? candidates : uploads;
  for (const chosen of orderedCandidates) {
    const dbRows = await input.db.auditDataRow.findMany({
      where: {
        uploadId: chosen.id,
        invoiceId: input.invoiceId,
        market: { equals: market, mode: 'insensitive' },
      },
    });

    if (dbRows.length === 0) continue;

    const rows: SettlementAuditRow[] = dbRows.map((r) => ({
      invoiceId: r.invoiceId,
      market: r.market,
      date: r.date,
      orderId: r.orderId,
      sku: r.sku,
      quantity: r.quantity,
      description: r.description,
      net: fromCents(r.net),
    }));

    return { rows, sourceFilename: chosen.filename };
  }

  throw new Error(
    `No stored audit rows found for invoice ${input.invoiceId} (${input.marketplace}) in any upload with filename=${input.sourceFilename} at or before ${input.processedAt.toISOString()}`,
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await loadPlutusEnv();

  const { db } = await import('@/lib/db');

  const connection = await getQboConnection();
  if (!connection) {
    throw new Error('Not connected to QBO');
  }
  let activeConnection = connection;

  const processings = await db.settlementProcessing.findMany({
    where: { marketplace: options.marketplace },
    orderBy: { uploadedAt: 'asc' },
    select: {
      id: true,
      marketplace: true,
      qboSettlementJournalEntryId: true,
      settlementDocNumber: true,
      settlementPostedDate: true,
      invoiceId: true,
      processingHash: true,
      sourceFilename: true,
      uploadedAt: true,
      qboCogsJournalEntryId: true,
      qboPnlReclassJournalEntryId: true,
      _count: { select: { orderSales: true, orderReturns: true } },
    },
  });

  const conflicts: Array<{
    settlementProcessingId: string;
    invoiceId: string;
    expectedHash: string;
    actualHash: string;
    settlementJournalEntryId: string;
    cogsJournalEntryId: string;
    pnlJournalEntryId: string;
  }> = [];

  for (const processing of processings) {
    const audit = await loadAuditRowsFromDb({
      db,
      invoiceId: processing.invoiceId,
      marketplace: options.marketplace,
      sourceFilename: processing.sourceFilename,
      processedAt: processing.uploadedAt,
    });
    const hash = computeProcessingHash(audit.rows);
    if (hash !== processing.processingHash) {
      conflicts.push({
        settlementProcessingId: processing.id,
        invoiceId: processing.invoiceId,
        expectedHash: processing.processingHash,
        actualHash: hash,
        settlementJournalEntryId: processing.qboSettlementJournalEntryId,
        cogsJournalEntryId: processing.qboCogsJournalEntryId,
        pnlJournalEntryId: processing.qboPnlReclassJournalEntryId,
      });
    }
  }

  if (!options.apply) {
    console.log(JSON.stringify({ options, totals: { processed: processings.length, conflicts: conflicts.length }, conflicts }, null, 2));
    return;
  }

  const { processSettlement } = await import('@/lib/plutus/settlement-processing');

  const toFix = options.max === null ? conflicts : conflicts.slice(0, options.max);
  let fixed = 0;
  let blocked = 0;
  const blockedInvoices: Array<{ invoiceId: string; blockingCodes: string[] }> = [];
  for (const conflict of toFix) {
    const existing = await db.settlementProcessing.findUnique({
      where: { id: conflict.settlementProcessingId },
      select: {
        marketplace: true,
        qboSettlementJournalEntryId: true,
        settlementDocNumber: true,
        settlementPostedDate: true,
        invoiceId: true,
        processingHash: true,
        sourceFilename: true,
        uploadedAt: true,
        qboCogsJournalEntryId: true,
        qboPnlReclassJournalEntryId: true,
        _count: { select: { orderSales: true, orderReturns: true } },
      },
    });
    if (!existing) {
      throw new Error(`SettlementProcessing not found: ${conflict.settlementProcessingId}`);
    }

    const audit = await loadAuditRowsFromDb({
      db,
      invoiceId: existing.invoiceId,
      marketplace: options.marketplace,
      sourceFilename: existing.sourceFilename,
      processedAt: existing.uploadedAt,
    });
    const actualHash = computeProcessingHash(audit.rows);
    if (actualHash === existing.processingHash) {
      continue;
    }

    const invoiceJournals = await findInvoiceJournalEntryIds({
      connection: activeConnection,
      invoiceId: existing.invoiceId,
    });
    if (invoiceJournals.updatedConnection) {
      activeConnection = invoiceJournals.updatedConnection;
    }

    const settlementJournalEntryId = invoiceJournals.settlementJournalEntryId;
    if (!settlementJournalEntryId) {
      throw new Error(`Missing settlement Journal Entry in QBO for invoice ${existing.invoiceId} (${options.marketplace})`);
    }

    if (invoiceJournals.cogsJournalEntryId) {
      try {
        const deleted = await deleteJournalEntry(activeConnection, invoiceJournals.cogsJournalEntryId);
        if (deleted.updatedConnection) activeConnection = deleted.updatedConnection;
      } catch (error) {
        if (!isQboNotFoundError(error)) throw error;
        console.warn(`COGS Journal Entry already missing in QBO; skipping delete: ${invoiceJournals.cogsJournalEntryId}`);
      }
    }

    if (invoiceJournals.pnlJournalEntryId) {
      try {
        const deleted = await deleteJournalEntry(activeConnection, invoiceJournals.pnlJournalEntryId);
        if (deleted.updatedConnection) activeConnection = deleted.updatedConnection;
      } catch (error) {
        if (!isQboNotFoundError(error)) throw error;
        console.warn(`P&L Reclass Journal Entry already missing in QBO; skipping delete: ${invoiceJournals.pnlJournalEntryId}`);
      }
    }

    await db.settlementRollback.create({
      data: {
        marketplace: existing.marketplace,
        qboSettlementJournalEntryId: existing.qboSettlementJournalEntryId,
        settlementDocNumber: existing.settlementDocNumber,
        settlementPostedDate: existing.settlementPostedDate,
        invoiceId: existing.invoiceId,
        processingHash: existing.processingHash,
        sourceFilename: existing.sourceFilename,
        processedAt: existing.uploadedAt,
        qboCogsJournalEntryId: existing.qboCogsJournalEntryId,
        qboPnlReclassJournalEntryId: existing.qboPnlReclassJournalEntryId,
        orderSalesCount: existing._count.orderSales,
        orderReturnsCount: existing._count.orderReturns,
      },
    });

    await db.settlementProcessing.delete({
      where: { id: conflict.settlementProcessingId },
    });

    const processed = await processSettlement({
      connection: activeConnection,
      settlementJournalEntryId,
      auditRows: audit.rows,
      sourceFilename: audit.sourceFilename,
      invoiceId: existing.invoiceId,
    });
    if (processed.updatedConnection) {
      activeConnection = processed.updatedConnection;
    }
    if (!processed.result.ok) {
      blocked += 1;
      blockedInvoices.push({
        invoiceId: existing.invoiceId,
        blockingCodes: processed.result.preview.blocks.map((block) => block.code),
      });
      continue;
    }
    fixed += 1;
  }

  await saveServerQboConnection(activeConnection);

  console.log(
    JSON.stringify(
      {
        options,
        totals: {
          processed: processings.length,
          conflicts: conflicts.length,
          attempted: toFix.length,
          fixed,
          blocked,
        },
        blockedInvoices,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof QboAuthError) {
    console.error(`QBO auth error: ${error.message}`);
    process.exit(1);
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
