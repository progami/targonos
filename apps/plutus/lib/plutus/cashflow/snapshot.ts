import 'server-only';

import { createLogger } from '@targon/logger';
import type { Prisma } from '@targon/prisma-plutus';

import { db } from '@/lib/db';
import { parseLmbSettlementDocNumber } from '@/lib/lmb/settlements';
import {
  fetchAccounts,
  fetchJournalEntries,
  fetchOpenBills,
  fetchOpenInvoices,
  fetchRecurringTransactions,
  type QboAccount,
  type QboConnection,
  type QboJournalEntry,
} from '@/lib/qbo/api';
import { getQboConnection } from '@/lib/qbo/connection-store';
import { addDays, startOfWeek, todayUtcDate } from '@/lib/plutus/cashflow/date';
import { buildCashflowForecast } from '@/lib/plutus/cashflow/forecast';
import {
  mapOpenBillsToEvents,
  mapOpenInvoicesToEvents,
  mapRecurringTransactionsToEvents,
} from '@/lib/plutus/cashflow/qbo-mappers';
import { buildProjectedSettlementEvents } from '@/lib/plutus/cashflow/settlement-projection';
import {
  CASHFLOW_HORIZON_WEEKS,
  type CashflowAccountInput,
  type CashflowEffectiveConfig,
  type CashflowEvent,
  type CashflowSnapshotPayload,
  type CashflowSettlementHistoryInput,
  type CashflowWarning,
} from '@/lib/plutus/cashflow/types';

const logger = createLogger({ name: 'plutus-cashflow-snapshot' });

const DEFAULT_CONFIG: CashflowEffectiveConfig = {
  cashAccountIds: [],
  weekStartsOn: 1,
  settlementLookbackDays: 180,
  settlementAverageCount: 4,
  settlementDefaultIntervalDays: 14,
  includeProjectedSettlements: true,
  includeOpenBills: true,
  includeOpenInvoices: true,
  includeRecurring: true,
  autoRefreshEnabled: true,
  autoRefreshTimeLocal: '06:00',
  autoRefreshMinSnapshotAgeMinutes: 720,
};

const SNAPSHOT_RETENTION = 30;

export class CashflowSnapshotError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type CashflowConfigRow = Awaited<ReturnType<typeof db.cashflowForecastConfig.findFirst>>;
type CashflowSnapshotRow = Awaited<ReturnType<typeof db.cashflowForecastSnapshot.findFirst>>;

function toEffectiveConfig(row: NonNullable<CashflowConfigRow>): CashflowEffectiveConfig {
  return {
    cashAccountIds: row.cashAccountIds,
    weekStartsOn: row.weekStartsOn,
    settlementLookbackDays: row.settlementLookbackDays,
    settlementAverageCount: row.settlementAverageCount,
    settlementDefaultIntervalDays: row.settlementDefaultIntervalDays,
    includeProjectedSettlements: row.includeProjectedSettlements,
    includeOpenBills: row.includeOpenBills,
    includeOpenInvoices: row.includeOpenInvoices,
    includeRecurring: row.includeRecurring,
    autoRefreshEnabled: row.autoRefreshEnabled,
    autoRefreshTimeLocal: row.autoRefreshTimeLocal,
    autoRefreshMinSnapshotAgeMinutes: row.autoRefreshMinSnapshotAgeMinutes,
  };
}

function toCents(amount: number | undefined): number {
  if (amount === undefined) {
    return 0;
  }
  return Math.round(amount * 100);
}

function mapAccountInput(account: QboAccount): CashflowAccountInput {
  return {
    id: account.Id,
    name: account.Name,
    accountType: account.AccountType,
    accountSubType: account.AccountSubType === undefined ? null : account.AccountSubType,
    active: account.Active !== false,
    currencyCode: account.CurrencyRef?.value === undefined ? null : account.CurrencyRef.value,
    currentBalanceCents: toCents(account.CurrentBalance),
  };
}

function buildCashImpactFromJournalEntry(input: {
  journalEntry: QboJournalEntry;
  cashAccountIdSet: Set<string>;
}): number | null {
  let total = 0;
  let found = false;

  for (const line of input.journalEntry.Line) {
    const accountId = line.JournalEntryLineDetail.AccountRef.value;
    if (!input.cashAccountIdSet.has(accountId)) {
      continue;
    }

    const amount = line.Amount;
    if (amount === undefined) {
      continue;
    }

    const signed = line.JournalEntryLineDetail.PostingType === 'Debit' ? amount : -amount;
    total += Math.round(signed * 100);
    found = true;
  }

  if (!found) {
    return null;
  }

  return total;
}

async function fetchSettlementHistoryForChannel(input: {
  connection: QboConnection;
  startDate: string;
  endDate: string;
  docNumberContains: string;
  channel: 'US' | 'UK';
  cashAccountIdSet: Set<string>;
  warnings: CashflowWarning[];
}): Promise<CashflowSettlementHistoryInput[]> {
  let activeConnection = input.connection;
  let startPosition = 1;
  const maxResults = 200;
  const rows: CashflowSettlementHistoryInput[] = [];

  while (true) {
    const result = await fetchJournalEntries(activeConnection, {
      startDate: input.startDate,
      endDate: input.endDate,
      docNumberContains: input.docNumberContains,
      maxResults,
      startPosition,
    });

    if (result.updatedConnection) {
      activeConnection = result.updatedConnection;
    }

    for (const journalEntry of result.journalEntries) {
      if (journalEntry.DocNumber === undefined) {
        input.warnings.push({
          code: 'SETTLEMENT_DOCNUMBER_MISSING',
          message: `Settlement journal entry ${journalEntry.Id} is missing DocNumber.`,
        });
        continue;
      }

      let periodEnd: string | null = null;
      try {
        const parsed = parseLmbSettlementDocNumber(journalEntry.DocNumber);
        periodEnd = parsed.periodEnd;
      } catch (error) {
        input.warnings.push({
          code: 'SETTLEMENT_DOCNUMBER_PARSE_FAILED',
          message: `Could not parse settlement doc number for journal entry ${journalEntry.Id}.`,
          detail: error instanceof Error ? error.message : String(error),
        });
      }

      rows.push({
        journalEntryId: journalEntry.Id,
        channel: input.channel,
        docNumber: journalEntry.DocNumber,
        txnDate: journalEntry.TxnDate,
        periodEnd,
        cashImpactCents: buildCashImpactFromJournalEntry({
          journalEntry,
          cashAccountIdSet: input.cashAccountIdSet,
        }),
      });
    }

    if (result.journalEntries.length === 0) {
      break;
    }

    if (startPosition + result.journalEntries.length > result.totalCount) {
      break;
    }

    startPosition += result.journalEntries.length;
  }

  return rows;
}

async function getOrCreateConfigRow(): Promise<NonNullable<CashflowConfigRow>> {
  const existing = await db.cashflowForecastConfig.findFirst();
  if (existing) {
    return existing;
  }

  return db.cashflowForecastConfig.create({
    data: {
      cashAccountIds: DEFAULT_CONFIG.cashAccountIds,
      weekStartsOn: DEFAULT_CONFIG.weekStartsOn,
      settlementLookbackDays: DEFAULT_CONFIG.settlementLookbackDays,
      settlementAverageCount: DEFAULT_CONFIG.settlementAverageCount,
      settlementDefaultIntervalDays: DEFAULT_CONFIG.settlementDefaultIntervalDays,
      includeProjectedSettlements: DEFAULT_CONFIG.includeProjectedSettlements,
      includeOpenBills: DEFAULT_CONFIG.includeOpenBills,
      includeOpenInvoices: DEFAULT_CONFIG.includeOpenInvoices,
      includeRecurring: DEFAULT_CONFIG.includeRecurring,
      autoRefreshEnabled: DEFAULT_CONFIG.autoRefreshEnabled,
      autoRefreshTimeLocal: DEFAULT_CONFIG.autoRefreshTimeLocal,
      autoRefreshMinSnapshotAgeMinutes: DEFAULT_CONFIG.autoRefreshMinSnapshotAgeMinutes,
    },
  });
}

export async function getOrCreateCashflowConfig(): Promise<CashflowEffectiveConfig> {
  const row = await getOrCreateConfigRow();
  return toEffectiveConfig(row);
}

export async function ensureCashflowConfigWithAccounts(accounts: QboAccount[]): Promise<{
  id: string;
  config: CashflowEffectiveConfig;
}> {
  let row = await getOrCreateConfigRow();

  if (row.cashAccountIds.length === 0) {
    const defaultCashAccounts = accounts
      .filter((account) => account.Active !== false && account.AccountType === 'Bank')
      .map((account) => account.Id);

    row = await db.cashflowForecastConfig.update({
      where: { id: row.id },
      data: {
        cashAccountIds: defaultCashAccounts,
      },
    });
  }

  return {
    id: row.id,
    config: toEffectiveConfig(row),
  };
}

export async function updateCashflowConfig(input: {
  cashAccountIds?: string[];
  weekStartsOn?: number;
  settlementLookbackDays?: number;
  settlementAverageCount?: number;
  settlementDefaultIntervalDays?: number;
  includeProjectedSettlements?: boolean;
  includeOpenBills?: boolean;
  includeOpenInvoices?: boolean;
  includeRecurring?: boolean;
  autoRefreshEnabled?: boolean;
  autoRefreshTimeLocal?: string;
  autoRefreshMinSnapshotAgeMinutes?: number;
}): Promise<CashflowEffectiveConfig> {
  const existing = await getOrCreateConfigRow();

  const data: {
    cashAccountIds?: string[];
    weekStartsOn?: number;
    settlementLookbackDays?: number;
    settlementAverageCount?: number;
    settlementDefaultIntervalDays?: number;
    includeProjectedSettlements?: boolean;
    includeOpenBills?: boolean;
    includeOpenInvoices?: boolean;
    includeRecurring?: boolean;
    autoRefreshEnabled?: boolean;
    autoRefreshTimeLocal?: string;
    autoRefreshMinSnapshotAgeMinutes?: number;
  } = {};

  if (input.cashAccountIds !== undefined) {
    data.cashAccountIds = input.cashAccountIds;
  }
  if (input.weekStartsOn !== undefined) {
    data.weekStartsOn = input.weekStartsOn;
  }
  if (input.settlementLookbackDays !== undefined) {
    data.settlementLookbackDays = input.settlementLookbackDays;
  }
  if (input.settlementAverageCount !== undefined) {
    data.settlementAverageCount = input.settlementAverageCount;
  }
  if (input.settlementDefaultIntervalDays !== undefined) {
    data.settlementDefaultIntervalDays = input.settlementDefaultIntervalDays;
  }
  if (input.includeProjectedSettlements !== undefined) {
    data.includeProjectedSettlements = input.includeProjectedSettlements;
  }
  if (input.includeOpenBills !== undefined) {
    data.includeOpenBills = input.includeOpenBills;
  }
  if (input.includeOpenInvoices !== undefined) {
    data.includeOpenInvoices = input.includeOpenInvoices;
  }
  if (input.includeRecurring !== undefined) {
    data.includeRecurring = input.includeRecurring;
  }
  if (input.autoRefreshEnabled !== undefined) {
    data.autoRefreshEnabled = input.autoRefreshEnabled;
  }
  if (input.autoRefreshTimeLocal !== undefined) {
    data.autoRefreshTimeLocal = input.autoRefreshTimeLocal;
  }
  if (input.autoRefreshMinSnapshotAgeMinutes !== undefined) {
    data.autoRefreshMinSnapshotAgeMinutes = input.autoRefreshMinSnapshotAgeMinutes;
  }

  const row = await db.cashflowForecastConfig.update({
    where: { id: existing.id },
    data,
  });

  return toEffectiveConfig(row);
}

function snapshotRowToPayload(snapshot: NonNullable<CashflowSnapshotRow>): CashflowSnapshotPayload {
  const config = snapshot.config as CashflowSnapshotPayload['config'];
  const inputs = snapshot.inputs as CashflowSnapshotPayload['inputs'];
  const forecast = snapshot.forecast as CashflowSnapshotPayload['forecast'];
  const warningsRaw = snapshot.warnings as CashflowWarning[] | null;

  let currencyCode = 'USD';
  const inputsCurrency = inputs.accounts[0]?.currencyCode;
  if (inputsCurrency) {
    currencyCode = inputsCurrency;
  }

  return {
    id: snapshot.id,
    createdAt: snapshot.createdAt.toISOString(),
    asOfDate: snapshot.asOfDate,
    currencyCode,
    config,
    inputs,
    forecast,
    warnings: warningsRaw === null ? [] : warningsRaw,
  };
}

export async function getLatestCashflowSnapshotPayload(): Promise<CashflowSnapshotPayload | null> {
  const latest = await db.cashflowForecastSnapshot.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!latest) {
    return null;
  }

  return snapshotRowToPayload(latest);
}

export async function getLatestCashflowSnapshotMeta(): Promise<{ asOfDate: string; createdAt: Date } | null> {
  const latest = await db.cashflowForecastSnapshot.findFirst({
    orderBy: { createdAt: 'desc' },
    select: {
      asOfDate: true,
      createdAt: true,
    },
  });

  if (!latest) {
    return null;
  }

  return latest;
}

export async function getCashflowSnapshotPayloadById(id: string): Promise<CashflowSnapshotPayload | null> {
  const snapshot = await db.cashflowForecastSnapshot.findUnique({
    where: { id },
  });

  if (!snapshot) {
    return null;
  }

  return snapshotRowToPayload(snapshot);
}

async function trimOldSnapshots(): Promise<void> {
  const oldSnapshots = await db.cashflowForecastSnapshot.findMany({
    orderBy: { createdAt: 'desc' },
    skip: SNAPSHOT_RETENTION,
    select: { id: true },
  });

  if (oldSnapshots.length === 0) {
    return;
  }

  await db.cashflowForecastSnapshot.deleteMany({
    where: {
      id: {
        in: oldSnapshots.map((row) => row.id),
      },
    },
  });
}

export function buildCashAccountCandidates(accounts: QboAccount[]): Array<{
  id: string;
  name: string;
  accountType: string;
  accountSubType: string | null;
  active: boolean;
  currencyCode: string | null;
  currentBalanceCents: number;
}> {
  return accounts
    .filter(
      (account) =>
        account.Active !== false
        && (
          account.AccountType === 'Bank'
          || account.AccountType === 'Credit Card'
          || account.AccountType === 'Other Current Asset'
        ),
    )
    .map((account) => ({
      id: account.Id,
      name: account.Name,
      accountType: account.AccountType,
      accountSubType: account.AccountSubType === undefined ? null : account.AccountSubType,
      active: account.Active !== false,
      currencyCode: account.CurrencyRef?.value === undefined ? null : account.CurrencyRef.value,
      currentBalanceCents: toCents(account.CurrentBalance),
    }));
}

export async function generateCashflowSnapshot(): Promise<CashflowSnapshotPayload> {
  const connection = await getQboConnection();
  if (!connection) {
    throw new CashflowSnapshotError('Not connected to QBO', 401);
  }

  const asOfDate = todayUtcDate();
  const warnings: CashflowWarning[] = [];

  const accountResult = await fetchAccounts(connection);
  const allAccounts = accountResult.accounts;
  const { config } = await ensureCashflowConfigWithAccounts(allAccounts);

  const cashAccountIdSet = new Set(config.cashAccountIds);
  const selectedCashAccounts = allAccounts.filter((account) => cashAccountIdSet.has(account.Id));

  if (selectedCashAccounts.length === 0) {
    warnings.push({
      code: 'NO_CASH_ACCOUNTS_SELECTED',
      message: 'No cash accounts are selected. Starting cash defaults to zero until accounts are selected.',
    });
  }

  for (const cashAccountId of config.cashAccountIds) {
    const found = allAccounts.some((account) => account.Id === cashAccountId);
    if (!found) {
      warnings.push({
        code: 'CASH_ACCOUNT_NOT_FOUND',
        message: `Configured cash account ${cashAccountId} was not found in QBO accounts.`,
      });
    }
  }

  let startingCashCents = 0;
  for (const account of selectedCashAccounts) {
    startingCashCents += toCents(account.CurrentBalance);
  }

  const selectedCurrencies = Array.from(
    new Set(
      selectedCashAccounts
        .map((account) => account.CurrencyRef?.value)
        .filter((value): value is string => value !== undefined),
    ),
  );

  let currencyCode = 'USD';
  const firstCurrency = selectedCurrencies[0];
  if (firstCurrency !== undefined) {
    currencyCode = firstCurrency;
  }

  if (selectedCurrencies.length > 1) {
    warnings.push({
      code: 'MULTI_CURRENCY_SELECTED_ACCOUNTS',
      message: 'Selected cash accounts contain multiple currencies; values are treated as home currency without conversion.',
      detail: selectedCurrencies.join(', '),
    });
  }

  const horizonStart = startOfWeek(asOfDate, config.weekStartsOn);
  const horizonEnd = addDays(horizonStart, CASHFLOW_HORIZON_WEEKS * 7 - 1);

  const openBillsPromise = (async () => {
    if (!config.includeOpenBills) {
      return { rows: [], events: [] };
    }

    try {
      const result = await fetchOpenBills(connection, { maxResults: 1000 });
      return mapOpenBillsToEvents({
        bills: result.bills,
        asOfDate,
        warnings,
      });
    } catch (error) {
      warnings.push({
        code: 'OPEN_BILLS_FETCH_FAILED',
        message: 'Failed to fetch open bills from QBO; continuing without open bills.',
        detail: error instanceof Error ? error.message : String(error),
      });
      return { rows: [], events: [] };
    }
  })();

  const openInvoicesPromise = (async () => {
    if (!config.includeOpenInvoices) {
      return { rows: [], events: [] };
    }

    try {
      const result = await fetchOpenInvoices(connection, { maxResults: 1000 });
      return mapOpenInvoicesToEvents({
        invoices: result.invoices,
        asOfDate,
        warnings,
      });
    } catch (error) {
      warnings.push({
        code: 'OPEN_INVOICES_FETCH_FAILED',
        message: 'Failed to fetch open invoices from QBO; continuing without open invoices.',
        detail: error instanceof Error ? error.message : String(error),
      });
      return { rows: [], events: [] };
    }
  })();

  const recurringPromise = (async () => {
    if (!config.includeRecurring) {
      return { rows: [], events: [] };
    }

    try {
      const result = await fetchRecurringTransactions(connection, { maxResults: 1000 });
      return mapRecurringTransactionsToEvents({
        recurringTransactions: result.recurringTransactions,
        horizonStart,
        horizonEnd,
        cashAccountIds: config.cashAccountIds,
        warnings,
      });
    } catch (error) {
      warnings.push({
        code: 'RECURRING_FETCH_FAILED',
        message: 'Failed to fetch recurring transactions from QBO; continuing without recurring transactions.',
        detail: error instanceof Error ? error.message : String(error),
      });
      return { rows: [], events: [] };
    }
  })();

  const settlementPromise = (async () => {
    if (!config.includeProjectedSettlements) {
      return { historyRows: [], projectedRows: [], projectedEvents: [] };
    }

    try {
      const lookbackStart = addDays(asOfDate, -config.settlementLookbackDays);
      const cashAccountIdSet = new Set(config.cashAccountIds);

      const [usRows, ukRows] = await Promise.all([
        fetchSettlementHistoryForChannel({
          connection,
          startDate: lookbackStart,
          endDate: asOfDate,
          docNumberContains: 'LMB-US-',
          channel: 'US',
          cashAccountIdSet,
          warnings,
        }),
        fetchSettlementHistoryForChannel({
          connection,
          startDate: lookbackStart,
          endDate: asOfDate,
          docNumberContains: 'LMB-UK-',
          channel: 'UK',
          cashAccountIdSet,
          warnings,
        }),
      ]);

      const historyRows = usRows.concat(ukRows);
      const projected = buildProjectedSettlementEvents({
        history: historyRows,
        asOfDate,
        forecastEndDate: horizonEnd,
        settlementAverageCount: config.settlementAverageCount,
        settlementDefaultIntervalDays: config.settlementDefaultIntervalDays,
        warnings,
      });

      return {
        historyRows,
        projectedRows: projected.rows,
        projectedEvents: projected.events,
      };
    } catch (error) {
      warnings.push({
        code: 'SETTLEMENT_HISTORY_FETCH_FAILED',
        message: 'Failed to fetch settlement history from QBO; continuing without projected settlements.',
        detail: error instanceof Error ? error.message : String(error),
      });
      return { historyRows: [], projectedRows: [], projectedEvents: [] };
    }
  })();

  const adjustmentsPromise = db.cashflowForecastAdjustment.findMany({
    where: {
      date: {
        gte: horizonStart,
        lte: horizonEnd,
      },
    },
    orderBy: {
      date: 'asc',
    },
  });

  const [openBillsResult, openInvoicesResult, recurringResult, settlementResult, adjustments] = await Promise.all([
    openBillsPromise,
    openInvoicesPromise,
    recurringPromise,
    settlementPromise,
    adjustmentsPromise,
  ]);

  const adjustmentEvents: CashflowEvent[] = adjustments.map((adjustment) => ({
    date: adjustment.date,
    amountCents: adjustment.amountCents,
    label: adjustment.description,
    source: 'manual_adjustment',
    meta: {
      id: adjustment.id,
      notes: adjustment.notes,
    },
  }));

  const events = [
    ...openBillsResult.events,
    ...openInvoicesResult.events,
    ...recurringResult.events,
    ...settlementResult.projectedEvents,
    ...adjustmentEvents,
  ];

  const forecast = buildCashflowForecast({
    asOfDate,
    weekStartsOn: config.weekStartsOn,
    horizonWeeks: CASHFLOW_HORIZON_WEEKS,
    startingCashCents,
    events,
  });

  const payload: CashflowSnapshotPayload = {
    asOfDate,
    currencyCode,
    config,
    inputs: {
      accounts: selectedCashAccounts.map(mapAccountInput),
      startingCashCents,
      openBills: openBillsResult.rows,
      openInvoices: openInvoicesResult.rows,
      recurringTransactions: recurringResult.rows,
      settlementHistory: settlementResult.historyRows,
      projectedSettlements: settlementResult.projectedRows,
      adjustments: adjustments.map((adjustment) => ({
        id: adjustment.id,
        date: adjustment.date,
        amountCents: adjustment.amountCents,
        description: adjustment.description,
        notes: adjustment.notes,
      })),
    },
    forecast,
    warnings,
  };

  const created = await db.cashflowForecastSnapshot.create({
    data: {
      asOfDate,
      config: payload.config as Prisma.InputJsonValue,
      inputs: payload.inputs as Prisma.InputJsonValue,
      forecast: payload.forecast as Prisma.InputJsonValue,
      warnings: payload.warnings.length === 0 ? undefined : (payload.warnings as Prisma.InputJsonValue),
    },
  });

  await trimOldSnapshots();

  logger.info('Cashflow snapshot generated', {
    snapshotId: created.id,
    warningsCount: warnings.length,
    eventCount: events.length,
  });

  return {
    ...payload,
    id: created.id,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function generateAndPersistCashflowSnapshot(): Promise<CashflowSnapshotPayload> {
  return generateCashflowSnapshot();
}
