import { promises as fs } from 'node:fs';
import path from 'node:path';

import { db } from '@/lib/db';
import { HUMAN_APPROVAL_PHRASE } from '@/lib/plutus/human-approval';
import { isQboJournalEntryId } from '@/lib/plutus/journal-entry-id';
import type { QboAccount, QboConnection, QboJournalEntry, QboJournalEntryLine } from '@/lib/qbo/api';
import { fetchAccounts, fetchJournalEntryById, updateJournalEntryWithPayload } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import {
  isSettlementOperatingBrandAccountName,
  normalizeSettlementOperatingMemo,
  settlementParentAccountKeyForMemo,
} from '@/lib/amazon-finances/settlement-memo-normalization';
import { loadSharedPlutusEnv } from './shared-env';

type MarketSelection = 'ALL' | 'US' | 'UK';
type Marketplace = 'amazon.com' | 'amazon.co.uk';

type CliOptions = {
  apply: boolean;
  humanApproval: string | null;
  market: MarketSelection;
  invoiceId: string | null;
};

type MemoMappingEntry = { accountId: string; taxCodeId: string | null };
type MemoMapping = Record<string, MemoMappingEntry>;

type ConfigPlan = {
  marketplace: Marketplace;
  currentMapping: MemoMapping;
  targetMapping: MemoMapping;
  changedKeys: string[];
};

type JournalPlan = {
  marketplace: Marketplace;
  invoiceId: string;
  journalEntryId: string;
  docNumber: string | null;
  changedLines: Array<{
    lineIndex: number;
    fromDescription: string;
    toDescription: string;
    fromAccountId: string;
    toAccountId: string;
    toAccountName: string;
  }>;
  unresolvedBrandAccounts: Array<{
    lineIndex: number;
    description: string;
    accountId: string;
    accountName: string;
  }>;
  targetEntry: QboJournalEntry;
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
  if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);

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
  let humanApproval: string | null = null;
  let market: MarketSelection = 'ALL';
  let invoiceId: string | null = null;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '--apply') {
      apply = true;
      i += 1;
      continue;
    }

    if (arg === '--human-approval') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --human-approval');
      humanApproval = next;
      i += 2;
      continue;
    }

    if (arg === '--market') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --market');
      const upper = next.trim().toUpperCase();
      if (upper !== 'ALL' && upper !== 'US' && upper !== 'UK') throw new Error(`Invalid --market value: ${next}`);
      market = upper;
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

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (apply && humanApproval !== HUMAN_APPROVAL_PHRASE) {
    throw new Error(`Settlement QBO/account-config repair requires --human-approval "${HUMAN_APPROVAL_PHRASE}"`);
  }

  return { apply, humanApproval, market, invoiceId };
}

function marketplacesForSelection(selection: MarketSelection): Marketplace[] {
  if (selection === 'US') return ['amazon.com'];
  if (selection === 'UK') return ['amazon.co.uk'];
  return ['amazon.com', 'amazon.co.uk'];
}

function requireMemoMapping(value: unknown): MemoMapping {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Settlement memo mapping must be an object');
  }

  const result: MemoMapping = {};
  for (const [memo, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string') {
      const accountId = raw.trim();
      if (accountId === '') throw new Error(`Invalid account id for memo mapping: ${memo}`);
      result[memo] = { accountId, taxCodeId: null };
      continue;
    }

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error(`Invalid memo mapping entry: ${memo}`);
    }

    const entry = raw as Record<string, unknown>;
    const accountIdRaw = entry.accountId;
    if (typeof accountIdRaw !== 'string' || accountIdRaw.trim() === '') {
      throw new Error(`Invalid memo mapping accountId: ${memo}`);
    }

    const taxCodeIdRaw = entry.taxCodeId;
    result[memo] = {
      accountId: accountIdRaw.trim(),
      taxCodeId: typeof taxCodeIdRaw === 'string' && taxCodeIdRaw.trim() !== '' ? taxCodeIdRaw.trim() : null,
    };
  }

  return result;
}

function sortMapping(mapping: MemoMapping): MemoMapping {
  const sorted: MemoMapping = {};
  for (const key of Object.keys(mapping).sort()) {
    sorted[key] = mapping[key]!;
  }
  return sorted;
}

function requireSetupAccount(setupConfig: Record<string, unknown>, key: 'amazonSales' | 'amazonRefunds'): string {
  const value = setupConfig[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing SetupConfig.${key}`);
  }
  return value.trim();
}

function accountIdForNormalizedMemo(input: {
  setupConfig: Record<string, unknown>;
  normalizedMemo: string;
  entry: MemoMappingEntry;
}): string {
  const setupKey = settlementParentAccountKeyForMemo(input.normalizedMemo);
  if (setupKey) return requireSetupAccount(input.setupConfig, setupKey);
  return input.entry.accountId;
}

function planConfig(input: {
  marketplace: Marketplace;
  setupConfig: Record<string, unknown>;
  currentMapping: MemoMapping;
}): ConfigPlan {
  const targetMapping: MemoMapping = {};

  for (const [memo, entry] of Object.entries(input.currentMapping)) {
    const normalizedMemo = normalizeSettlementOperatingMemo(memo);
    targetMapping[normalizedMemo] = {
      accountId: accountIdForNormalizedMemo({
        setupConfig: input.setupConfig,
        normalizedMemo,
        entry,
      }),
      taxCodeId: entry.taxCodeId,
    };
  }

  const currentSorted = sortMapping(input.currentMapping);
  const targetSorted = sortMapping(targetMapping);
  const keys = new Set([...Object.keys(currentSorted), ...Object.keys(targetSorted)]);
  const changedKeys = Array.from(keys)
    .filter((key) => JSON.stringify(currentSorted[key]) !== JSON.stringify(targetSorted[key]))
    .sort();

  return {
    marketplace: input.marketplace,
    currentMapping: currentSorted,
    targetMapping: targetSorted,
    changedKeys,
  };
}

function buildAccountIndex(accounts: QboAccount[]): Map<string, QboAccount> {
  return new Map(accounts.map((account) => [account.Id, account]));
}

function accountDisplayName(account: QboAccount | undefined, fallback: string | undefined): string {
  return account?.FullyQualifiedName?.trim() || fallback?.trim() || account?.Name?.trim() || '';
}

function compactJournalEntryForUpdate(entry: QboJournalEntry, lines: QboJournalEntryLine[]): QboJournalEntry {
  return {
    Id: entry.Id,
    SyncToken: entry.SyncToken,
    TxnDate: entry.TxnDate,
    DocNumber: entry.DocNumber,
    PrivateNote: entry.PrivateNote,
    CurrencyRef: entry.CurrencyRef,
    ExchangeRate: entry.ExchangeRate,
    Line: lines,
  };
}

function planJournalRepair(input: {
  marketplace: Marketplace;
  invoiceId: string;
  entry: QboJournalEntry;
  targetMapping: MemoMapping;
  accountById: Map<string, QboAccount>;
}): JournalPlan {
  const changedLines: JournalPlan['changedLines'] = [];
  const unresolvedBrandAccounts: JournalPlan['unresolvedBrandAccounts'] = [];

  const lines = input.entry.Line.map((line, index) => {
    const currentAccountId = line.JournalEntryLineDetail?.AccountRef?.value;
    const currentAccountName = accountDisplayName(
      typeof currentAccountId === 'string' ? input.accountById.get(currentAccountId) : undefined,
      line.JournalEntryLineDetail?.AccountRef?.name,
    );
    const fromDescription = typeof line.Description === 'string' ? line.Description.trim() : '';
    const toDescription = normalizeSettlementOperatingMemo(fromDescription);
    const target = input.targetMapping[toDescription];

    if (!target) {
      if (currentAccountId && isSettlementOperatingBrandAccountName(currentAccountName)) {
        unresolvedBrandAccounts.push({
          lineIndex: index,
          description: fromDescription,
          accountId: currentAccountId,
          accountName: currentAccountName,
        });
      }
      return line;
    }

    const targetAccount = input.accountById.get(target.accountId);
    if (!targetAccount) {
      throw new Error(`Missing QBO account ${target.accountId} for memo ${toDescription}`);
    }

    const toAccountName = accountDisplayName(targetAccount, targetAccount.Name);
    if (currentAccountId === target.accountId && fromDescription === toDescription) return line;

    changedLines.push({
      lineIndex: index,
      fromDescription,
      toDescription,
      fromAccountId: currentAccountId ?? '',
      toAccountId: target.accountId,
      toAccountName,
    });

    return {
      ...line,
      Description: toDescription,
      JournalEntryLineDetail: {
        ...line.JournalEntryLineDetail,
        AccountRef: {
          value: target.accountId,
          name: toAccountName,
        },
      },
    };
  });

  return {
    marketplace: input.marketplace,
    invoiceId: input.invoiceId,
    journalEntryId: input.entry.Id,
    docNumber: typeof input.entry.DocNumber === 'string' ? input.entry.DocNumber : null,
    changedLines,
    unresolvedBrandAccounts,
    targetEntry: compactJournalEntryForUpdate(input.entry, lines),
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  loadSharedPlutusEnv();
  await loadPlutusEnv();

  const connectionMaybe = await getQboConnection();
  if (connectionMaybe === null) throw new Error('Not connected to QBO');
  let connection: QboConnection = connectionMaybe;

  const setupConfig = await db.setupConfig.findFirst();
  if (setupConfig === null) throw new Error('Missing SetupConfig');

  const accountsRes = await fetchAccounts(connection, { includeInactive: true });
  if (accountsRes.updatedConnection) connection = accountsRes.updatedConnection;
  const accountById = buildAccountIndex(accountsRes.accounts);

  const marketplaces = marketplacesForSelection(options.market);
  const configPlans: ConfigPlan[] = [];
  const targetMappingsByMarketplace = new Map<Marketplace, MemoMapping>();

  for (const marketplace of marketplaces) {
    const config = await db.settlementPostingConfig.findUnique({ where: { marketplace } });
    if (!config) throw new Error(`Missing settlement posting config for ${marketplace}`);

    const currentMapping = requireMemoMapping(config.accountIdByMemo);
    const configPlan = planConfig({ marketplace, setupConfig: setupConfig as Record<string, unknown>, currentMapping });
    configPlans.push(configPlan);
    targetMappingsByMarketplace.set(marketplace, configPlan.targetMapping);
  }

  const processingRows = await db.settlementProcessing.findMany({
    where: {
      marketplace: { in: marketplaces },
      ...(options.invoiceId === null ? {} : { invoiceId: options.invoiceId }),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      marketplace: true,
      invoiceId: true,
      qboSettlementJournalEntryId: true,
    },
  });

  const journalPlans: JournalPlan[] = [];
  for (const row of processingRows) {
    if (!isQboJournalEntryId(row.qboSettlementJournalEntryId)) continue;

    const fetched = await fetchJournalEntryById(connection, row.qboSettlementJournalEntryId);
    if (fetched.updatedConnection) connection = fetched.updatedConnection;

    const marketplace = row.marketplace as Marketplace;
    const targetMapping = targetMappingsByMarketplace.get(marketplace);
    if (!targetMapping) throw new Error(`Missing target mapping for ${marketplace}`);

    const journalPlan = planJournalRepair({
      marketplace,
      invoiceId: row.invoiceId,
      entry: fetched.journalEntry,
      targetMapping,
      accountById,
    });

    if (journalPlan.changedLines.length > 0 || journalPlan.unresolvedBrandAccounts.length > 0) {
      journalPlans.push(journalPlan);
    }
  }

  const configChanges = configPlans.filter((plan) => plan.changedKeys.length > 0);
  const journalChanges = journalPlans.filter((plan) => plan.changedLines.length > 0);
  const unresolved = journalPlans.flatMap((plan) =>
    plan.unresolvedBrandAccounts.map((line) => ({
      marketplace: plan.marketplace,
      invoiceId: plan.invoiceId,
      journalEntryId: plan.journalEntryId,
      ...line,
    })),
  );

  console.log(
    JSON.stringify(
      {
        mode: options.apply ? 'apply' : 'dry-run',
        scannedSettlementRows: processingRows.length,
        configChanges: configChanges.map((plan) => ({ marketplace: plan.marketplace, changedKeys: plan.changedKeys })),
        journalChanges: journalChanges.map((plan) => ({
          marketplace: plan.marketplace,
          invoiceId: plan.invoiceId,
          journalEntryId: plan.journalEntryId,
          docNumber: plan.docNumber,
          changedLines: plan.changedLines,
        })),
        unresolved,
      },
      null,
      2,
    ),
  );

  if (unresolved.length > 0) {
    process.exitCode = 1;
    return;
  }

  if (!options.apply) {
    await saveServerQboConnection(connection);
    return;
  }

  for (const plan of configChanges) {
    await db.settlementPostingConfig.update({
      where: { marketplace: plan.marketplace },
      data: { accountIdByMemo: plan.targetMapping },
    });
  }

  for (const plan of journalChanges) {
    const updated = await updateJournalEntryWithPayload(connection, plan.targetEntry);
    if (updated.updatedConnection) connection = updated.updatedConnection;
  }

  await saveServerQboConnection(connection);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
