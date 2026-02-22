import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { SettlementAuditRow } from '@/lib/plutus/settlement-audit';
import { normalizeAuditMarketToMarketplaceId } from '@/lib/plutus/audit-invoice-matching';
import { fetchJournalEntryById, type QboConnection, type QboJournalEntry } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { isNoopJournalEntryId, isQboJournalEntryId } from '@/lib/plutus/journal-entry-id';

type DbClient = typeof import('@/lib/db').db;
type ComputeSettlementPreview = typeof import('@/lib/plutus/settlement-processing').computeSettlementPreview;

type CliOptions = {
  marketplace: 'amazon.com' | 'amazon.co.uk';
  since: string;
  invoiceId: string | null;
  json: boolean;
};

type JournalLineKey = `${string}::${'Debit' | 'Credit'}`;

type InventoryAuditResult = {
  marketplace: string;
  invoiceId: string;
  settlementProcessingId: string;
  createdAt: string;

  processingHash: { stored: string; computed: string; matches: boolean };
  auditUpload: { id: string; filename: string; uploadedAt: string } | null;

  blocks: Array<{ code: string; message: string; details?: Record<string, string | number> }>;
  inventoryBlockSummary: {
    missingCostBasisCount: number;
    negativeInventoryCount: number;
    billsErrorCount: number;
  };

  cogsJe: {
    id: string;
    status: 'noop' | 'missing' | 'mismatch' | 'ok';
    previewLineCount: number;
    qboLineCount: number;
    mismatchedAccounts: Array<{ accountId: string; postingType: 'Debit' | 'Credit'; expectedCents: number; actualCents: number }>;
  };
};

function printUsage(): void {
  console.log('Usage: pnpm -s exec tsx scripts/inventory-audit.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --marketplace <amazon.com|amazon.co.uk>  (default: amazon.com)');
  console.log('  --since <YYYY-MM-DD>                    (default: 2024-01-01)');
  console.log('  --invoice-id <INVOICE_ID>               (optional)');
  console.log('  --json                                  (optional)');
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
  let marketplace: CliOptions['marketplace'] = 'amazon.com';
  let since = '2024-01-01';
  let invoiceId: string | null = null;
  let json = false;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--marketplace') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --marketplace');
      const value = next.trim();
      if (value !== 'amazon.com' && value !== 'amazon.co.uk') {
        throw new Error(`--marketplace must be amazon.com or amazon.co.uk (got "${value}")`);
      }
      marketplace = value;
      i += 2;
      continue;
    }

    if (arg === '--since') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --since');
      since = requireIsoDay(next, '--since');
      i += 2;
      continue;
    }

    if (arg === '--invoice-id') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --invoice-id');
      invoiceId = next.trim();
      i += 2;
      continue;
    }

    if (arg === '--json') {
      json = true;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { marketplace, since, invoiceId, json };
}

async function loadAuditRowsForProcessing(input: {
  db: DbClient;
  invoiceId: string;
  marketplace: string;
  sourceFilename: string;
  processedAt: Date;
}): Promise<{ upload: { id: string; filename: string; uploadedAt: Date } | null; rows: SettlementAuditRow[] }> {
  const uploads = await input.db.auditDataUpload.findMany({
    where: { filename: input.sourceFilename },
    orderBy: { uploadedAt: 'desc' },
    select: { id: true, filename: true, uploadedAt: true },
  });

  let chosen: { id: string; filename: string; uploadedAt: Date } | null = null;
  for (const upload of uploads) {
    if (upload.uploadedAt <= input.processedAt) {
      chosen = upload;
      break;
    }
  }

  if (chosen === null && uploads.length > 0) {
    chosen = uploads[0]!;
  }

  if (chosen === null) {
    return { upload: null, rows: [] };
  }

  const storedRows = await input.db.auditDataRow.findMany({
    where: {
      uploadId: chosen.id,
      invoiceId: input.invoiceId,
    },
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

  return { upload: chosen, rows: scoped };
}

function centsFromAmount(amount: number): number {
  return Math.round(amount * 100);
}

function summarizeLinesByAccount(lines: Array<{ accountId: string; postingType: 'Debit' | 'Credit'; amountCents: number }>): Map<JournalLineKey, number> {
  const totals = new Map<JournalLineKey, number>();
  for (const line of lines) {
    const key = `${line.accountId}::${line.postingType}` as const;
    const current = totals.get(key);
    totals.set(key, (current === undefined ? 0 : current) + line.amountCents);
  }
  return totals;
}

function extractJeTotalsByAccount(je: QboJournalEntry): Map<JournalLineKey, number> {
  const totals = new Map<JournalLineKey, number>();

  for (const line of je.Line) {
    const detail = line.JournalEntryLineDetail;
    const accountId = detail?.AccountRef?.value;
    const postingType = detail?.PostingType;
    const amount = line.Amount;

    if (typeof accountId !== 'string' || accountId.trim() === '') continue;
    if (postingType !== 'Debit' && postingType !== 'Credit') continue;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) continue;

    const key = `${accountId}::${postingType}` as const;
    const current = totals.get(key);
    totals.set(key, (current === undefined ? 0 : current) + centsFromAmount(amount));
  }

  return totals;
}

function compareTotals(input: { expected: Map<JournalLineKey, number>; actual: Map<JournalLineKey, number> }): Array<{ key: JournalLineKey; expectedCents: number; actualCents: number }> {
  const keys = new Set<JournalLineKey>();
  for (const key of input.expected.keys()) keys.add(key);
  for (const key of input.actual.keys()) keys.add(key);

  const mismatches: Array<{ key: JournalLineKey; expectedCents: number; actualCents: number }> = [];

  for (const key of Array.from(keys).sort()) {
    const expected = input.expected.get(key) ?? 0;
    const actual = input.actual.get(key) ?? 0;
    if (expected !== actual) {
      mismatches.push({ key, expectedCents: expected, actualCents: actual });
    }
  }

  return mismatches;
}

async function auditProcessingRow(input: {
  db: DbClient;
  computeSettlementPreview: ComputeSettlementPreview;
  processing: {
    id: string;
    marketplace: string;
    invoiceId: string;
    processingHash: string;
    sourceFilename: string;
    createdAt: Date;
    qboSettlementJournalEntryId: string;
    qboCogsJournalEntryId: string;
  };
  connection: QboConnection;
}): Promise<{ result: InventoryAuditResult; updatedConnection?: QboConnection }> {
  const { upload, rows } = await loadAuditRowsForProcessing({
    db: input.db,
    invoiceId: input.processing.invoiceId,
    marketplace: input.processing.marketplace,
    sourceFilename: input.processing.sourceFilename,
    processedAt: input.processing.createdAt,
  });

  if (rows.length === 0) {
    throw new Error(`No audit rows found for invoice ${input.processing.invoiceId} (file ${input.processing.sourceFilename})`);
  }

  const computed = await input.computeSettlementPreview({
    connection: input.connection,
    settlementJournalEntryId: input.processing.qboSettlementJournalEntryId,
    sourceFilename: input.processing.sourceFilename,
    invoiceId: input.processing.invoiceId,
    auditRows: rows,
  });

  const missingCostBasisCount = computed.preview.blocks.filter((b) => b.code === 'MISSING_COST_BASIS').length;
  const negativeInventoryCount = computed.preview.blocks.filter((b) => b.code === 'NEGATIVE_INVENTORY').length;
  const billsErrorCount = computed.preview.blocks.filter((b) => b.code === 'BILLS_FETCH_ERROR' || b.code === 'BILLS_PARSE_ERROR').length;

  const previewTotals = summarizeLinesByAccount(
    computed.preview.cogsJournalEntry.lines.map((line) => ({
      accountId: line.accountId,
      postingType: line.postingType,
      amountCents: line.amountCents,
    })),
  );

  let cogsStatus: InventoryAuditResult['cogsJe']['status'] = 'ok';
  let qboLineCount = 0;
  let mismatchedAccounts: InventoryAuditResult['cogsJe']['mismatchedAccounts'] = [];

  if (isNoopJournalEntryId(input.processing.qboCogsJournalEntryId)) {
    cogsStatus = computed.preview.cogsJournalEntry.lines.length === 0 ? 'noop' : 'mismatch';
  } else if (!isQboJournalEntryId(input.processing.qboCogsJournalEntryId)) {
    cogsStatus = 'missing';
  } else {
    try {
      const jeResult = await fetchJournalEntryById(
        computed.updatedConnection ? computed.updatedConnection : input.connection,
        input.processing.qboCogsJournalEntryId,
      );
      const actualTotals = extractJeTotalsByAccount(jeResult.journalEntry);
      qboLineCount = jeResult.journalEntry.Line.length;

      const mismatches = compareTotals({ expected: previewTotals, actual: actualTotals });
      if (mismatches.length > 0) {
        cogsStatus = 'mismatch';
        mismatchedAccounts = mismatches.map((m) => {
          const [accountId, postingTypeRaw] = m.key.split('::');
          const postingType = postingTypeRaw === 'Debit' ? 'Debit' : 'Credit';
          return {
            accountId: accountId ?? '',
            postingType,
            expectedCents: m.expectedCents,
            actualCents: m.actualCents,
          };
        });
      } else {
        cogsStatus = 'ok';
      }

      if (jeResult.updatedConnection) {
        return {
          result: buildResult(),
          updatedConnection: jeResult.updatedConnection,
        };
      }
    } catch (error) {
      cogsStatus = 'missing';
      qboLineCount = 0;
      mismatchedAccounts = [];
    }
  }

  function buildResult(): InventoryAuditResult {
    return {
      marketplace: input.processing.marketplace,
      invoiceId: input.processing.invoiceId,
      settlementProcessingId: input.processing.id,
      createdAt: input.processing.createdAt.toISOString(),
      processingHash: {
        stored: input.processing.processingHash,
        computed: computed.preview.processingHash,
        matches: input.processing.processingHash === computed.preview.processingHash,
      },
      auditUpload: upload
        ? {
            id: upload.id,
            filename: upload.filename,
            uploadedAt: upload.uploadedAt.toISOString(),
          }
        : null,
      blocks: computed.preview.blocks,
      inventoryBlockSummary: {
        missingCostBasisCount,
        negativeInventoryCount,
        billsErrorCount,
      },
      cogsJe: {
        id: input.processing.qboCogsJournalEntryId,
        status: cogsStatus,
        previewLineCount: computed.preview.cogsJournalEntry.lines.length,
        qboLineCount,
        mismatchedAccounts,
      },
    };
  }

  return {
    result: buildResult(),
    updatedConnection: computed.updatedConnection,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await loadPlutusEnv();

  const { db } = await import('@/lib/db');
  const { computeSettlementPreview } = await import('@/lib/plutus/settlement-processing');

  let connection = await getQboConnection();
  if (!connection) {
    throw new Error('Missing QBO connection. Connect to QBO in Plutus first.');
  }

  const sinceDate = new Date(`${options.since}T00:00:00.000Z`);

  const processings = await db.settlementProcessing.findMany({
    where: {
      marketplace: options.marketplace,
      createdAt: { gte: sinceDate },
      ...(options.invoiceId ? { invoiceId: options.invoiceId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      marketplace: true,
      invoiceId: true,
      processingHash: true,
      sourceFilename: true,
      createdAt: true,
      qboSettlementJournalEntryId: true,
      qboCogsJournalEntryId: true,
    },
  });

  if (processings.length === 0) {
    console.log(JSON.stringify({ ok: true, message: 'No settlementProcessing rows found for filters', filters: options }, null, 2));
    return;
  }

  const results: InventoryAuditResult[] = [];
  for (const processing of processings) {
    try {
      const audited = await auditProcessingRow({ db, computeSettlementPreview, processing, connection });
      results.push(audited.result);

      if (audited.updatedConnection) {
        connection = audited.updatedConnection;
        await saveServerQboConnection(audited.updatedConnection);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        marketplace: processing.marketplace,
        invoiceId: processing.invoiceId,
        settlementProcessingId: processing.id,
        createdAt: processing.createdAt.toISOString(),
        processingHash: {
          stored: processing.processingHash,
          computed: '',
          matches: false,
        },
        auditUpload: null,
        blocks: [{ code: 'AUDIT_ERROR', message: 'Failed to compute settlement preview', details: { error: message } }],
        inventoryBlockSummary: {
          missingCostBasisCount: 0,
          negativeInventoryCount: 0,
          billsErrorCount: 0,
        },
        cogsJe: {
          id: processing.qboCogsJournalEntryId,
          status: isNoopJournalEntryId(processing.qboCogsJournalEntryId) ? 'noop' : 'missing',
          previewLineCount: 0,
          qboLineCount: 0,
          mismatchedAccounts: [],
        },
      });
    }
  }

  if (options.json) {
    console.log(JSON.stringify({ ok: true, count: results.length, results }, null, 2));
    return;
  }

  const issueRows = results.filter((r) => {
    return (
      r.inventoryBlockSummary.billsErrorCount > 0 ||
      r.inventoryBlockSummary.negativeInventoryCount > 0 ||
      r.inventoryBlockSummary.missingCostBasisCount > 0 ||
      (r.cogsJe.status !== 'ok' && r.cogsJe.status !== 'noop') ||
      !r.processingHash.matches
    );
  });

  console.log(
    JSON.stringify(
      {
        ok: issueRows.length === 0,
        marketplace: options.marketplace,
        since: options.since,
        totalProcessed: results.length,
        withIssues: issueRows.length,
      },
      null,
      2,
    ),
  );

  if (issueRows.length > 0) {
    console.log('');
    console.log('Invoices with issues:');
    for (const row of issueRows) {
      console.log(
        JSON.stringify(
          {
            invoiceId: row.invoiceId,
            createdAt: row.createdAt,
            missingCostBasis: row.inventoryBlockSummary.missingCostBasisCount,
            negativeInventory: row.inventoryBlockSummary.negativeInventoryCount,
            billsErrors: row.inventoryBlockSummary.billsErrorCount,
            cogsJeStatus: row.cogsJe.status,
            processingHashMatches: row.processingHash.matches,
          },
          null,
          2,
        ),
      );
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
