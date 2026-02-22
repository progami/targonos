import { db } from '@/lib/db';
import { fromCents } from '@/lib/inventory/money';
import { isQboJournalEntryId } from '@/lib/plutus/journal-entry-id';
import type { SettlementAuditRow } from '@/lib/plutus/settlement-audit';
import { processSettlement } from '@/lib/plutus/settlement-processing';
import { computeProcessingHash } from '@/lib/plutus/settlement-validation';
import { deleteJournalEntry, QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

type CliOptions = {
  marketplace: 'amazon.com' | 'amazon.co.uk';
  apply: boolean;
  max: number | null;
};

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

async function loadAuditRowsFromDb(input: {
  invoiceId: string;
  marketplace: CliOptions['marketplace'];
}): Promise<{ rows: SettlementAuditRow[]; sourceFilename: string }> {
  const market = inferMarketCode(input.marketplace);
  const dbRows = await db.auditDataRow.findMany({
    where: {
      invoiceId: input.invoiceId,
      market: { equals: market, mode: 'insensitive' },
    },
    include: { upload: { select: { filename: true } } },
  });

  if (dbRows.length === 0) {
    throw new Error(`No stored audit rows found for invoice ${input.invoiceId} (${input.marketplace})`);
  }

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

  const sourceFilename = dbRows[0]!.upload.filename;
  return { rows, sourceFilename };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

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
    const audit = await loadAuditRowsFromDb({ invoiceId: processing.invoiceId, marketplace: options.marketplace });
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

  const toFix = options.max === null ? conflicts : conflicts.slice(0, options.max);
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

    const audit = await loadAuditRowsFromDb({ invoiceId: existing.invoiceId, marketplace: options.marketplace });
    const actualHash = computeProcessingHash(audit.rows);
    if (actualHash === existing.processingHash) {
      continue;
    }

    if (isQboJournalEntryId(existing.qboCogsJournalEntryId)) {
      const deleted = await deleteJournalEntry(activeConnection, existing.qboCogsJournalEntryId);
      if (deleted.updatedConnection) activeConnection = deleted.updatedConnection;
    }
    if (isQboJournalEntryId(existing.qboPnlReclassJournalEntryId)) {
      const deleted = await deleteJournalEntry(activeConnection, existing.qboPnlReclassJournalEntryId);
      if (deleted.updatedConnection) activeConnection = deleted.updatedConnection;
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
      settlementJournalEntryId: existing.qboSettlementJournalEntryId,
      auditRows: audit.rows,
      sourceFilename: audit.sourceFilename,
      invoiceId: existing.invoiceId,
    });
    if (processed.updatedConnection) {
      activeConnection = processed.updatedConnection;
    }
    if (!processed.result.ok) {
      throw new Error(`Reprocess blocked for ${existing.invoiceId}: ${JSON.stringify(processed.result.preview.blocks)}`);
    }
  }

  await saveServerQboConnection(activeConnection);

  console.log(JSON.stringify({ options, totals: { processed: processings.length, conflicts: conflicts.length, fixed: toFix.length } }, null, 2));
}

main().catch((error) => {
  if (error instanceof QboAuthError) {
    console.error(`QBO auth error: ${error.message}`);
    process.exit(1);
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

