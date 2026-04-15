import { promises as fs } from 'node:fs';
import path from 'node:path';

import { db, dbTableIdentifier } from '@/lib/db';
import type { QboConnection, QboJournalEntry } from '@/lib/qbo/api';
import { fetchJournalEntries, fetchJournalEntryById, updateJournalEntry } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { isQboJournalEntryId } from '@/lib/plutus/journal-entry-id';
import { isSettlementDocNumber, normalizeSettlementDocNumber } from '@/lib/plutus/settlement-doc-number';

type MarketSelection = 'ALL' | 'US' | 'UK';

type CliOptions = {
  apply: boolean;
  market: MarketSelection;
};

type RenamePair = { from: string; to: string };

type SettlementRowCore = {
  id: string;
  marketplace: string;
  invoiceId: string;
  settlementDocNumber: string;
  qboCogsJournalEntryId: string;
  qboPnlReclassJournalEntryId: string;
};

type RowPlan = {
  row: SettlementRowCore;
  targetInvoiceId: string;
  targetSettlementDocNumber: string;
  targetCogsJournalEntryId: string;
  targetPnlJournalEntryId: string;
  changed: boolean;
};

type ProcessingJeTarget = {
  source: 'processing' | 'rollback';
  rowId: string;
  role: 'COGS' | 'PNL';
  journalEntryId: string;
  targetInvoiceId: string;
  targetDocNumber: string;
};

type AuditInvoiceRow = { invoiceId: string };

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
  await loadEnvFile(path.join(cwd, '.env.dev.ci'));
}

function parseArgs(argv: string[]): CliOptions {
  let apply = false;
  let market: MarketSelection = 'ALL';

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '--apply') {
      apply = true;
      i += 1;
      continue;
    }

    if (arg === '--market') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --market');
      const upper = next.trim().toUpperCase();
      if (upper !== 'ALL' && upper !== 'US' && upper !== 'UK') {
        throw new Error(`Invalid --market value: ${next}`);
      }
      market = upper;
      i += 2;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { apply, market };
}

function marketplaceToRegion(marketplace: string): 'US' | 'UK' {
  if (marketplace === 'amazon.com') return 'US';
  if (marketplace === 'amazon.co.uk') return 'UK';
  throw new Error(`Unsupported marketplace: ${marketplace}`);
}

function shouldIncludeRegion(region: 'US' | 'UK', market: MarketSelection): boolean {
  if (market === 'ALL') return true;
  return market === region;
}

function normalizeSettlementIdIfApplicable(value: string): string {
  if (!isSettlementDocNumber(value)) return value;
  return normalizeSettlementDocNumber(value);
}

function buildProcessingDocNumber(kind: 'C' | 'P', invoiceId: string): string {
  const base = `${kind}${invoiceId}`;
  if (base.length <= 21) {
    return base;
  }
  return `${kind}${invoiceId.slice(-20)}`;
}

function normalizeNoopJournalEntryId(value: string): string {
  const cogsPrefix = 'NOOP-COGS-';
  if (value.startsWith(cogsPrefix)) {
    const invoiceId = value.slice(cogsPrefix.length);
    const normalizedInvoiceId = normalizeSettlementIdIfApplicable(invoiceId);
    return `${cogsPrefix}${normalizedInvoiceId}`;
  }

  const pnlPrefix = 'NOOP-PNL-';
  if (value.startsWith(pnlPrefix)) {
    const invoiceId = value.slice(pnlPrefix.length);
    const normalizedInvoiceId = normalizeSettlementIdIfApplicable(invoiceId);
    return `${pnlPrefix}${normalizedInvoiceId}`;
  }

  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyRenamePairs(value: string, renamePairs: RenamePair[]): string {
  let next = value;
  for (const pair of renamePairs) {
    const re = new RegExp(escapeRegExp(pair.from), 'gi');
    next = next.replace(re, pair.to);
  }
  return next;
}

function isQboMissingJournalError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message.includes('Failed to fetch journal entry: 404')) return true;
  if (error.message.includes('Object Not Found') && error.message.includes('"code":"610"')) return true;
  return false;
}

function regionFromSettlementDocNumber(docNumber: string): 'US' | 'UK' {
  const normalized = normalizeSettlementDocNumber(docNumber);
  if (normalized.startsWith('US-')) return 'US';
  if (normalized.startsWith('UK-')) return 'UK';
  throw new Error(`Unknown settlement region for doc number: ${docNumber}`);
}

function buildQboJournalHref(journalEntryId: string): string {
  return `https://app.qbo.intuit.com/app/journal?txnId=${journalEntryId}`;
}

async function fetchSettlementJournalEntries(input: {
  connection: QboConnection;
  market: MarketSelection;
}): Promise<{ journalEntries: QboJournalEntry[]; updatedConnection?: QboConnection }> {
  const queries = input.market === 'ALL' ? ['US-', 'UK-'] : [`${input.market}-`];

  let activeConnection = input.connection;
  const byId = new Map<string, QboJournalEntry>();

  for (const query of queries) {
    let startPosition = 1;
    const maxResults = 200;

    while (true) {
      const page = await fetchJournalEntries(activeConnection, {
        docNumberContains: query,
        maxResults,
        startPosition,
      });

      if (page.updatedConnection) {
        activeConnection = page.updatedConnection;
      }

      for (const entry of page.journalEntries) {
        byId.set(entry.Id, entry);
      }

      if (page.journalEntries.length === 0) break;
      if (startPosition + page.journalEntries.length > page.totalCount) break;
      startPosition += page.journalEntries.length;
    }
  }

  const settlementEntries = Array.from(byId.values())
    .filter((entry) => {
      if (!entry.DocNumber) return false;
      if (!isSettlementDocNumber(entry.DocNumber)) return false;
      const region = regionFromSettlementDocNumber(entry.DocNumber);
      return shouldIncludeRegion(region, input.market);
    })
    .sort((a, b) => {
      if (a.TxnDate !== b.TxnDate) return a.TxnDate.localeCompare(b.TxnDate);
      return a.Id.localeCompare(b.Id);
    });

  return {
    journalEntries: settlementEntries,
    updatedConnection: activeConnection === input.connection ? undefined : activeConnection,
  };
}

async function main(): Promise<void> {
  await loadPlutusEnv();
  const options = parseArgs(process.argv.slice(2));
  const auditDataRowTable = dbTableIdentifier('AuditDataRow');

  const connection = await getQboConnection();
  if (!connection) {
    throw new Error('Not connected to QBO');
  }

  const [processingRowsRaw, rollbackRowsRaw, auditInvoiceIds] = await Promise.all([
    db.settlementProcessing.findMany({
      select: {
        id: true,
        marketplace: true,
        invoiceId: true,
        settlementDocNumber: true,
        qboCogsJournalEntryId: true,
        qboPnlReclassJournalEntryId: true,
      },
    }),
    db.settlementRollback.findMany({
      select: {
        id: true,
        marketplace: true,
        invoiceId: true,
        settlementDocNumber: true,
        qboCogsJournalEntryId: true,
        qboPnlReclassJournalEntryId: true,
      },
    }),
    db.$queryRawUnsafe<AuditInvoiceRow[]>(`SELECT DISTINCT "invoiceId" FROM ${auditDataRowTable}`),
  ]);

  const processingRows: SettlementRowCore[] = processingRowsRaw;
  const rollbackRows: SettlementRowCore[] = rollbackRowsRaw;

  const renameMap = new Map<string, string>();
  const recordRename = (fromValue: string, toValue: string): void => {
    const from = fromValue.trim().toUpperCase();
    const to = toValue.trim().toUpperCase();
    if (from === to) return;
    const existing = renameMap.get(from);
    if (existing && existing !== to) {
      throw new Error(`Conflicting rename mapping for ${from}: ${existing} vs ${to}`);
    }
    renameMap.set(from, to);
  };

  const processingPlans: RowPlan[] = processingRows
    .filter((row) => shouldIncludeRegion(marketplaceToRegion(row.marketplace), options.market))
    .map((row) => {
      const targetInvoiceId = normalizeSettlementIdIfApplicable(row.invoiceId);
      const targetSettlementDocNumber = normalizeSettlementIdIfApplicable(row.settlementDocNumber);
      const targetCogsJournalEntryId = normalizeNoopJournalEntryId(row.qboCogsJournalEntryId);
      const targetPnlJournalEntryId = normalizeNoopJournalEntryId(row.qboPnlReclassJournalEntryId);

      if (row.invoiceId !== targetInvoiceId) {
        recordRename(row.invoiceId, targetInvoiceId);
      }
      if (row.settlementDocNumber !== targetSettlementDocNumber) {
        recordRename(row.settlementDocNumber, targetSettlementDocNumber);
      }

      const changed =
        row.invoiceId !== targetInvoiceId ||
        row.settlementDocNumber !== targetSettlementDocNumber ||
        row.qboCogsJournalEntryId !== targetCogsJournalEntryId ||
        row.qboPnlReclassJournalEntryId !== targetPnlJournalEntryId;

      return {
        row,
        targetInvoiceId,
        targetSettlementDocNumber,
        targetCogsJournalEntryId,
        targetPnlJournalEntryId,
        changed,
      };
    });

  const finalInvoiceKeyToRowId = new Map<string, string>();
  for (const plan of processingPlans) {
    const key = `${plan.row.marketplace}:${plan.targetInvoiceId}`;
    const existing = finalInvoiceKeyToRowId.get(key);
    if (existing && existing !== plan.row.id) {
      throw new Error(`SettlementProcessing unique conflict after rename for key ${key} (rows ${existing} and ${plan.row.id})`);
    }
    finalInvoiceKeyToRowId.set(key, plan.row.id);
  }

  const rollbackPlans: RowPlan[] = rollbackRows
    .filter((row) => shouldIncludeRegion(marketplaceToRegion(row.marketplace), options.market))
    .map((row) => {
      const targetInvoiceId = normalizeSettlementIdIfApplicable(row.invoiceId);
      const targetSettlementDocNumber = normalizeSettlementIdIfApplicable(row.settlementDocNumber);
      const targetCogsJournalEntryId = normalizeNoopJournalEntryId(row.qboCogsJournalEntryId);
      const targetPnlJournalEntryId = normalizeNoopJournalEntryId(row.qboPnlReclassJournalEntryId);

      if (row.invoiceId !== targetInvoiceId) {
        recordRename(row.invoiceId, targetInvoiceId);
      }
      if (row.settlementDocNumber !== targetSettlementDocNumber) {
        recordRename(row.settlementDocNumber, targetSettlementDocNumber);
      }

      const changed =
        row.invoiceId !== targetInvoiceId ||
        row.settlementDocNumber !== targetSettlementDocNumber ||
        row.qboCogsJournalEntryId !== targetCogsJournalEntryId ||
        row.qboPnlReclassJournalEntryId !== targetPnlJournalEntryId;

      return {
        row,
        targetInvoiceId,
        targetSettlementDocNumber,
        targetCogsJournalEntryId,
        targetPnlJournalEntryId,
        changed,
      };
    });

  const auditRenameMap = new Map<string, string>();
  for (const row of auditInvoiceIds) {
    if (!isSettlementDocNumber(row.invoiceId)) continue;
    const normalized = normalizeSettlementDocNumber(row.invoiceId);
    const region = regionFromSettlementDocNumber(normalized);
    if (!shouldIncludeRegion(region, options.market)) continue;

    const from = row.invoiceId;
    const to = normalized;
    if (from === to) continue;

    const existing = auditRenameMap.get(from);
    if (existing && existing !== to) {
      throw new Error(`Conflicting AuditDataRow rename mapping for ${from}: ${existing} vs ${to}`);
    }

    auditRenameMap.set(from, to);
    recordRename(from, to);
  }

  let activeConnection = connection;

  const settlementHistory = await fetchSettlementJournalEntries({ connection: activeConnection, market: options.market });
  if (settlementHistory.updatedConnection) {
    activeConnection = settlementHistory.updatedConnection;
  }

  for (const settlementJe of settlementHistory.journalEntries) {
    if (!settlementJe.DocNumber) continue;
    const normalized = normalizeSettlementDocNumber(settlementJe.DocNumber);
    const current = settlementJe.DocNumber.trim().toUpperCase();
    if (current !== normalized) {
      recordRename(current, normalized);
    }
  }

  const renamePairs: RenamePair[] = Array.from(renameMap.entries())
    .map(([from, to]) => ({ from, to }))
    .sort((a, b) => b.from.length - a.from.length || a.from.localeCompare(b.from));

  const settlementJeUpdates = settlementHistory.journalEntries
    .map((entry) => {
      if (!entry.DocNumber) {
        throw new Error(`Missing DocNumber for settlement journal entry ${entry.Id}`);
      }

      const currentDocNumber = entry.DocNumber.trim();
      const targetDocNumber = normalizeSettlementDocNumber(currentDocNumber);

      const currentPrivateNote = entry.PrivateNote ? entry.PrivateNote : '';
      const targetPrivateNote = applyRenamePairs(currentPrivateNote, renamePairs);

      const updateDoc = currentDocNumber.toUpperCase() !== targetDocNumber;
      const updatePrivateNote = targetPrivateNote !== currentPrivateNote;

      return {
        journalEntryId: entry.Id,
        currentDocNumber,
        targetDocNumber,
        currentPrivateNote,
        targetPrivateNote,
        updateDoc,
        updatePrivateNote,
      };
    })
    .filter((plan) => plan.updateDoc || plan.updatePrivateNote);

  const processingJeTargetById = new Map<string, ProcessingJeTarget>();
  const addProcessingJeTarget = (target: ProcessingJeTarget): void => {
    const existing = processingJeTargetById.get(target.journalEntryId);
    if (!existing) {
      processingJeTargetById.set(target.journalEntryId, target);
      return;
    }

    if (existing.targetDocNumber !== target.targetDocNumber || existing.targetInvoiceId !== target.targetInvoiceId) {
      throw new Error(
        `Conflicting processing JE target for ${target.journalEntryId}: ${existing.targetDocNumber}/${existing.targetInvoiceId} vs ${target.targetDocNumber}/${target.targetInvoiceId}`,
      );
    }

    if (existing.source === 'rollback' && target.source === 'processing') {
      processingJeTargetById.set(target.journalEntryId, target);
    }
  };

  for (const plan of processingPlans) {
    if (isQboJournalEntryId(plan.row.qboCogsJournalEntryId)) {
      addProcessingJeTarget({
        source: 'processing',
        rowId: plan.row.id,
        role: 'COGS',
        journalEntryId: plan.row.qboCogsJournalEntryId,
        targetInvoiceId: plan.targetInvoiceId,
        targetDocNumber: buildProcessingDocNumber('C', plan.targetInvoiceId),
      });
    }
    if (isQboJournalEntryId(plan.row.qboPnlReclassJournalEntryId)) {
      addProcessingJeTarget({
        source: 'processing',
        rowId: plan.row.id,
        role: 'PNL',
        journalEntryId: plan.row.qboPnlReclassJournalEntryId,
        targetInvoiceId: plan.targetInvoiceId,
        targetDocNumber: buildProcessingDocNumber('P', plan.targetInvoiceId),
      });
    }
  }

  for (const plan of rollbackPlans) {
    if (isQboJournalEntryId(plan.row.qboCogsJournalEntryId)) {
      addProcessingJeTarget({
        source: 'rollback',
        rowId: plan.row.id,
        role: 'COGS',
        journalEntryId: plan.row.qboCogsJournalEntryId,
        targetInvoiceId: plan.targetInvoiceId,
        targetDocNumber: buildProcessingDocNumber('C', plan.targetInvoiceId),
      });
    }
    if (isQboJournalEntryId(plan.row.qboPnlReclassJournalEntryId)) {
      addProcessingJeTarget({
        source: 'rollback',
        rowId: plan.row.id,
        role: 'PNL',
        journalEntryId: plan.row.qboPnlReclassJournalEntryId,
        targetInvoiceId: plan.targetInvoiceId,
        targetDocNumber: buildProcessingDocNumber('P', plan.targetInvoiceId),
      });
    }
  }

  const processingJeTargets = Array.from(processingJeTargetById.values()).sort((a, b) => a.journalEntryId.localeCompare(b.journalEntryId));

  let settlementJournalsUpdated = 0;
  const settlementJournalLinks: string[] = [];
  if (options.apply) {
    for (const plan of settlementJeUpdates) {
      const updates: { docNumber?: string; privateNote?: string } = {};
      if (plan.updateDoc) {
        updates.docNumber = plan.targetDocNumber;
      }
      if (plan.updatePrivateNote) {
        updates.privateNote = plan.targetPrivateNote;
      }

      const res = await updateJournalEntry(activeConnection, plan.journalEntryId, updates);
      if (res.updatedConnection) {
        activeConnection = res.updatedConnection;
      }
      settlementJournalsUpdated += 1;
      settlementJournalLinks.push(buildQboJournalHref(plan.journalEntryId));
    }
  }

  let processingJournalsPlanned = 0;
  let processingJournalsUpdated = 0;
  let processingJournalsMissing = 0;
  let rollbackJournalsMissing = 0;
  const processingJournalLinks: string[] = [];

  for (const target of processingJeTargets) {
    let fetched;
    try {
      fetched = await fetchJournalEntryById(activeConnection, target.journalEntryId);
    } catch (error) {
      if (isQboMissingJournalError(error)) {
        if (target.source === 'processing') {
          throw new Error(`Missing processing journal entry ${target.journalEntryId} (row ${target.rowId}, ${target.role})`);
        }
        rollbackJournalsMissing += 1;
        continue;
      }
      throw error;
    }

    if (fetched.updatedConnection) {
      activeConnection = fetched.updatedConnection;
    }

    const currentDocNumber = fetched.journalEntry.DocNumber ? fetched.journalEntry.DocNumber.trim() : '';
    const currentPrivateNote = fetched.journalEntry.PrivateNote ? fetched.journalEntry.PrivateNote : '';
    const targetPrivateNote = applyRenamePairs(currentPrivateNote, renamePairs);

    const updateDoc = currentDocNumber !== target.targetDocNumber;
    const updatePrivateNote = targetPrivateNote !== currentPrivateNote;

    if (!updateDoc && !updatePrivateNote) {
      continue;
    }

    processingJournalsPlanned += 1;

    if (!options.apply) {
      continue;
    }

    const updates: { docNumber?: string; privateNote?: string } = {};
    if (updateDoc) {
      updates.docNumber = target.targetDocNumber;
    }
    if (updatePrivateNote) {
      updates.privateNote = targetPrivateNote;
    }

    const updated = await updateJournalEntry(activeConnection, target.journalEntryId, updates);
    if (updated.updatedConnection) {
      activeConnection = updated.updatedConnection;
    }

    processingJournalsUpdated += 1;
    processingJournalLinks.push(buildQboJournalHref(target.journalEntryId));
  }

  const processingDbUpdates = processingPlans
    .filter((plan) => plan.changed)
    .map((plan) => ({
      id: plan.row.id,
      data: {
        invoiceId: plan.targetInvoiceId,
        settlementDocNumber: plan.targetSettlementDocNumber,
        qboCogsJournalEntryId: plan.targetCogsJournalEntryId,
        qboPnlReclassJournalEntryId: plan.targetPnlJournalEntryId,
      },
    }));

  const rollbackDbUpdates = rollbackPlans
    .filter((plan) => plan.changed)
    .map((plan) => ({
      id: plan.row.id,
      data: {
        invoiceId: plan.targetInvoiceId,
        settlementDocNumber: plan.targetSettlementDocNumber,
        qboCogsJournalEntryId: plan.targetCogsJournalEntryId,
        qboPnlReclassJournalEntryId: plan.targetPnlJournalEntryId,
      },
    }));

  let processingRowsUpdated = 0;
  let rollbackRowsUpdated = 0;
  let auditRowsUpdated = 0;

  if (options.apply) {
    await db.$transaction(async (tx) => {
      for (const update of processingDbUpdates) {
        await tx.settlementProcessing.update({ where: { id: update.id }, data: update.data });
        processingRowsUpdated += 1;
      }

      for (const update of rollbackDbUpdates) {
        await tx.settlementRollback.update({ where: { id: update.id }, data: update.data });
        rollbackRowsUpdated += 1;
      }

      const auditRenamePairs = Array.from(auditRenameMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [from, to] of auditRenamePairs) {
        const updated = await tx.auditDataRow.updateMany({
          where: { invoiceId: from },
          data: { invoiceId: to },
        });
        auditRowsUpdated += updated.count;
      }
    });
  }

  if (activeConnection !== connection) {
    await saveServerQboConnection(activeConnection);
  }

  const summary = {
    apply: options.apply,
    market: options.market,
    renamePairs: renamePairs,
    qbo: {
      settlementJournalsScanned: settlementHistory.journalEntries.length,
      settlementJournalsPlanned: settlementJeUpdates.length,
      settlementJournalsUpdated,
      processingJournalsScanned: processingJeTargets.length,
      processingJournalsPlanned,
      processingJournalsUpdated,
      processingJournalsMissing,
      rollbackJournalsMissing,
      settlementLinks: settlementJournalLinks,
      processingLinks: processingJournalLinks,
    },
    db: {
      processingRowsPlanned: processingDbUpdates.length,
      processingRowsUpdated,
      rollbackRowsPlanned: rollbackDbUpdates.length,
      rollbackRowsUpdated,
      auditInvoiceIdsPlanned: auditRenameMap.size,
      auditRowsUpdated,
    },
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
