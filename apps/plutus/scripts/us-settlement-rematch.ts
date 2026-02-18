import { promises as fs } from 'node:fs';
import path from 'node:path';

import { db } from '@/lib/db';
import type { LmbAuditRow } from '@/lib/lmb/audit-csv';
import { parseLmbSettlementDocNumber } from '@/lib/lmb/settlements';
import {
  normalizeAuditMarketToMarketplaceId,
  selectAuditInvoiceForSettlement,
  type AuditInvoiceSummary,
  type MarketplaceId,
} from '@/lib/plutus/audit-invoice-matching';
import { computeSettlementPreview, processSettlement } from '@/lib/plutus/settlement-processing';
import { isBlockingProcessingBlock } from '@/lib/plutus/settlement-types';
import { fetchJournalEntries } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

type CliOptions = {
  post: boolean;
  startDate: string;
  targetSettlementIds: string[] | null;
};

type AuditInvoiceRowSummary = {
  invoiceId: string;
  marketplaceId: string | null;
  rowCount: bigint;
  minDate: string;
  maxDate: string;
  markets: string[];
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
    if (process.env[parsed.key] !== undefined) continue;
    process.env[parsed.key] = parsed.value;
  }
}

async function loadPlutusEnv(): Promise<void> {
  const cwd = process.cwd();
  await loadEnvFile(path.join(cwd, '.env.local'));
  await loadEnvFile(path.join(cwd, '.env'));
}

function parseArgs(argv: string[]): CliOptions {
  let post = false;
  let startDate = '2025-12-01';
  let targetSettlementIds: string[] | null = ['608', '609'];
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--post') {
      post = true;
      i += 1;
      continue;
    }

    if (arg === '--start-date') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --start-date');
      startDate = next;
      i += 2;
      continue;
    }

    if (arg === '--only') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --only');
      const ids = next
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x !== '');
      targetSettlementIds = ids;
      i += 2;
      continue;
    }

    if (arg === '--all-pending') {
      targetSettlementIds = null;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { post, startDate, targetSettlementIds };
}

async function fetchAuditInvoiceSummaries(): Promise<AuditInvoiceSummary[]> {
  const rows = await db.$queryRaw<AuditInvoiceRowSummary[]>`
    SELECT "invoiceId",
           CASE
             WHEN LOWER("market") = 'us' OR LOWER("market") LIKE '%amazon.com%' THEN 'amazon.com'
             WHEN LOWER("market") = 'uk' OR LOWER("market") LIKE '%amazon.co.uk%' THEN 'amazon.co.uk'
             ELSE NULL
           END AS "marketplaceId",
           COUNT(*)::bigint AS "rowCount",
           MIN("date") AS "minDate",
           MAX("date") AS "maxDate",
           ARRAY_AGG(DISTINCT "market") AS "markets"
    FROM plutus."AuditDataRow"
    GROUP BY "invoiceId", "marketplaceId"
    ORDER BY "invoiceId", "marketplaceId"
  `;

  return rows.flatMap((r) => {
    if (r.marketplaceId !== 'amazon.com' && r.marketplaceId !== 'amazon.co.uk') {
      return [];
    }

    return [{
      invoiceId: r.invoiceId,
      marketplace: r.marketplaceId,
      rowCount: Number(r.rowCount),
      minDate: r.minDate,
      maxDate: r.maxDate,
      markets: r.markets,
    }];
  });
}

function invoiceKey(input: { marketplace: MarketplaceId; invoiceId: string }): string {
  return `${input.marketplace}:${input.invoiceId}`;
}

async function main(): Promise<void> {
  await loadPlutusEnv();
  const options = parseArgs(process.argv.slice(2));

  const connection = await getQboConnection();
  if (!connection) throw new Error('Not connected to QBO');

  let activeConnection = connection;
  const pageSize = 100;
  let startPosition = 1;
  let settlementJournals: Array<{ Id: string; DocNumber?: string; TxnDate: string }> = [];

  while (true) {
    const page = await fetchJournalEntries(activeConnection, {
      docNumberContains: 'LMB-US-',
      startDate: options.startDate,
      maxResults: pageSize,
      startPosition,
    });
    if (page.updatedConnection) {
      activeConnection = page.updatedConnection;
    }

    settlementJournals = settlementJournals.concat(page.journalEntries);
    if (settlementJournals.length >= page.totalCount) break;
    if (page.journalEntries.length === 0) break;
    startPosition += page.journalEntries.length;
  }

  if (activeConnection !== connection) {
    await saveServerQboConnection(activeConnection);
  }

  const processedSettlements = await db.settlementProcessing.findMany({
    select: {
      qboSettlementJournalEntryId: true,
      marketplace: true,
      invoiceId: true,
    },
  });

  const processedSettlementIds = new Set(processedSettlements.map((x) => x.qboSettlementJournalEntryId));
  const processedInvoiceKeys = new Set(
    processedSettlements.map((x) => invoiceKey({ marketplace: x.marketplace as MarketplaceId, invoiceId: x.invoiceId })),
  );

  const invoices = await fetchAuditInvoiceSummaries();

  const candidates = settlementJournals
    .filter((entry) => entry.DocNumber && entry.DocNumber.includes('LMB-US-'))
    .filter((entry) => !processedSettlementIds.has(entry.Id))
    .sort((a, b) => b.TxnDate.localeCompare(a.TxnDate));

  const filteredCandidates = options.targetSettlementIds
    ? candidates.filter((entry) => options.targetSettlementIds!.includes(entry.Id))
    : candidates;

  const statusRows: Array<Record<string, unknown>> = [];
  const readyToPost: Array<{
    settlementId: string;
    docNumber: string;
    invoiceId: string;
    marketplace: MarketplaceId;
  }> = [];
  const readyInputs = new Map<
    string,
    {
      invoiceId: string;
      sourceFilename: string;
      scopedRows: LmbAuditRow[];
    }
  >();

  for (const settlement of filteredCandidates) {
    if (!settlement.DocNumber) {
      statusRows.push({
        settlementId: settlement.Id,
        docNumber: null,
        txnDate: settlement.TxnDate,
        state: 'skip',
        reason: 'Missing DocNumber',
      });
      continue;
    }

    const meta = parseLmbSettlementDocNumber(settlement.DocNumber);
    const match = selectAuditInvoiceForSettlement({
      settlementMarketplace: meta.marketplace.id,
      settlementPeriodStart: meta.periodStart,
      settlementPeriodEnd: meta.periodEnd,
      invoices,
    });

    if (match.kind !== 'match') {
      statusRows.push({
        settlementId: settlement.Id,
        docNumber: settlement.DocNumber,
        txnDate: settlement.TxnDate,
        state: 'wait',
        reason: match.kind,
      });
      continue;
    }

    const key = invoiceKey({ marketplace: meta.marketplace.id, invoiceId: match.invoiceId });
    if (processedInvoiceKeys.has(key)) {
      statusRows.push({
        settlementId: settlement.Id,
        docNumber: settlement.DocNumber,
        txnDate: settlement.TxnDate,
        state: 'wait',
        reason: 'invoice_already_processed',
        invoiceId: match.invoiceId,
        matchType: match.matchType,
      });
      continue;
    }

    if (match.matchType !== 'contained') {
      statusRows.push({
        settlementId: settlement.Id,
        docNumber: settlement.DocNumber,
        txnDate: settlement.TxnDate,
        state: 'wait',
        reason: 'overlap_match',
        invoiceId: match.invoiceId,
        matchType: match.matchType,
      });
      continue;
    }

    const rows = await db.auditDataRow.findMany({
      where: { invoiceId: match.invoiceId },
      include: { upload: { select: { filename: true } } },
    });

    const scopedRows: LmbAuditRow[] = rows
      .filter((r) => normalizeAuditMarketToMarketplaceId(r.market) === meta.marketplace.id)
      .map((r) => ({
        invoice: r.invoiceId,
        market: r.market,
        date: r.date,
        orderId: r.orderId,
        sku: r.sku,
        quantity: r.quantity,
        description: r.description,
        net: r.net / 100,
      }));

    if (scopedRows.length === 0) {
      statusRows.push({
        settlementId: settlement.Id,
        docNumber: settlement.DocNumber,
        txnDate: settlement.TxnDate,
        state: 'wait',
        reason: 'no_scoped_audit_rows',
        invoiceId: match.invoiceId,
        matchType: match.matchType,
      });
      continue;
    }

    const sourceFilename = rows[0]!.upload.filename;
    const previewResult = await computeSettlementPreview({
      connection: activeConnection,
      settlementJournalEntryId: settlement.Id,
      auditRows: scopedRows,
      sourceFilename,
      invoiceId: match.invoiceId,
    });

    if (previewResult.updatedConnection) {
      activeConnection = previewResult.updatedConnection;
      await saveServerQboConnection(activeConnection);
    }

    const hasBlockingBlocks = previewResult.preview.blocks.some((block) => isBlockingProcessingBlock(block));
    const hasEmptyJournals =
      previewResult.preview.cogsJournalEntry.lines.length === 0 || previewResult.preview.pnlJournalEntry.lines.length === 0;

    if (hasBlockingBlocks || hasEmptyJournals) {
      statusRows.push({
        settlementId: settlement.Id,
        docNumber: settlement.DocNumber,
        txnDate: settlement.TxnDate,
        state: 'wait',
        reason: hasBlockingBlocks ? 'preview_blocking_blocks' : 'preview_empty_journal_lines',
        invoiceId: match.invoiceId,
        matchType: match.matchType,
        cogsLineCount: previewResult.preview.cogsJournalEntry.lines.length,
        pnlLineCount: previewResult.preview.pnlJournalEntry.lines.length,
        blocks: previewResult.preview.blocks,
      });
      continue;
    }

    statusRows.push({
      settlementId: settlement.Id,
      docNumber: settlement.DocNumber,
      txnDate: settlement.TxnDate,
      state: 'ready',
      reason: 'contained_match',
      invoiceId: match.invoiceId,
      matchType: match.matchType,
      cogsLineCount: previewResult.preview.cogsJournalEntry.lines.length,
      pnlLineCount: previewResult.preview.pnlJournalEntry.lines.length,
    });

    readyInputs.set(settlement.Id, {
      invoiceId: match.invoiceId,
      sourceFilename,
      scopedRows,
    });

    readyToPost.push({
      settlementId: settlement.Id,
      docNumber: settlement.DocNumber,
      invoiceId: match.invoiceId,
      marketplace: meta.marketplace.id,
    });
  }

  const posted: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];

  if (options.post) {
    for (const item of readyToPost) {
      const input = readyInputs.get(item.settlementId);
      if (!input) {
        failed.push({
          settlementId: item.settlementId,
          docNumber: item.docNumber,
          invoiceId: item.invoiceId,
          error: 'Missing prepared input',
        });
        continue;
      }

      try {
        const result = await processSettlement({
          connection: activeConnection,
          settlementJournalEntryId: item.settlementId,
          auditRows: input.scopedRows,
          sourceFilename: input.sourceFilename,
          invoiceId: item.invoiceId,
        });

        if (result.updatedConnection) {
          activeConnection = result.updatedConnection;
          await saveServerQboConnection(activeConnection);
        }

        if (result.result.ok) {
          posted.push({
            settlementId: item.settlementId,
            docNumber: item.docNumber,
            invoiceId: item.invoiceId,
            cogsJournalEntryId: result.result.posted.cogsJournalEntryId,
            pnlJournalEntryId: result.result.posted.pnlJournalEntryId,
          });
          continue;
        }

        failed.push({
          settlementId: item.settlementId,
          docNumber: item.docNumber,
          invoiceId: item.invoiceId,
          error: 'Blocked during processing',
          blocks: result.result.preview.blocks,
        });
      } catch (error) {
        failed.push({
          settlementId: item.settlementId,
          docNumber: item.docNumber,
          invoiceId: item.invoiceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        options,
        statusRows,
        readyCount: readyToPost.length,
        posted,
        failed,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
