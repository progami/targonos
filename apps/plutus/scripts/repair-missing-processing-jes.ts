import { promises as fs } from 'node:fs';
import path from 'node:path';

import { isBlockingProcessingBlock } from '@/lib/plutus/settlement-types';
import type { SettlementAuditRow } from '@/lib/plutus/settlement-audit';
import { normalizeAuditMarketToMarketplaceId } from '@/lib/plutus/audit-invoice-matching';
import { fromCents } from '@/lib/inventory/money';
import { buildNoopJournalEntryId, isQboJournalEntryId } from '@/lib/plutus/journal-entry-id';

type DbClient = typeof import('@/lib/db').db;
type ComputeSettlementPreview = typeof import('@/lib/plutus/settlement-processing').computeSettlementPreview;

type CliOptions = {
  marketplace: 'amazon.com' | 'amazon.co.uk';
  since: string;
  apply: boolean;
  max: number | null;
};

function printUsage(): void {
  console.log('Usage: pnpm -s exec tsx scripts/repair-missing-processing-jes.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --marketplace <amazon.com|amazon.co.uk>  (default: amazon.com)');
  console.log('  --since <YYYY-MM-DD>                    (default: 2024-01-01)');
  console.log('  --apply                                 (actually post/update; default: dry-run)');
  console.log('  --max <N>                               (limit invoices)');
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
  let apply = false;
  let max: number | null = null;

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

  return { marketplace, since, apply, max };
}

function isQboNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('Object Not Found') && error.message.includes('"code":"610"');
}

function isIdempotencyBlock(block: { code: string }): boolean {
  return block.code === 'ALREADY_PROCESSED' || block.code === 'ORDER_ALREADY_PROCESSED';
}

function settlementCurrencyCodeForMarketplace(marketplace: string): 'USD' | 'GBP' {
  if (marketplace === 'amazon.com') return 'USD';
  if (marketplace === 'amazon.co.uk') return 'GBP';
  throw new Error(`Unsupported marketplace for settlement currency: ${marketplace}`);
}

async function chooseAuditUploadForProcessing(input: {
  db: DbClient;
  sourceFilename: string;
  processedAt: Date;
}): Promise<{ uploadId: string; sourceFilename: string }> {
  const uploads = await input.db.auditDataUpload.findMany({
    where: { filename: input.sourceFilename },
    orderBy: { uploadedAt: 'desc' },
    select: { id: true, filename: true, uploadedAt: true },
  });

  const chosen = uploads.find((u) => u.uploadedAt <= input.processedAt);
  if (!chosen) {
    throw new Error(`Missing audit upload for filename ${input.sourceFilename} at or before ${input.processedAt.toISOString()}`);
  }

  return { uploadId: chosen.id, sourceFilename: chosen.filename };
}

async function loadAuditRowsForProcessing(input: {
  db: DbClient;
  invoiceId: string;
  marketplace: CliOptions['marketplace'];
  sourceFilename: string;
  processedAt: Date;
}): Promise<{ rows: SettlementAuditRow[]; sourceFilename: string }> {
  const market = input.marketplace === 'amazon.com' ? 'us' : 'uk';
  const chosen = await chooseAuditUploadForProcessing({
    db: input.db,
    sourceFilename: input.sourceFilename,
    processedAt: input.processedAt,
  });

  const storedRows = await input.db.auditDataRow.findMany({
    where: {
      uploadId: chosen.uploadId,
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
    if (row.market.trim().toLowerCase() !== market) continue;

    scoped.push({
      invoiceId: row.invoiceId,
      market: row.market,
      date: row.date,
      orderId: row.orderId,
      sku: row.sku,
      quantity: row.quantity,
      description: row.description,
      net: fromCents(row.net),
    });
  }

  if (scoped.length === 0) {
    throw new Error(`No audit rows found for invoice ${input.invoiceId} in upload ${chosen.uploadId}`);
  }

  return { rows: scoped, sourceFilename: chosen.sourceFilename };
}

function buildProcessingDocNumber(kind: 'C' | 'P', invoiceId: string): string {
  const base = `${kind}${invoiceId}`;
  if (base.length <= 21) return base;
  return `${kind}${invoiceId.slice(-20)}`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await loadPlutusEnv();

  const { db } = await import('@/lib/db');
  const { computeSettlementPreview } = (await import('@/lib/plutus/settlement-processing')) as { computeSettlementPreview: ComputeSettlementPreview };
  const { getQboConnection, saveServerQboConnection } = await import('@/lib/qbo/connection-store');
  const { createJournalEntry, fetchJournalEntries, fetchJournalEntryById } = await import('@/lib/qbo/api');

  let connection = await getQboConnection();
  if (!connection) {
    throw new Error('Missing QBO connection. Connect to QBO in Plutus first.');
  }

  const sinceDate = new Date(`${options.since}T00:00:00.000Z`);
  const all = await db.settlementProcessing.findMany({
    where: {
      marketplace: options.marketplace,
      createdAt: { gte: sinceDate },
    },
    orderBy: { uploadedAt: 'asc' },
    select: {
      id: true,
      marketplace: true,
      invoiceId: true,
      sourceFilename: true,
      uploadedAt: true,
      qboSettlementJournalEntryId: true,
      qboCogsJournalEntryId: true,
      qboPnlReclassJournalEntryId: true,
      _count: { select: { orderSales: true, orderReturns: true } },
    },
  });

  const processings = options.max === null ? all : all.slice(0, options.max);

  const summary = {
    marketplace: options.marketplace,
    since: options.since,
    apply: options.apply,
    total: processings.length,
    cogs: { ok: 0, noop: 0, updatedId: 0, created: 0, missing: 0, blocked: 0 },
    pnl: { ok: 0, noop: 0, updatedId: 0, created: 0, missing: 0, blocked: 0 },
  };

  for (const processing of processings) {
    const audit = await loadAuditRowsForProcessing({
      db,
      invoiceId: processing.invoiceId,
      marketplace: options.marketplace,
      sourceFilename: processing.sourceFilename,
      processedAt: processing.uploadedAt,
    });

    const computed = await computeSettlementPreview({
      connection,
      settlementJournalEntryId: processing.qboSettlementJournalEntryId,
      auditRows: audit.rows,
      sourceFilename: audit.sourceFilename,
      invoiceId: processing.invoiceId,
    });
    if (computed.updatedConnection) {
      connection = computed.updatedConnection;
      await saveServerQboConnection(computed.updatedConnection);
    }

    const effectiveBlocks = computed.preview.blocks.filter((b) => !isIdempotencyBlock(b));
    const blockingBlocks = effectiveBlocks.filter((b) => isBlockingProcessingBlock(b));
    if (blockingBlocks.length > 0) {
      summary.cogs.blocked += 1;
      summary.pnl.blocked += 1;
      console.warn(
        JSON.stringify(
          {
            invoiceId: processing.invoiceId,
            reason: 'Preview blocked',
            blockingCodes: blockingBlocks.map((b) => b.code),
          },
          null,
          2,
        ),
      );
      continue;
    }

    const settlementCurrencyCode = settlementCurrencyCodeForMarketplace(computed.preview.marketplace);

    // ---------------------------------------------------------------------
    // COGS JE repair
    // ---------------------------------------------------------------------
    const desiredCogsNoopId = buildNoopJournalEntryId('COGS', processing.invoiceId);
    const desiredCogsDocNumber = buildProcessingDocNumber('C', processing.invoiceId);

    if (computed.preview.cogsJournalEntry.lines.length === 0) {
      if (processing._count.orderSales > 0 || processing._count.orderReturns > 0) {
        throw new Error(`Unexpected empty COGS preview for invoice with unit movements: ${processing.invoiceId}`);
      }

      if (processing.qboCogsJournalEntryId !== desiredCogsNoopId) {
        if (options.apply) {
          await db.settlementProcessing.update({
            where: { id: processing.id },
            data: { qboCogsJournalEntryId: desiredCogsNoopId },
          });
          summary.cogs.updatedId += 1;
        } else {
          summary.cogs.updatedId += 1;
        }
      }
      summary.cogs.noop += 1;
    } else {
      let cogsExists = false;
      if (isQboJournalEntryId(processing.qboCogsJournalEntryId)) {
        try {
          await fetchJournalEntryById(connection, processing.qboCogsJournalEntryId);
          cogsExists = true;
        } catch (error) {
          if (!isQboNotFoundError(error)) throw error;
          cogsExists = false;
        }
      }

      if (cogsExists) {
        summary.cogs.ok += 1;
      } else {
        const search = await fetchJournalEntries(connection, {
          docNumberContains: processing.invoiceId,
          maxResults: 50,
          startPosition: 1,
        });
        if (search.updatedConnection) {
          connection = search.updatedConnection;
          await saveServerQboConnection(search.updatedConnection);
        }

        const exact = search.journalEntries.filter((je) => (je.DocNumber ? je.DocNumber.trim().toUpperCase() : '') === desiredCogsDocNumber.toUpperCase());
        exact.sort((a, b) => b.TxnDate.localeCompare(a.TxnDate));
        const existing = exact.find((je) => (je.PrivateNote ? je.PrivateNote : '').includes('Plutus')) ?? null;

        if (existing) {
          if (processing.qboCogsJournalEntryId !== existing.Id) {
            if (options.apply) {
              await db.settlementProcessing.update({
                where: { id: processing.id },
                data: { qboCogsJournalEntryId: existing.Id },
              });
            }
            summary.cogs.updatedId += 1;
          }
          summary.cogs.ok += 1;
        } else {
          if (!options.apply) {
            summary.cogs.created += 1;
          } else {
            const posted = await createJournalEntry(connection, {
              txnDate: computed.preview.cogsJournalEntry.txnDate,
              docNumber: computed.preview.cogsJournalEntry.docNumber,
              privateNote: computed.preview.cogsJournalEntry.privateNote,
              currencyCode: settlementCurrencyCode,
              lines: computed.preview.cogsJournalEntry.lines.map((line) => ({
                amount: fromCents(line.amountCents),
                postingType: line.postingType,
                accountId: line.accountId,
                description: line.description,
              })),
            });
            if (posted.updatedConnection) {
              connection = posted.updatedConnection;
              await saveServerQboConnection(posted.updatedConnection);
            }

            await db.settlementProcessing.update({
              where: { id: processing.id },
              data: { qboCogsJournalEntryId: posted.journalEntry.Id },
            });
            summary.cogs.created += 1;
          }
        }
      }
    }

    // ---------------------------------------------------------------------
    // P&L JE repair (non-inventory, but keeps processing consistent)
    // ---------------------------------------------------------------------
    const desiredPnlNoopId = buildNoopJournalEntryId('PNL', processing.invoiceId);
    const desiredPnlDocNumber = buildProcessingDocNumber('P', processing.invoiceId);

    if (computed.preview.pnlJournalEntry.lines.length === 0) {
      if (processing.qboPnlReclassJournalEntryId !== desiredPnlNoopId) {
        if (options.apply) {
          await db.settlementProcessing.update({
            where: { id: processing.id },
            data: { qboPnlReclassJournalEntryId: desiredPnlNoopId },
          });
        }
        summary.pnl.updatedId += 1;
      }
      summary.pnl.noop += 1;
    } else {
      let pnlExists = false;
      if (isQboJournalEntryId(processing.qboPnlReclassJournalEntryId)) {
        try {
          await fetchJournalEntryById(connection, processing.qboPnlReclassJournalEntryId);
          pnlExists = true;
        } catch (error) {
          if (!isQboNotFoundError(error)) throw error;
          pnlExists = false;
        }
      }

      if (pnlExists) {
        summary.pnl.ok += 1;
      } else {
        const search = await fetchJournalEntries(connection, {
          docNumberContains: processing.invoiceId,
          maxResults: 50,
          startPosition: 1,
        });
        if (search.updatedConnection) {
          connection = search.updatedConnection;
          await saveServerQboConnection(search.updatedConnection);
        }

        const exact = search.journalEntries.filter((je) => (je.DocNumber ? je.DocNumber.trim().toUpperCase() : '') === desiredPnlDocNumber.toUpperCase());
        exact.sort((a, b) => b.TxnDate.localeCompare(a.TxnDate));
        const existing = exact.find((je) => (je.PrivateNote ? je.PrivateNote : '').includes('Plutus')) ?? null;

        if (existing) {
          if (processing.qboPnlReclassJournalEntryId !== existing.Id) {
            if (options.apply) {
              await db.settlementProcessing.update({
                where: { id: processing.id },
                data: { qboPnlReclassJournalEntryId: existing.Id },
              });
            }
            summary.pnl.updatedId += 1;
          }
          summary.pnl.ok += 1;
        } else {
          if (!options.apply) {
            summary.pnl.created += 1;
          } else {
            const posted = await createJournalEntry(connection, {
              txnDate: computed.preview.pnlJournalEntry.txnDate,
              docNumber: computed.preview.pnlJournalEntry.docNumber,
              privateNote: computed.preview.pnlJournalEntry.privateNote,
              currencyCode: settlementCurrencyCode,
              lines: computed.preview.pnlJournalEntry.lines.map((line) => ({
                amount: fromCents(line.amountCents),
                postingType: line.postingType,
                accountId: line.accountId,
                description: line.description,
              })),
            });
            if (posted.updatedConnection) {
              connection = posted.updatedConnection;
              await saveServerQboConnection(posted.updatedConnection);
            }

            await db.settlementProcessing.update({
              where: { id: processing.id },
              data: { qboPnlReclassJournalEntryId: posted.journalEntry.Id },
            });
            summary.pnl.created += 1;
          }
        }
      }
    }
  }

  console.log(JSON.stringify({ ok: true, summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
