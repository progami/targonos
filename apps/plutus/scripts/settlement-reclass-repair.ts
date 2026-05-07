import { createHash } from 'node:crypto';

import { normalizeAuditMarketToMarketplaceId } from '@/lib/plutus/audit-invoice-matching';
import { HUMAN_APPROVAL_PHRASE } from '@/lib/plutus/human-approval';
import type { SettlementAuditRow } from '@/lib/plutus/settlement-audit';
import { isSettlementDocNumber, normalizeSettlementDocNumber } from '@/lib/plutus/settlement-doc-number';
import type { JournalEntryPreview } from '@/lib/plutus/settlement-types';
import type { QboAccount, QboConnection, QboJournalEntry } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { loadSharedPlutusEnv } from './shared-env';

type DbClient = typeof import('@/lib/db').db;
type ComputeSettlementPreview = typeof import('@/lib/plutus/settlement-processing').computeSettlementPreview;
type ProcessSettlement = typeof import('@/lib/plutus/settlement-processing').processSettlement;
type RollbackProcessedSettlement = typeof import('@/lib/plutus/settlement-rollback').rollbackProcessedSettlementByJournalEntryId;

type CliOptions = {
  apply: boolean;
  humanApproval: string | null;
  invoiceIds: string[];
  marketplace: string;
};

type SourceRows = {
  sourceFilename: string;
  auditRows: SettlementAuditRow[];
};

type SettlementFingerprint = {
  id: string;
  syncToken: string;
  txnDate: string;
  docNumber: string | null;
  privateNote: string | null;
  currency: string | null;
  exchangeRate: number | null;
  lineHash: string;
};

const BANK_ACCOUNT_TYPES = new Set(['Bank', 'Credit Card']);
const IGNORED_REPROCESS_BLOCKS = new Set(['ALREADY_PROCESSED']);

function parseArgs(argv: string[]): CliOptions {
  let apply = false;
  let humanApproval: string | null = null;
  let marketplace = '';
  const invoiceIds: string[] = [];
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === '--apply') {
      apply = true;
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

    if (arg === '--marketplace') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('Missing value for --marketplace');
      marketplace = next.trim();
      i += 2;
      continue;
    }

    if (arg === '--invoice-id') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('Missing value for --invoice-id');
      const ids = next
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value !== '');
      invoiceIds.push(...ids);
      i += 2;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (marketplace === '') {
    throw new Error('Missing --marketplace');
  }
  if (invoiceIds.length === 0) {
    throw new Error('Missing --invoice-id');
  }
  if (apply && humanApproval !== HUMAN_APPROVAL_PHRASE) {
    throw new Error(`Settlement reclass repair requires --human-approval "${HUMAN_APPROVAL_PHRASE}"`);
  }

  return { apply, humanApproval, invoiceIds: Array.from(new Set(invoiceIds)), marketplace };
}

function moneyLineHash(je: QboJournalEntry): string {
  const lines = je.Line.map((line) => ({
    amount: line.Amount,
    description: line.Description ?? '',
    postingType: line.JournalEntryLineDetail.PostingType,
    accountId: line.JournalEntryLineDetail.AccountRef.value,
    taxCodeId: line.JournalEntryLineDetail.TaxCodeRef?.value ?? '',
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  return createHash('sha256').update(JSON.stringify(lines)).digest('hex');
}

function fingerprintSettlementJe(je: QboJournalEntry): SettlementFingerprint {
  return {
    id: je.Id,
    syncToken: je.SyncToken,
    txnDate: je.TxnDate,
    docNumber: je.DocNumber ?? null,
    privateNote: je.PrivateNote ?? null,
    currency: je.CurrencyRef?.value ?? null,
    exchangeRate: je.ExchangeRate ?? null,
    lineHash: moneyLineHash(je),
  };
}

function assertSameFingerprint(before: SettlementFingerprint, after: SettlementFingerprint): void {
  const beforeJson = JSON.stringify(before);
  const afterJson = JSON.stringify(after);
  if (beforeJson !== afterJson) {
    throw new Error(`Source settlement JE changed during reclass repair: before=${beforeJson} after=${afterJson}`);
  }
}

function isPreferredSettlementCandidate(invoiceId: string, je: QboJournalEntry): boolean {
  const docNumber = je.DocNumber?.trim();
  if (docNumber === undefined) return false;
  if (!isSettlementDocNumber(docNumber)) return false;
  return normalizeSettlementDocNumber(docNumber) === normalizeSettlementDocNumber(invoiceId);
}

async function resolveSettlementJournalEntry(input: {
  connection: QboConnection;
  fetchJournalEntries: typeof import('@/lib/qbo/api').fetchJournalEntries;
  invoiceId: string;
}): Promise<{ journalEntry: QboJournalEntry; updatedConnection?: QboConnection }> {
  const result = await input.fetchJournalEntries(input.connection, {
    docNumberContains: input.invoiceId,
    maxResults: 20,
    startPosition: 1,
  });

  const candidates = result.journalEntries.filter((je) => isPreferredSettlementCandidate(input.invoiceId, je));
  if (candidates.length === 0) {
    throw new Error(`Missing source settlement JE for invoiceId=${input.invoiceId}`);
  }

  const exact = candidates.find((je) => je.DocNumber?.trim() === normalizeSettlementDocNumber(input.invoiceId));
  return {
    journalEntry: exact ?? candidates[0]!,
    updatedConnection: result.updatedConnection,
  };
}

async function loadSourceRows(input: {
  db: DbClient;
  invoiceId: string;
  marketplace: string;
}): Promise<SourceRows> {
  const rows = await input.db.auditDataRow.findMany({
    where: { invoiceId: input.invoiceId },
    include: { upload: { select: { id: true, filename: true, uploadedAt: true } } },
  });

  const groups = new Map<string, { filename: string; uploadedAt: Date; rows: SettlementAuditRow[] }>();
  for (const row of rows) {
    const marketplaceId = normalizeAuditMarketToMarketplaceId(row.market);
    if (marketplaceId !== input.marketplace) continue;

    const existing = groups.get(row.upload.id);
    const target =
      existing ??
      {
        filename: row.upload.filename,
        uploadedAt: row.upload.uploadedAt,
        rows: [],
      };
    target.rows.push({
      invoiceId: row.invoiceId,
      market: row.market,
      date: row.date,
      orderId: row.orderId,
      sku: row.sku,
      quantity: row.quantity,
      description: row.description,
      net: row.net / 100,
    });
    groups.set(row.upload.id, target);
  }

  const candidates = Array.from(groups.values())
    .filter((group) => group.rows.length > 0)
    .sort((left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime());

  if (candidates.length === 0) {
    throw new Error(`No source rows for invoiceId=${input.invoiceId} marketplace=${input.marketplace}`);
  }

  const selected = candidates[0]!;
  return { sourceFilename: selected.filename, auditRows: selected.rows };
}

function assertNoBankLines(input: {
  invoiceId: string;
  accountsById: Map<string, QboAccount>;
  journal: JournalEntryPreview;
}): void {
  for (const line of input.journal.lines) {
    const account = input.accountsById.get(line.accountId);
    if (account === undefined) {
      throw new Error(`Preview line references missing QBO account ${line.accountId} for invoiceId=${input.invoiceId}`);
    }
    if (BANK_ACCOUNT_TYPES.has(account.AccountType)) {
      throw new Error(`Preview line would touch bank-facing account ${account.Id} ${account.Name} for invoiceId=${input.invoiceId}`);
    }
  }
}

function effectiveBlocks(blocks: Array<{ code: string }>, alreadyProcessed: boolean): string[] {
  const result: string[] = [];
  for (const block of blocks) {
    if (alreadyProcessed && IGNORED_REPROCESS_BLOCKS.has(block.code)) continue;
    result.push(block.code);
  }
  return result;
}

async function main(): Promise<void> {
  loadSharedPlutusEnv();
  const options = parseArgs(process.argv.slice(2));

  const dbModule = await import('@/lib/db');
  const qboApi = await import('@/lib/qbo/api');
  const processingModule = await import('@/lib/plutus/settlement-processing');
  const rollbackModule = await import('@/lib/plutus/settlement-rollback');
  const db = dbModule.db;
  const computeSettlementPreview: ComputeSettlementPreview = processingModule.computeSettlementPreview;
  const processSettlement: ProcessSettlement = processingModule.processSettlement;
  const rollbackProcessedSettlementByJournalEntryId: RollbackProcessedSettlement =
    rollbackModule.rollbackProcessedSettlementByJournalEntryId;

  const connection = await getQboConnection();
  if (connection === null) throw new Error('Not connected to QBO');
  let activeConnection = connection;

  const accountsResult = await qboApi.fetchAccounts(activeConnection, { includeInactive: true });
  if (accountsResult.updatedConnection !== undefined) activeConnection = accountsResult.updatedConnection;
  const accountsById = new Map(accountsResult.accounts.map((account) => [account.Id, account]));

  const results: Array<Record<string, unknown>> = [];

  for (const invoiceId of options.invoiceIds) {
    const sourceRows = await loadSourceRows({ db, invoiceId, marketplace: options.marketplace });
    const resolved = await resolveSettlementJournalEntry({
      connection: activeConnection,
      fetchJournalEntries: qboApi.fetchJournalEntries,
      invoiceId,
    });
    if (resolved.updatedConnection !== undefined) activeConnection = resolved.updatedConnection;

    const sourceBefore = fingerprintSettlementJe(resolved.journalEntry);
    const existingProcessing = await db.settlementProcessing.findUnique({
      where: { qboSettlementJournalEntryId: resolved.journalEntry.Id },
      select: {
        id: true,
        qboCogsJournalEntryId: true,
        qboPnlReclassJournalEntryId: true,
      },
    });

    const previewResult = await computeSettlementPreview({
      connection: activeConnection,
      settlementJournalEntryId: resolved.journalEntry.Id,
      sourceFilename: sourceRows.sourceFilename,
      invoiceId,
      auditRows: sourceRows.auditRows,
    });
    if (previewResult.updatedConnection !== undefined) activeConnection = previewResult.updatedConnection;

    const alreadyProcessed = existingProcessing !== null;
    const blocks = effectiveBlocks(previewResult.preview.blocks, alreadyProcessed);
    assertNoBankLines({ invoiceId, accountsById, journal: previewResult.preview.cogsJournalEntry });
    assertNoBankLines({ invoiceId, accountsById, journal: previewResult.preview.pnlJournalEntry });

    if (blocks.length > 0) {
      results.push({
        invoiceId,
        settlementJournalEntryId: resolved.journalEntry.Id,
        ready: false,
        blocks,
      });
      continue;
    }

    if (!options.apply) {
      results.push({
        invoiceId,
        settlementJournalEntryId: resolved.journalEntry.Id,
        ready: true,
        existingProcessing:
          existingProcessing === null
            ? null
            : {
                id: existingProcessing.id,
                cogsJournalEntryId: existingProcessing.qboCogsJournalEntryId,
                pnlJournalEntryId: existingProcessing.qboPnlReclassJournalEntryId,
              },
        sourceSettlementFingerprint: sourceBefore,
        cogsLineCount: previewResult.preview.cogsJournalEntry.lines.length,
        pnlLineCount: previewResult.preview.pnlJournalEntry.lines.length,
      });
      continue;
    }

    if (existingProcessing !== null) {
      const rolledBack = await rollbackProcessedSettlementByJournalEntryId({
        connection: activeConnection,
        settlementJournalEntryId: resolved.journalEntry.Id,
      });
      activeConnection = rolledBack.updatedConnection;
    }

    const sourceAfterRollbackResult = await qboApi.fetchJournalEntryById(activeConnection, resolved.journalEntry.Id);
    if (sourceAfterRollbackResult.updatedConnection !== undefined) {
      activeConnection = sourceAfterRollbackResult.updatedConnection;
    }
    assertSameFingerprint(sourceBefore, fingerprintSettlementJe(sourceAfterRollbackResult.journalEntry));

    const processResult = await processSettlement({
      connection: activeConnection,
      settlementJournalEntryId: resolved.journalEntry.Id,
      sourceFilename: sourceRows.sourceFilename,
      invoiceId,
      auditRows: sourceRows.auditRows,
    });
    if (processResult.updatedConnection !== undefined) activeConnection = processResult.updatedConnection;

    const sourceAfterProcessResult = await qboApi.fetchJournalEntryById(activeConnection, resolved.journalEntry.Id);
    if (sourceAfterProcessResult.updatedConnection !== undefined) {
      activeConnection = sourceAfterProcessResult.updatedConnection;
    }
    assertSameFingerprint(sourceBefore, fingerprintSettlementJe(sourceAfterProcessResult.journalEntry));

    if (!processResult.result.ok) {
      results.push({
        invoiceId,
        settlementJournalEntryId: resolved.journalEntry.Id,
        ready: false,
        blocks: processResult.result.preview.blocks.map((block) => block.code),
      });
      continue;
    }

    results.push({
      invoiceId,
      settlementJournalEntryId: resolved.journalEntry.Id,
      ready: true,
      posted: processResult.result.posted,
      sourceSettlementFingerprint: sourceBefore,
    });
  }

  if (activeConnection !== connection) {
    await saveServerQboConnection(activeConnection);
  }

  const failed = results.filter((result) => result.ready !== true);
  console.log(
    JSON.stringify(
      {
        dryRun: !options.apply,
        options: {
          marketplace: options.marketplace,
          invoiceIds: options.invoiceIds,
        },
        totals: {
          targets: options.invoiceIds.length,
          ready: results.length - failed.length,
          failed: failed.length,
        },
        results,
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
