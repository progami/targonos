import { promises as fs } from 'node:fs';
import path from 'node:path';

import { buildSyntheticUkSettlementId } from '@/lib/amazon-finances/uk-settlement-id';
import {
  isSettlementDocNumber,
  normalizeSettlementDocNumber,
  stripPlutusDocPrefix,
} from '@/lib/plutus/settlement-doc-number';
import { extractSourceSettlementIdFromPrivateNote } from '@/lib/plutus/settlement-parents';

const DEFAULT_INTERVAL_MINUTES = 60;
const DEFAULT_LOOKBACK_DAYS = 45;
const CLOSED_GROUP_LOOKBACK_DAYS = 60;

type Region = 'US' | 'UK';

type WorkerDeps = {
  db: typeof import('@/lib/db').db;
  fetchJournalEntries: typeof import('@/lib/qbo/api').fetchJournalEntries;
  getQboConnection: typeof import('@/lib/qbo/connection-store').getQboConnection;
  listAllFinancialEventGroups: typeof import('@/lib/amazon-finances/sp-api-finances').listAllFinancialEventGroups;
  listSettlementEventGroupsFromTransactions: typeof import('@/lib/amazon-finances/sp-api-finances').listSettlementEventGroupsFromTransactions;
  runAutopostCheck: typeof import('@/lib/plutus/autopost-check').runAutopostCheck;
  saveServerQboConnection: typeof import('@/lib/qbo/connection-store').saveServerQboConnection;
  syncUkSettlementsFromSpApiFinances: typeof import('@/lib/amazon-finances/uk-settlement-sync').syncUkSettlementsFromSpApiFinances;
  syncUsSettlementsFromSpApiFinances: typeof import('@/lib/amazon-finances/us-settlement-sync').syncUsSettlementsFromSpApiFinances;
};

type KnownSettlementSourceIds = Record<Region, Set<string>>;

let cachedDepsPromise: Promise<WorkerDeps> | null = null;

async function getWorkerDeps(): Promise<WorkerDeps> {
  if (cachedDepsPromise !== null) {
    return cachedDepsPromise;
  }

  cachedDepsPromise = (async () => {
    const [
      dbMod,
      qboApiMod,
      qboConnectionMod,
      spApiFinancesMod,
      autopostMod,
      usSettlementSyncMod,
      ukSettlementSyncMod,
    ] = await Promise.all([
      import('@/lib/db'),
      import('@/lib/qbo/api'),
      import('@/lib/qbo/connection-store'),
      import('@/lib/amazon-finances/sp-api-finances'),
      import('@/lib/plutus/autopost-check'),
      import('@/lib/amazon-finances/us-settlement-sync'),
      import('@/lib/amazon-finances/uk-settlement-sync'),
    ]);

    return {
      db: dbMod.db,
      fetchJournalEntries: qboApiMod.fetchJournalEntries,
      getQboConnection: qboConnectionMod.getQboConnection,
      listAllFinancialEventGroups: spApiFinancesMod.listAllFinancialEventGroups,
      listSettlementEventGroupsFromTransactions: spApiFinancesMod.listSettlementEventGroupsFromTransactions,
      runAutopostCheck: autopostMod.runAutopostCheck,
      saveServerQboConnection: qboConnectionMod.saveServerQboConnection,
      syncUkSettlementsFromSpApiFinances: ukSettlementSyncMod.syncUkSettlementsFromSpApiFinances,
      syncUsSettlementsFromSpApiFinances: usSettlementSyncMod.syncUsSettlementsFromSpApiFinances,
    };
  })();

  return cachedDepsPromise;
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

  const hasSingleQuotes = value.startsWith("'") && value.endsWith("'");
  const hasDoubleQuotes = value.startsWith('"') && value.endsWith('"');
  if (hasSingleQuotes) {
    value = value.slice(1, -1);
  }

  if (hasDoubleQuotes) {
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

    if (process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

async function loadPlutusEnv(): Promise<void> {
  const cwd = process.cwd();
  await loadEnvFile(path.join(cwd, '.env.local'));
  await loadEnvFile(path.join(cwd, '.env'));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function log(level: 'info' | 'warn' | 'error', message: string, details?: Record<string, unknown>) {
  const payload = {
    ts: new Date().toISOString(),
    worker: 'plutus-settlement-sync',
    level,
    message,
    details,
  };

  const serialized = JSON.stringify(payload);
  if (level === 'error') {
    console.error(serialized);
    return;
  }

  if (level === 'warn') {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function subtractUtcDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy;
}

function buildLookbackStartDate(input: { now: Date; lookbackDays: number }): string {
  return formatUtcDate(subtractUtcDays(input.now, input.lookbackDays));
}

function computePostedAfterIso(startDate: string): string {
  return `${startDate}T00:00:00.000Z`;
}

function computePostedBeforeIso(now: Date): string {
  return new Date(now.getTime() - 5 * 60 * 1000).toISOString();
}

function computeGroupStartedAfterIso(startDate: string): string {
  return `${formatUtcDate(subtractUtcDays(new Date(`${startDate}T00:00:00.000Z`), CLOSED_GROUP_LOOKBACK_DAYS))}T00:00:00.000Z`;
}

function isClosedFinancialEventGroup(group: unknown): group is {
  FinancialEventGroupEnd: string;
  FinancialEventGroupId: string;
  FinancialEventGroupStart: string;
  ProcessingStatus: string;
} {
  if (typeof group !== 'object' || group === null) return false;

  const candidate = group as Record<string, unknown>;
  if (candidate.ProcessingStatus !== 'Closed') return false;
  if (typeof candidate.FinancialEventGroupId !== 'string' || candidate.FinancialEventGroupId.trim() === '') return false;
  if (typeof candidate.FinancialEventGroupStart !== 'string' || candidate.FinancialEventGroupStart.trim() === '') return false;
  if (typeof candidate.FinancialEventGroupEnd !== 'string' || candidate.FinancialEventGroupEnd.trim() === '') return false;
  return true;
}

function sampleSettlementIds(settlementIds: string[]): string[] {
  if (settlementIds.length <= 10) {
    return settlementIds;
  }

  return [...settlementIds.slice(0, 10), `+${settlementIds.length - 10} more`];
}

async function fetchKnownSettlementSourceIds(startDate: string): Promise<KnownSettlementSourceIds> {
  const deps = await getWorkerDeps();
  const connection = await deps.getQboConnection();
  if (!connection) {
    throw new Error('Not connected to QBO');
  }

  let activeConnection = connection;
  const known: KnownSettlementSourceIds = {
    US: new Set<string>(),
    UK: new Set<string>(),
  };

  for (const docNumberContains of ['US-', 'UK-'] as const) {
    let startPosition = 1;

    while (true) {
      const page = await deps.fetchJournalEntries(activeConnection, {
        startDate,
        docNumberContains,
        maxResults: 100,
        startPosition,
        includeTotalCount: false,
      });

      if (page.updatedConnection) {
        activeConnection = page.updatedConnection;
      }

      for (const journalEntry of page.journalEntries) {
        const rawDocNumber = typeof journalEntry.DocNumber === 'string' ? journalEntry.DocNumber.trim() : '';
        if (rawDocNumber === '') continue;

        const strippedDocNumber = stripPlutusDocPrefix(rawDocNumber);
        const first = strippedDocNumber[0] ? strippedDocNumber[0].toUpperCase() : '';
        if (first === 'C' || first === 'P') continue;

        if (!isSettlementDocNumber(rawDocNumber)) continue;

        const normalizedDocNumber = normalizeSettlementDocNumber(rawDocNumber);
        const region: Region | null = normalizedDocNumber.startsWith('US-')
          ? 'US'
          : normalizedDocNumber.startsWith('UK-')
            ? 'UK'
            : null;
        if (region === null) continue;

        const privateNote = typeof journalEntry.PrivateNote === 'string' ? journalEntry.PrivateNote : '';
        const sourceSettlementId = extractSourceSettlementIdFromPrivateNote(privateNote);
        if (!sourceSettlementId) continue;

        known[region].add(sourceSettlementId);
      }

      if (page.journalEntries.length < 100) {
        break;
      }

      startPosition += page.journalEntries.length;
    }
  }

  if (activeConnection !== connection) {
    await deps.saveServerQboConnection(activeConnection);
  }

  return known;
}

async function findMissingUsSettlementIds(input: {
  knownSourceSettlementIds: ReadonlySet<string>;
  now: Date;
  startDate: string;
}): Promise<string[]> {
  const deps = await getWorkerDeps();

  const postedAfterIso = computePostedAfterIso(input.startDate);
  const postedBeforeIso = computePostedBeforeIso(input.now);

  const settlementToGroupId = await deps.listSettlementEventGroupsFromTransactions({
    tenantCode: 'US',
    postedAfterIso,
    postedBeforeIso,
  });

  const eventGroups = await deps.listAllFinancialEventGroups({
    tenantCode: 'US',
    startedAfterIso: computeGroupStartedAfterIso(input.startDate),
    startedBeforeIso: postedBeforeIso,
  });

  const groupById = new Map<string, unknown>();
  for (const eventGroup of eventGroups) {
    const groupId =
      typeof eventGroup?.FinancialEventGroupId === 'string' ? eventGroup.FinancialEventGroupId.trim() : '';
    if (groupId === '') continue;
    groupById.set(groupId, eventGroup);
  }

  const missingSettlementIds: string[] = [];
  for (const [settlementId, eventGroupId] of settlementToGroupId.entries()) {
    const eventGroup = groupById.get(eventGroupId);
    if (!isClosedFinancialEventGroup(eventGroup)) continue;
    if (input.knownSourceSettlementIds.has(settlementId)) continue;
    missingSettlementIds.push(settlementId);
  }

  return missingSettlementIds.sort((a, b) => a.localeCompare(b));
}

async function findMissingUkSettlementIds(input: {
  knownSourceSettlementIds: ReadonlySet<string>;
  now: Date;
  startDate: string;
}): Promise<string[]> {
  const deps = await getWorkerDeps();

  const postedAfterIso = computePostedAfterIso(input.startDate);
  const postedBeforeIso = computePostedBeforeIso(input.now);
  const postedAfterMs = new Date(postedAfterIso).getTime();
  const postedBeforeMs = new Date(postedBeforeIso).getTime();

  const eventGroups = await deps.listAllFinancialEventGroups({
    tenantCode: 'UK',
    startedAfterIso: computeGroupStartedAfterIso(input.startDate),
    startedBeforeIso: postedBeforeIso,
  });

  const missingSettlementIds: string[] = [];
  for (const eventGroup of eventGroups) {
    if (!isClosedFinancialEventGroup(eventGroup)) continue;

    const endMs = new Date(eventGroup.FinancialEventGroupEnd).getTime();
    if (Number.isNaN(endMs)) continue;
    if (endMs < postedAfterMs) continue;
    if (endMs > postedBeforeMs) continue;

    const settlementId = buildSyntheticUkSettlementId(eventGroup.FinancialEventGroupId);
    if (input.knownSourceSettlementIds.has(settlementId)) continue;

    missingSettlementIds.push(settlementId);
  }

  return missingSettlementIds.sort((a, b) => a.localeCompare(b));
}

async function maybeRunAutopost() {
  const deps = await getWorkerDeps();
  const config = await deps.db.setupConfig.findFirst({
    select: {
      autopostEnabled: true,
    },
  });

  if (!config || config.autopostEnabled !== true) {
    return null;
  }

  return deps.runAutopostCheck();
}

async function runTick(input: { lookbackDays: number }): Promise<void> {
  const deps = await getWorkerDeps();
  const now = new Date();
  const startDate = buildLookbackStartDate({ now, lookbackDays: input.lookbackDays });
  const knownSourceSettlementIds = await fetchKnownSettlementSourceIds(startDate);

  try {
    const missingUsSettlementIds = await findMissingUsSettlementIds({
      knownSourceSettlementIds: knownSourceSettlementIds.US,
      now,
      startDate,
    });

    if (missingUsSettlementIds.length > 0) {
      const result = await deps.syncUsSettlementsFromSpApiFinances({
        startDate,
        settlementIds: missingUsSettlementIds,
        postToQbo: true,
        process: false,
      });

      log(result.totals.errors > 0 ? 'warn' : 'info', 'US settlement sync complete', {
        startDate,
        settlementIds: sampleSettlementIds(missingUsSettlementIds),
        totals: result.totals,
      });
    }
  } catch (error) {
    log('error', 'US settlement sync failed', {
      startDate,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const missingUkSettlementIds = await findMissingUkSettlementIds({
      knownSourceSettlementIds: knownSourceSettlementIds.UK,
      now,
      startDate,
    });

    if (missingUkSettlementIds.length > 0) {
      const result = await deps.syncUkSettlementsFromSpApiFinances({
        startDate,
        settlementIds: missingUkSettlementIds,
        postToQbo: true,
        process: false,
      });

      log(result.totals.errors > 0 ? 'warn' : 'info', 'UK settlement sync complete', {
        startDate,
        settlementIds: sampleSettlementIds(missingUkSettlementIds),
        totals: result.totals,
      });
    }
  } catch (error) {
    log('error', 'UK settlement sync failed', {
      startDate,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const result = await maybeRunAutopost();
    if (result && (result.processed.length > 0 || result.skipped.length > 0 || result.errors.length > 0)) {
      log(result.errors.length > 0 ? 'warn' : 'info', 'Autopost check complete', {
        processed: result.processed.length,
        skipped: result.skipped.length,
        errors: result.errors.length,
      });
    }
  } catch (error) {
    log('error', 'Autopost check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function main(): Promise<void> {
  await loadPlutusEnv();

  const enabled = process.env.PLUTUS_SETTLEMENT_SYNC_WORKER_ENABLED === '1';
  const runOnce = process.env.PLUTUS_SETTLEMENT_SYNC_RUN_ONCE === '1';
  const intervalMinutes = parsePositiveIntegerEnv(
    'PLUTUS_SETTLEMENT_SYNC_INTERVAL_MINUTES',
    DEFAULT_INTERVAL_MINUTES,
  );
  const lookbackDays = parsePositiveIntegerEnv('PLUTUS_SETTLEMENT_SYNC_LOOKBACK_DAYS', DEFAULT_LOOKBACK_DAYS);
  const tickMs = intervalMinutes * 60_000;

  if (!enabled) {
    log('info', 'Worker disabled by env; idling', {
      envVar: 'PLUTUS_SETTLEMENT_SYNC_WORKER_ENABLED',
      runOnce,
    });

    if (runOnce) {
      return;
    }

    while (true) {
      await sleep(tickMs);
    }
  }

  log('info', 'Worker started', {
    intervalMinutes,
    lookbackDays,
    runOnce,
  });

  if (runOnce) {
    await runTick({ lookbackDays });
    return;
  }

  while (true) {
    try {
      await runTick({ lookbackDays });
    } catch (error) {
      log('error', 'Settlement sync tick failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await sleep(tickMs);
  }
}

main().catch((error) => {
  log('error', 'Worker crashed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
