import { promises as fs } from 'node:fs';

import {
  buildQboJournalEntriesFromUkSettlementDraft,
  type UkSettlementAuditRowDraft,
  type UkSettlementDraft,
} from '@/lib/amazon-finances/uk-settlement-builder';
import {
  buildSettlementAuditCsvBytes,
  buildSettlementAuditFilename,
  buildSettlementFullAuditTrailCsvBytes,
  buildSettlementFullAuditTrailFilename,
  buildSettlementMtdDailySummaryCsvBytes,
  buildSettlementMtdDailySummaryFilename,
} from '@/lib/amazon-finances/settlement-evidence';
import {
  SPLIT_MONTH_ROLLOVER_PREV_MEMO,
  SPLIT_MONTH_ROLLOVER_THIS_MEMO,
  applySplitMonthRollovers,
  buildMonthlySettlementSegments,
} from '@/lib/amazon-finances/settlement-splitting';
import { fromCents } from '@/lib/inventory/money';
import {
  buildCanonicalSettlementDocNumber,
  buildPlutusSettlementDocNumber,
  isSettlementDocNumber,
  normalizeSettlementDocNumber,
  parseSettlementDocNumber,
  stripPlutusDocPrefix,
} from '@/lib/plutus/settlement-doc-number';
import type { ProcessingBlock } from '@/lib/plutus/settlement-types';
import { isBlockingProcessingBlock } from '@/lib/plutus/settlement-types';
import {
  buildPrincipalGroupsByDate,
  isRefundPrincipal,
  isSalePrincipal,
  matchRefundsToSales,
  normalizeSku,
  type ExistingReturnLayer,
  type RefundSaleLayer,
} from '@/lib/plutus/settlement-validation';
import {
  createJournalEntry,
  deleteJournalEntry,
  fetchAccounts,
  fetchExchangeRate,
  fetchJournalEntries,
  fetchJournalEntryById,
  fetchPreferences,
  findJournalEntryAttachmentIdByFileName,
  type QboConnection,
  type QboJournalEntry,
  uploadJournalEntryAttachment,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

type CliOptions = {
  startDate: string;
  endDate: string | undefined;
  plutusEnvPath: string;
  fundTransferStatusOverrides: Map<string, 'Succeeded' | 'Failed' | 'Unknown'>;
  apply: boolean;
};

type MemoMappingEntry = { accountId: string; taxCodeId: string | null };

type TargetKind = 'settlement' | 'cogs' | 'pnl' | 'unknown';

type DeletionTarget = {
  journalEntryId: string;
  txnDate: string | null;
  docNumber: string | null;
  kind: TargetKind;
  source: 'qbo-search' | 'db-processing' | 'db-rollback';
  existsInQbo: boolean;
};

type SourceAuditRow = {
  market: string;
  date: string;
  orderId: string;
  sku: string;
  quantity: number;
  description: string;
  net: number;
};

type RebuildSource = {
  sourceInvoiceId: string;
  settlementDocNumber: string;
  settlementJournalEntryId: string;
  sourceFilename: string;
  fundTransferStatus: 'Succeeded' | 'Failed' | 'Unknown';
  originalTotalCents: number;
  sourceAuditRows: SourceAuditRow[];
};

type ValidationSegmentResult = {
  sourceInvoiceId: string;
  docNumber: string;
  ok: boolean;
  blockingBlocks: ProcessingBlock[];
  nonBlockingBlocks: ProcessingBlock[];
};

let dbClient: typeof import('@/lib/db').db | null = null;
let processSettlementFn: typeof import('@/lib/plutus/settlement-processing').processSettlement | null = null;

function requireDb() {
  if (dbClient === null) {
    throw new Error('DB client not loaded');
  }
  return dbClient;
}

function requireProcessSettlement() {
  if (processSettlementFn === null) {
    throw new Error('Settlement processor not loaded');
  }
  return processSettlementFn;
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

async function loadPlutusEnvFile(filePath: string): Promise<void> {
  const raw = await fs.readFile(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line);
    if (!parsed) continue;
    const isPlutus = parsed.key === 'DATABASE_URL' || parsed.key.startsWith('QBO_') || parsed.key.startsWith('PLUTUS_');
    if (!isPlutus) continue;
    process.env[parsed.key] = parsed.value;
  }
}

function requireIsoDay(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return trimmed;
}

function parseArgs(argv: string[]): CliOptions {
  let startDate = '2025-12-01';
  let endDate: string | undefined;
  let plutusEnvPath = '.env.local';
  const fundTransferStatusOverrides = new Map<string, 'Succeeded' | 'Failed' | 'Unknown'>();
  let apply = false;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === '--start-date') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --start-date');
      startDate = next;
      i += 2;
      continue;
    }

    if (arg === '--end-date') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --end-date');
      endDate = next;
      i += 2;
      continue;
    }

    if (arg === '--plutus-env') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --plutus-env');
      plutusEnvPath = next;
      i += 2;
      continue;
    }

    if (arg === '--fund-transfer-status-overrides') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --fund-transfer-status-overrides');
      for (const entry of next.split(',')) {
        const trimmed = entry.trim();
        if (trimmed === '') continue;
        const equalsIndex = trimmed.indexOf('=');
        if (equalsIndex === -1) {
          throw new Error(`Invalid fund transfer status override: ${trimmed}`);
        }
        const invoiceId = trimmed.slice(0, equalsIndex).trim();
        const statusRaw = trimmed.slice(equalsIndex + 1).trim();
        if (invoiceId === '') {
          throw new Error(`Invalid fund transfer status override: ${trimmed}`);
        }
        if (statusRaw !== 'Succeeded' && statusRaw !== 'Failed' && statusRaw !== 'Unknown') {
          throw new Error(`Invalid fund transfer status override for ${invoiceId}: ${statusRaw}`);
        }
        fundTransferStatusOverrides.set(invoiceId, statusRaw);
      }
      i += 2;
      continue;
    }

    if (arg === '--apply') {
      apply = true;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { startDate, endDate, plutusEnvPath, fundTransferStatusOverrides, apply };
}

function buildQboJournalHref(journalEntryId: string): string {
  return `https://app.qbo.intuit.com/app/journal?txnId=${journalEntryId}`;
}

function isNoopJournalEntryId(value: string): boolean {
  return value.trim().startsWith('NOOP-');
}

function classifyDocNumber(docNumber: string): TargetKind {
  const trimmed = docNumber.trim();
  if (trimmed === '') return 'unknown';

  const stripped = stripPlutusDocPrefix(trimmed);
  const first = stripped[0] ? stripped[0].toUpperCase() : '';
  if (first === 'C') return 'cogs';
  if (first === 'P') return 'pnl';

  if (!isSettlementDocNumber(stripped)) return 'unknown';

  const meta = parseSettlementDocNumber(stripped);
  if (meta.marketplace.id !== 'amazon.co.uk') return 'unknown';
  return 'settlement';
}

function toIsoStart(startDate: string): Date {
  return new Date(`${startDate}T00:00:00.000Z`);
}

function toIsoEnd(endDate: string | undefined): Date {
  if (endDate !== undefined) {
    return new Date(`${endDate}T23:59:59.999Z`);
  }
  return new Date();
}

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Failed to fetch journal entry: 404')) return true;
  if (message.includes('Failed to delete journal entry: 404')) return true;
  if (message.includes('Object Not Found')) return true;
  if (message.includes('"code":"610"')) return true;
  return false;
}

function addCents(map: Map<string, number>, key: string, cents: number): void {
  if (cents === 0) return;
  const current = map.get(key);
  map.set(key, (current === undefined ? 0 : current) + cents);
}

function sumMap(map: Map<string, number>): number {
  let total = 0;
  for (const cents of map.values()) total += cents;
  return total;
}

function inferFundTransferStatus(settlementJe: QboJournalEntry): 'Succeeded' | 'Failed' | 'Unknown' {
  for (const line of settlementJe.Line) {
    const description = typeof line.Description === 'string' ? line.Description.trim() : '';
    if (description === 'Transfer to Bank') return 'Succeeded';
    const match = /^Settlement Control \(FundTransferStatus=(Succeeded|Failed|Unknown)\)$/.exec(description);
    if (match) {
      return match[1] as 'Succeeded' | 'Failed' | 'Unknown';
    }
  }
  return 'Unknown';
}

function requireMemoMapping(value: unknown): Record<string, MemoMappingEntry> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Settlement memo mapping must be an object');
  }

  const obj = value as Record<string, unknown>;
  const result: Record<string, MemoMappingEntry> = {};

  for (const [memo, raw] of Object.entries(obj)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error(`Invalid memo mapping entry: ${memo} (import from QBO to populate tax codes)`);
    }

    const entry = raw as Record<string, unknown>;
    const accountIdRaw = entry.accountId;
    if (typeof accountIdRaw !== 'string' || accountIdRaw.trim() === '') {
      throw new Error(`Invalid account id for memo mapping: ${memo}`);
    }
    const accountId = accountIdRaw.trim();

    if (!Object.prototype.hasOwnProperty.call(entry, 'taxCodeId')) {
      throw new Error(`Missing taxCodeId for memo mapping: ${memo} (import from QBO to populate tax codes)`);
    }

    const taxRaw = entry.taxCodeId;
    let taxCodeId: string | null = null;
    if (taxRaw === null) {
      taxCodeId = null;
    } else if (typeof taxRaw === 'string') {
      const trimmed = taxRaw.trim();
      if (trimmed === '') {
        throw new Error(`Invalid taxCodeId for memo mapping: ${memo}`);
      }
      taxCodeId = trimmed;
    } else {
      throw new Error(`Invalid taxCodeId for memo mapping: ${memo}`);
    }

    result[memo] = { accountId, taxCodeId };
  }

  return result;
}

async function loadUkSettlementPostingMapping(input: {
  requiredMemos: Set<string>;
  needBankAccount: boolean;
  needPaymentAccount: boolean;
}): Promise<{
  accountIdByMemo: Map<string, string>;
  taxCodeIdByMemo: Map<string, string | null>;
  bankAccountId: string;
  paymentAccountId: string;
}> {
  const db = requireDb();
  const config = await db.settlementPostingConfig.findUnique({ where: { marketplace: 'amazon.co.uk' } });
  if (!config) {
    throw new Error('Missing settlement mapping: configure Settlement Mapping first');
  }

  const bankAccountId = config.bankAccountId ? config.bankAccountId.trim() : '';
  const paymentAccountId = config.paymentAccountId ? config.paymentAccountId.trim() : '';

  const memoMapping = requireMemoMapping(config.accountIdByMemo);
  const accountIdByMemo = new Map<string, string>();
  const taxCodeIdByMemo = new Map<string, string | null>();
  for (const [memo, entry] of Object.entries(memoMapping)) {
    accountIdByMemo.set(memo, entry.accountId);
    taxCodeIdByMemo.set(memo, entry.taxCodeId);
  }

  const missingMemos = Array.from(input.requiredMemos).filter((memo) => !accountIdByMemo.has(memo)).sort();
  if (missingMemos.length > 0) {
    throw new Error(`Missing account mappings for memos: ${missingMemos.join(' | ')}`);
  }

  const missingTaxMemos = Array.from(input.requiredMemos).filter((memo) => !taxCodeIdByMemo.has(memo)).sort();
  if (missingTaxMemos.length > 0) {
    throw new Error(`Missing tax mappings for memos: ${missingTaxMemos.join(' | ')}`);
  }

  if (input.needBankAccount && bankAccountId === '') {
    throw new Error("Missing 'Transfer to Bank' account id (configure it in Settlement Mapping)");
  }
  if (input.needPaymentAccount && paymentAccountId === '') {
    throw new Error("Missing 'Payment to Amazon' account id (configure it in Settlement Mapping)");
  }

  return {
    accountIdByMemo,
    taxCodeIdByMemo,
    bankAccountId,
    paymentAccountId,
  };
}

async function validateUkSettlementCashAccountCurrencies(input: {
  connection: QboConnection;
  needBankAccount: boolean;
  needPaymentAccount: boolean;
  bankAccountId: string;
  paymentAccountId: string;
  homeCurrencyCode: string;
}): Promise<{ updatedConnection?: QboConnection; settlementControlAccountId: string }> {
  const accountsResult = await fetchAccounts(input.connection, { includeInactive: true });
  const accountById = new Map(accountsResult.accounts.map((account) => [account.Id, account]));

  function requireAccountCurrency(accountId: string, role: 'Transfer to Bank' | 'Payment to Amazon', expectedCurrency: string): void {
    const account = accountById.get(accountId);
    if (!account) {
      throw new Error(`Settlement mapping account not found in QBO for ${role}: ${accountId}`);
    }

    const currency = account.CurrencyRef?.value ? account.CurrencyRef.value.trim().toUpperCase() : '';
    if (currency === '') {
      throw new Error(`Settlement mapping account currency missing for ${role}: ${accountId} (${account.Name})`);
    }
    if (currency !== expectedCurrency) {
      throw new Error(
        `Settlement mapping currency mismatch for ${role}: expected ${expectedCurrency} account, got ${currency} (${account.Name} / ${accountId})`,
      );
    }
  }

  if (input.needBankAccount) {
    requireAccountCurrency(input.bankAccountId, 'Transfer to Bank', 'GBP');
  }
  if (input.needPaymentAccount) {
    const expected = input.homeCurrencyCode.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(expected)) {
      throw new Error(`Missing home currency for settlement mapping validation: ${input.homeCurrencyCode}`);
    }
    requireAccountCurrency(input.paymentAccountId, 'Payment to Amazon', expected);
  }

  const settlementControlMatches = accountsResult.accounts.filter(
    (account) => account.Name.trim().toLowerCase() === 'plutus settlement control',
  );
  if (settlementControlMatches.length !== 1) {
    throw new Error(
      `Missing or ambiguous QBO account for settlement control (expected exactly one named "Plutus Settlement Control", found ${settlementControlMatches.length})`,
    );
  }

  const settlementControl = settlementControlMatches[0]!;
  const settlementControlCurrency = settlementControl.CurrencyRef?.value
    ? settlementControl.CurrencyRef.value.trim().toUpperCase()
    : '';
  const expectedControlCurrency = input.homeCurrencyCode.trim().toUpperCase();
  if (settlementControlCurrency === '' || settlementControlCurrency !== expectedControlCurrency) {
    throw new Error(
      `Settlement control account currency mismatch: expected ${expectedControlCurrency}, got ${settlementControlCurrency} (${settlementControl.Name} / ${settlementControl.Id})`,
    );
  }

  return { updatedConnection: accountsResult.updatedConnection, settlementControlAccountId: settlementControl.Id };
}

function isCanonicalSettlementDocNumber(docNumber: string): boolean {
  const trimmedUpper = docNumber.trim().toUpperCase();
  if (!isSettlementDocNumber(trimmedUpper)) return false;
  return trimmedUpper === normalizeSettlementDocNumber(trimmedUpper);
}

function pickPreferredSettlementEntry(a: QboJournalEntry, b: QboJournalEntry): QboJournalEntry {
  const aDocNumber = a.DocNumber ? a.DocNumber : '';
  const bDocNumber = b.DocNumber ? b.DocNumber : '';

  const aCanonical = isCanonicalSettlementDocNumber(aDocNumber);
  const bCanonical = isCanonicalSettlementDocNumber(bDocNumber);

  if (aCanonical && !bCanonical) return a;
  if (bCanonical && !aCanonical) return b;

  const aTxnDate = a.TxnDate ? a.TxnDate : '';
  const bTxnDate = b.TxnDate ? b.TxnDate : '';
  if (aTxnDate !== bTxnDate) {
    return aTxnDate > bTxnDate ? a : b;
  }

  return a.Id > b.Id ? a : b;
}

async function findExistingJournalEntryIdByDocNumber(
  connection: QboConnection,
  docNumber: string,
): Promise<{ journalEntryId: string | null; updatedConnection?: QboConnection }> {
  let activeConnection = connection;
  const existing = await fetchJournalEntries(activeConnection, {
    docNumberContains: docNumber,
    maxResults: 10,
    startPosition: 1,
  });
  if (existing.updatedConnection) {
    activeConnection = existing.updatedConnection;
  }

  const normalizedTarget = normalizeSettlementDocNumber(docNumber);
  const matches = existing.journalEntries.filter((je) => {
    const candidateDocNumber = je.DocNumber;
    if (typeof candidateDocNumber !== 'string') return false;
    if (!isSettlementDocNumber(candidateDocNumber)) return false;
    return normalizeSettlementDocNumber(candidateDocNumber) === normalizedTarget;
  });

  if (matches.length === 0) {
    return { journalEntryId: null, updatedConnection: activeConnection === connection ? undefined : activeConnection };
  }

  let selected = matches[0]!;
  for (const candidate of matches.slice(1)) {
    selected = pickPreferredSettlementEntry(selected, candidate);
  }

  return { journalEntryId: selected.Id, updatedConnection: activeConnection === connection ? undefined : activeConnection };
}

async function ensureJournalEntryHasSettlementEvidenceAttachments(
  connection: QboConnection,
  input: {
    journalEntryId: string;
    docNumber: string;
    startIsoDay: string;
    endIsoDay: string;
    auditRows: UkSettlementAuditRowDraft[];
    accountIdByMemo: ReadonlyMap<string, string>;
    taxCodeIdByMemo: ReadonlyMap<string, string | null>;
  },
): Promise<{ updatedConnection?: QboConnection }> {
  const attachments = [
    {
      fileName: buildSettlementAuditFilename(input.docNumber),
      buildBytes: () => buildSettlementAuditCsvBytes(input.auditRows),
    },
    {
      fileName: buildSettlementFullAuditTrailFilename(input.docNumber),
      buildBytes: () =>
        buildSettlementFullAuditTrailCsvBytes({
          invoiceId: input.docNumber,
          countryCode: 'GB',
          accountIdByMemo: input.accountIdByMemo,
          taxCodeIdByMemo: input.taxCodeIdByMemo,
          rows: input.auditRows,
        }),
    },
    {
      fileName: buildSettlementMtdDailySummaryFilename(input.docNumber),
      buildBytes: () =>
        buildSettlementMtdDailySummaryCsvBytes({
          marketplaceName: 'Amazon.co.uk',
          currencyCode: 'GBP',
          startIsoDay: input.startIsoDay,
          endIsoDay: input.endIsoDay,
          accountIdByMemo: input.accountIdByMemo,
          taxCodeIdByMemo: input.taxCodeIdByMemo,
          rows: input.auditRows,
        }),
    },
  ];

  let activeConnection = connection;
  for (const attachment of attachments) {
    const existingLookup = await findJournalEntryAttachmentIdByFileName(activeConnection, {
      journalEntryId: input.journalEntryId,
      fileName: attachment.fileName,
    });
    if (existingLookup.updatedConnection) {
      activeConnection = existingLookup.updatedConnection;
    }

    if (existingLookup.attachableId !== null) continue;

    const uploadResult = await uploadJournalEntryAttachment(activeConnection, {
      journalEntryId: input.journalEntryId,
      fileName: attachment.fileName,
      contentType: 'text/csv',
      bytes: attachment.buildBytes(),
    });
    if (uploadResult.updatedConnection) {
      activeConnection = uploadResult.updatedConnection;
    }
  }

  return { updatedConnection: activeConnection === connection ? undefined : activeConnection };
}

async function collectRebuildSources(input: {
  connection: QboConnection;
  fundTransferStatusOverrides: ReadonlyMap<string, 'Succeeded' | 'Failed' | 'Unknown'>;
  processingRows: Array<{
    invoiceId: string;
    settlementDocNumber: string;
    qboSettlementJournalEntryId: string;
    sourceFilename: string;
  }>;
}): Promise<{ sources: RebuildSource[]; updatedConnection?: QboConnection }> {
  let activeConnection = input.connection;
  const db = requireDb();
  const sources: RebuildSource[] = [];

  for (const row of input.processingRows) {
    const auditRows = await db.auditDataRow.findMany({
      where: {
        invoiceId: row.invoiceId,
        OR: [
          { market: { equals: 'uk', mode: 'insensitive' } },
          { market: { contains: 'amazon.co.uk', mode: 'insensitive' } },
        ],
      },
      select: {
        market: true,
        date: true,
        orderId: true,
        sku: true,
        quantity: true,
        description: true,
        net: true,
      },
      orderBy: [
        { date: 'asc' },
        { orderId: 'asc' },
        { sku: 'asc' },
        { description: 'asc' },
      ],
    });
    if (auditRows.length === 0) {
      throw new Error(`Missing audit rows for source invoice ${row.invoiceId}`);
    }

    let originalTotalCents = 0;
    for (const auditRow of auditRows) {
      originalTotalCents += auditRow.net;
    }

    let fundTransferStatus: 'Succeeded' | 'Failed' | 'Unknown';
    try {
      const settlementJe = await fetchJournalEntryById(activeConnection, row.qboSettlementJournalEntryId);
      if (settlementJe.updatedConnection) {
        activeConnection = settlementJe.updatedConnection;
      }
      fundTransferStatus = inferFundTransferStatus(settlementJe.journalEntry);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      const override = input.fundTransferStatusOverrides.get(row.invoiceId);
      if (!override) {
        throw new Error(
          `Missing source settlement JE ${row.qboSettlementJournalEntryId} for ${row.invoiceId}. Provide --fund-transfer-status-overrides ${row.invoiceId}=Succeeded|Failed|Unknown`,
        );
      }
      fundTransferStatus = override;
    }

    sources.push({
      sourceInvoiceId: row.invoiceId,
      settlementDocNumber: row.settlementDocNumber,
      settlementJournalEntryId: row.qboSettlementJournalEntryId,
      sourceFilename: row.sourceFilename,
      fundTransferStatus,
      originalTotalCents,
      sourceAuditRows: auditRows,
    });
  }

  return { sources, updatedConnection: activeConnection === input.connection ? undefined : activeConnection };
}

function buildUkDraftFromAuditSource(source: RebuildSource): UkSettlementDraft {
  const meta = parseSettlementDocNumber(source.sourceInvoiceId);
  if (meta.marketplace.id !== 'amazon.co.uk' || meta.periodStart === null || meta.periodEnd === null) {
    throw new Error(`Source invoice is not a UK settlement doc number: ${source.sourceInvoiceId}`);
  }

  const segments = buildMonthlySettlementSegments<UkSettlementAuditRowDraft>({
    startIsoDay: meta.periodStart,
    endIsoDay: meta.periodEnd,
    buildDocNumber: ({ startIsoDay, endIsoDay, seq }) =>
      buildCanonicalSettlementDocNumber({ region: 'UK', startIsoDay, endIsoDay, seq }),
  });

  const segmentByYearMonth = new Map<string, UkSettlementDraft['segments'][number]>();
  for (const segment of segments) {
    segmentByYearMonth.set(segment.yearMonth, segment);
  }

  for (const row of source.sourceAuditRows) {
    const yearMonth = row.date.slice(0, 7);
    const segment = segmentByYearMonth.get(yearMonth);
    if (!segment) {
      throw new Error(`Audit row date ${row.date} falls outside settlement months for ${source.sourceInvoiceId}`);
    }

    const description = row.description.trim();
    if (description === '') {
      throw new Error(`Audit row description is empty for ${source.sourceInvoiceId}`);
    }

    addCents(segment.memoTotalsCents, description, row.net);
    segment.auditRows.push({
      invoiceId: segment.docNumber,
      market: 'uk',
      date: row.date,
      orderId: row.orderId,
      sku: row.sku,
      quantity: row.quantity,
      description,
      netCents: row.net,
    });
  }

  let totalEventCents = 0;
  for (const segment of segments) {
    totalEventCents += sumMap(segment.memoTotalsCents);
  }
  if (totalEventCents !== source.originalTotalCents) {
    throw new Error(`Source settlement totals mismatch for ${source.sourceInvoiceId}: rows=${totalEventCents} vs source=${source.originalTotalCents}`);
  }

  applySplitMonthRollovers({ segments, addCents, sumMap });

  return {
    settlementId: source.sourceInvoiceId,
    eventGroupId: source.settlementJournalEntryId,
    timeZone: 'Europe/London',
    originalTotalCents: source.originalTotalCents,
    fundTransferStatus: source.fundTransferStatus,
    segments,
  };
}

async function validateRebuildDrafts(input: {
  rebuildDrafts: Array<{ source: RebuildSource; draft: UkSettlementDraft }>;
  processingRows: Array<{ id: string }>;
}): Promise<ValidationSegmentResult[]> {
  const db = requireDb();
  const excludedProcessingIds = input.processingRows.map((row) => row.id);

  const historicalSalesFromDb = await db.orderSale.findMany({
    where: {
      marketplace: 'amazon.co.uk',
      ...(excludedProcessingIds.length > 0 ? { NOT: { settlementProcessingId: { in: excludedProcessingIds } } } : {}),
    },
    select: {
      orderId: true,
      sku: true,
      saleDate: true,
      quantity: true,
      principalCents: true,
      costManufacturingCents: true,
      costFreightCents: true,
      costDutyCents: true,
      costMfgAccessoriesCents: true,
    },
    orderBy: [{ saleDate: 'asc' }, { orderId: 'asc' }, { sku: 'asc' }],
  });

  const historicalReturnsFromDb = await db.orderReturn.findMany({
    where: {
      marketplace: 'amazon.co.uk',
      ...(excludedProcessingIds.length > 0 ? { NOT: { settlementProcessingId: { in: excludedProcessingIds } } } : {}),
    },
    select: {
      orderId: true,
      sku: true,
      returnDate: true,
      quantity: true,
    },
    orderBy: [{ returnDate: 'asc' }, { orderId: 'asc' }, { sku: 'asc' }],
  });

  const simulatedHistoricalSales: RefundSaleLayer[] = historicalSalesFromDb.map((sale) => ({
    orderId: sale.orderId,
    sku: normalizeSku(sale.sku),
    date: sale.saleDate.toISOString().slice(0, 10),
    quantity: sale.quantity,
    principalCents: sale.principalCents,
    costByComponentCents: {
      manufacturing: sale.costManufacturingCents,
      freight: sale.costFreightCents,
      duty: sale.costDutyCents,
      mfgAccessories: sale.costMfgAccessoriesCents,
    },
  }));

  const simulatedHistoricalReturns: ExistingReturnLayer[] = historicalReturnsFromDb.map((ret) => ({
    orderId: ret.orderId,
    sku: normalizeSku(ret.sku),
    date: ret.returnDate.toISOString().slice(0, 10),
    quantity: ret.quantity,
  }));

  const results: ValidationSegmentResult[] = [];

  for (const entry of input.rebuildDrafts) {
    for (const segment of entry.draft.segments) {
      const rows = segment.auditRows.map((row) => ({
        invoiceId: row.invoiceId,
        market: row.market,
        date: row.date,
        orderId: row.orderId,
        sku: row.sku,
        quantity: row.quantity,
        description: row.description,
        net: fromCents(row.netCents),
      }));

      const blocks: ProcessingBlock[] = [];
      const saleGroups = buildPrincipalGroupsByDate(rows, isSalePrincipal);
      const refundGroups = buildPrincipalGroupsByDate(rows, isRefundPrincipal);

      const historicalSaleKeys = new Set(simulatedHistoricalSales.map((sale) => `${sale.orderId}::${sale.sku}`));
      const historicalRefundGroups = new Map<string, { orderId: string; sku: string; date: string; quantity: number; principalCents: number }>();
      const currentSettlementRefundGroups = new Map<string, { orderId: string; sku: string; date: string; quantity: number; principalCents: number }>();

      for (const [refundKey, refund] of refundGroups.entries()) {
        const key = `${refund.orderId}::${refund.sku}`;
        if (historicalSaleKeys.has(key)) {
          historicalRefundGroups.set(refundKey, refund);
          continue;
        }
        currentSettlementRefundGroups.set(refundKey, refund);
      }

      const matchedReturnsFromHistory =
        historicalRefundGroups.size === 0
          ? []
          : matchRefundsToSales(historicalRefundGroups, simulatedHistoricalSales, simulatedHistoricalReturns, blocks);

      const currentSettlementSaleLayers: RefundSaleLayer[] = Array.from(saleGroups.values()).map((sale) => ({
        orderId: sale.orderId,
        sku: sale.sku,
        date: sale.date,
        quantity: Math.abs(sale.quantity),
        principalCents: sale.principalCents,
        costByComponentCents: {
          manufacturing: 0,
          freight: 0,
          duty: 0,
          mfgAccessories: 0,
        },
      }));

      const matchedReturnsFromCurrentSettlement =
        currentSettlementRefundGroups.size === 0
          ? []
          : matchRefundsToSales(currentSettlementRefundGroups, currentSettlementSaleLayers, [], blocks, {
              allowFutureSales: true,
            });

      const blockingBlocks = blocks.filter((block) => isBlockingProcessingBlock(block));
      const nonBlockingBlocks = blocks.filter((block) => !isBlockingProcessingBlock(block));

      results.push({
        sourceInvoiceId: entry.source.sourceInvoiceId,
        docNumber: segment.docNumber,
        ok: blockingBlocks.length === 0,
        blockingBlocks,
        nonBlockingBlocks,
      });

      if (blockingBlocks.length > 0) {
        return results;
      }

      simulatedHistoricalSales.push(...currentSettlementSaleLayers);
      simulatedHistoricalReturns.push(
        ...matchedReturnsFromHistory.map((ret) => ({
          orderId: ret.orderId,
          sku: ret.sku,
          date: ret.date,
          quantity: ret.quantity,
        })),
        ...matchedReturnsFromCurrentSettlement.map((ret) => ({
          orderId: ret.orderId,
          sku: ret.sku,
          date: ret.date,
          quantity: ret.quantity,
        })),
      );
    }
  }

  return results;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const startDate = requireIsoDay(options.startDate, 'startDate');
  const endDate = options.endDate === undefined ? undefined : requireIsoDay(options.endDate, 'endDate');

  await loadPlutusEnvFile(options.plutusEnvPath);

  ({ db: dbClient } = await import('@/lib/db'));
  ({ processSettlement: processSettlementFn } = await import('@/lib/plutus/settlement-processing'));

  const db = requireDb();
  const processSettlement = requireProcessSettlement();

  const connection = await getQboConnection();
  if (!connection) {
    throw new Error('Not connected to QBO');
  }
  let activeConnection = connection;

  const rangeStart = toIsoStart(startDate);
  const rangeEnd = toIsoEnd(endDate);

  const processingRows = await db.settlementProcessing.findMany({
    where: {
      marketplace: 'amazon.co.uk',
      settlementDocNumber: { contains: 'UK-' },
      settlementPostedDate: { gte: rangeStart, lte: rangeEnd },
    },
    select: {
      id: true,
      invoiceId: true,
      settlementDocNumber: true,
      qboSettlementJournalEntryId: true,
      qboCogsJournalEntryId: true,
      qboPnlReclassJournalEntryId: true,
      sourceFilename: true,
    },
    orderBy: [
      { settlementPostedDate: 'asc' },
      { invoiceId: 'asc' },
    ],
  });

  const rollbackRows = await db.settlementRollback.findMany({
    where: {
      marketplace: 'amazon.co.uk',
      settlementDocNumber: { contains: 'UK-' },
      settlementPostedDate: { gte: rangeStart, lte: rangeEnd },
    },
    select: {
      id: true,
      invoiceId: true,
      settlementDocNumber: true,
      qboSettlementJournalEntryId: true,
      qboCogsJournalEntryId: true,
      qboPnlReclassJournalEntryId: true,
    },
  });

  const collected = await collectRebuildSources({
    connection: activeConnection,
    fundTransferStatusOverrides: options.fundTransferStatusOverrides,
    processingRows,
  });
  if (collected.updatedConnection) {
    activeConnection = collected.updatedConnection;
  }
  const rebuildSources = collected.sources;
  const rebuildDrafts = rebuildSources.map((source) => ({ source, draft: buildUkDraftFromAuditSource(source) }));
  const validationResults = await validateRebuildDrafts({ rebuildDrafts, processingRows });
  const validationFailed = validationResults.some((result) => !result.ok);

  const invoiceIdsToDelete = new Set<string>();
  const auditUploadsMaybeEmpty = new Set<string>();

  for (const row of processingRows) {
    invoiceIdsToDelete.add(row.invoiceId);
    invoiceIdsToDelete.add(row.settlementDocNumber);
  }

  for (const row of rollbackRows) {
    invoiceIdsToDelete.add(row.invoiceId);
    invoiceIdsToDelete.add(row.settlementDocNumber);
  }

  const qboSearchResults: Array<{ id: string; txnDate: string; docNumber: string }> = [];

  let startPosition = 1;
  const queryPageSize = 100;
  while (true) {
    const page = await fetchJournalEntries(activeConnection, {
      startDate,
      endDate,
      docNumberContains: 'UK-',
      maxResults: queryPageSize,
      startPosition,
    });
    if (page.updatedConnection) {
      activeConnection = page.updatedConnection;
    }

    for (const journalEntry of page.journalEntries) {
      if (!journalEntry.DocNumber) continue;
      qboSearchResults.push({ id: journalEntry.Id, txnDate: journalEntry.TxnDate, docNumber: journalEntry.DocNumber });
    }

    if (qboSearchResults.length >= page.totalCount) break;
    if (page.journalEntries.length === 0) break;
    startPosition += page.journalEntries.length;
  }

  const targets: DeletionTarget[] = [];
  for (const result of qboSearchResults) {
    targets.push({
      journalEntryId: result.id,
      txnDate: result.txnDate,
      docNumber: result.docNumber,
      kind: classifyDocNumber(result.docNumber),
      source: 'qbo-search',
      existsInQbo: true,
    });
  }

  const seenFromSearch = new Set(qboSearchResults.map((result) => result.id));

  for (const row of processingRows) {
    const ids = [row.qboSettlementJournalEntryId, row.qboCogsJournalEntryId, row.qboPnlReclassJournalEntryId];
    for (const id of ids) {
      if (isNoopJournalEntryId(id)) continue;
      if (seenFromSearch.has(id)) continue;
      targets.push({ journalEntryId: id, txnDate: null, docNumber: null, kind: 'unknown', source: 'db-processing', existsInQbo: true });
    }
  }

  for (const row of rollbackRows) {
    const ids = [row.qboSettlementJournalEntryId, row.qboCogsJournalEntryId, row.qboPnlReclassJournalEntryId];
    for (const id of ids) {
      if (isNoopJournalEntryId(id)) continue;
      if (seenFromSearch.has(id)) continue;
      targets.push({ journalEntryId: id, txnDate: null, docNumber: null, kind: 'unknown', source: 'db-rollback', existsInQbo: true });
    }
  }

  for (const target of targets) {
    if (target.docNumber !== null && target.txnDate !== null) continue;
    try {
      const full = await fetchJournalEntryById(activeConnection, target.journalEntryId);
      if (full.updatedConnection) {
        activeConnection = full.updatedConnection;
      }
      target.docNumber = full.journalEntry.DocNumber ? full.journalEntry.DocNumber : null;
      target.txnDate = full.journalEntry.TxnDate ? full.journalEntry.TxnDate : null;
      target.kind = target.docNumber ? classifyDocNumber(target.docNumber) : 'unknown';
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      target.existsInQbo = false;
      target.docNumber = null;
      target.txnDate = null;
      target.kind = 'unknown';
    }
  }

  targets.sort((a, b) => {
    const kindOrder: Record<TargetKind, number> = { settlement: 0, cogs: 1, pnl: 2, unknown: 3 };
    const ka = kindOrder[a.kind];
    const kb = kindOrder[b.kind];
    if (ka !== kb) return ka - kb;
    const da = a.txnDate ? a.txnDate : '';
    const db = b.txnDate ? b.txnDate : '';
    if (da !== db) return da.localeCompare(db);
    const na = a.docNumber ? a.docNumber : '';
    const nb = b.docNumber ? b.docNumber : '';
    if (na !== nb) return na.localeCompare(nb);
    return a.journalEntryId.localeCompare(b.journalEntryId);
  });

  const deletionPlan = targets.map((target) => ({
    source: target.source,
    kind: target.kind,
    existsInQbo: target.existsInQbo,
    txnDate: target.txnDate,
    docNumber: target.docNumber,
    journalEntryId: target.journalEntryId,
    qboUrl: buildQboJournalHref(target.journalEntryId),
  }));

  const rebuildPlan = rebuildDrafts.map(({ source, draft }) => ({
    sourceInvoiceId: source.sourceInvoiceId,
    sourceSettlementJournalEntryId: source.settlementJournalEntryId,
    sourceQboUrl: buildQboJournalHref(source.settlementJournalEntryId),
    originalTotalCents: source.originalTotalCents,
    fundTransferStatus: source.fundTransferStatus,
    segments: draft.segments.map((segment) => ({
      docNumber: segment.docNumber,
      txnDate: segment.txnDate,
      rowCount: segment.auditRows.length,
      memoCount: Array.from(segment.memoTotalsCents.keys()).length,
      totalCents: sumMap(segment.memoTotalsCents),
      hasPrevRollover: segment.memoTotalsCents.has(SPLIT_MONTH_ROLLOVER_PREV_MEMO),
      hasThisRollover: segment.memoTotalsCents.has(SPLIT_MONTH_ROLLOVER_THIS_MEMO),
    })),
  }));

  const existingTargetCount = targets.filter((target) => target.existsInQbo).length;
  const missingTargetCount = targets.length - existingTargetCount;
  const rebuiltSegmentCount = rebuildDrafts.reduce((sum, entry) => sum + entry.draft.segments.length, 0);

  if (!options.apply) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          options: { startDate, endDate },
          totals: {
            qboJournalEntriesMatchedByDocNumber: qboSearchResults.length,
            qboJournalEntriesToDelete: existingTargetCount,
            qboJournalEntriesMissing: missingTargetCount,
            dbSettlementProcessingRows: processingRows.length,
            dbSettlementRollbackRows: rollbackRows.length,
            auditInvoiceIdsToDelete: Array.from(invoiceIdsToDelete).length,
            rebuildSources: rebuildDrafts.length,
            rebuiltSegments: rebuiltSegmentCount,
            validationFailed,
          },
          deletePlan: deletionPlan,
          rebuildPlan,
          validationResults,
          next: {
            command: 'pnpm -C apps/plutus exec tsx scripts/uk-settlement-reset-from-audit.ts --apply --start-date <YYYY-MM-DD> [--end-date <YYYY-MM-DD>]',
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  if (validationFailed) {
    console.log(
      JSON.stringify(
        {
          dryRun: false,
          options: { startDate, endDate },
          error: 'Rebuild validation failed; aborting before any QBO deletes.',
          validationResults,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const deletions: Array<{ journalEntryId: string; ok: boolean; skipped: boolean; error?: string }> = [];

  async function deleteTarget(target: DeletionTarget): Promise<void> {
    if (!target.existsInQbo) {
      deletions.push({ journalEntryId: target.journalEntryId, ok: true, skipped: true });
      return;
    }

    try {
      const result = await deleteJournalEntry(activeConnection, target.journalEntryId);
      if (result.updatedConnection) {
        activeConnection = result.updatedConnection;
      }
      deletions.push({ journalEntryId: target.journalEntryId, ok: true, skipped: false });
    } catch (error) {
      if (isNotFoundError(error)) {
        deletions.push({ journalEntryId: target.journalEntryId, ok: true, skipped: true });
        return;
      }

      deletions.push({
        journalEntryId: target.journalEntryId,
        ok: false,
        skipped: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const settlementTargets = targets.filter((target) => target.kind === 'settlement');
  const otherTargets = targets.filter((target) => target.kind !== 'settlement');

  for (const target of settlementTargets) {
    await deleteTarget(target);
    const lastDeletion = deletions[deletions.length - 1];
    if (lastDeletion && !lastDeletion.ok) {
      await saveServerQboConnection(activeConnection);
      console.log(
        JSON.stringify(
          {
            dryRun: false,
            options: { startDate, endDate },
            error: 'Settlement JE delete failed; aborting immediately before any later settlement deletes.',
            failedDeletions: deletions.filter((entry) => !entry.ok),
            qboLinks: deletions
              .filter((entry) => !entry.ok)
              .map((entry) => ({ journalEntryId: entry.journalEntryId, qboUrl: buildQboJournalHref(entry.journalEntryId) })),
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }
  }

  const failedSettlementDeletions = deletions.filter((entry) => !entry.ok).map((entry) => entry.journalEntryId);
  if (failedSettlementDeletions.length > 0) {
    await saveServerQboConnection(activeConnection);
    console.log(
      JSON.stringify(
        {
          dryRun: false,
          options: { startDate, endDate },
          error: 'Some settlement JEs could not be deleted; aborting before processing JE/DB cleanup.',
          failedDeletions: deletions.filter((entry) => !entry.ok),
          qboLinks: deletions
            .filter((entry) => !entry.ok)
            .map((entry) => ({ journalEntryId: entry.journalEntryId, qboUrl: buildQboJournalHref(entry.journalEntryId) })),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  for (const target of otherTargets) {
    await deleteTarget(target);
  }

  const failedDeletions = deletions.filter((entry) => !entry.ok);
  if (failedDeletions.length > 0) {
    await saveServerQboConnection(activeConnection);
    console.log(
      JSON.stringify(
        {
          dryRun: false,
          options: { startDate, endDate },
          error: 'Some QBO deletions failed; aborting DB cleanup and rebuild.',
          failedDeletions,
          qboLinks: failedDeletions.map((entry) => ({ journalEntryId: entry.journalEntryId, qboUrl: buildQboJournalHref(entry.journalEntryId) })),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const deletedCount = deletions.filter((entry) => entry.ok && !entry.skipped).length;
  const skippedCount = deletions.filter((entry) => entry.skipped).length;

  await db.settlementProcessing.deleteMany({
    where: { id: { in: processingRows.map((row) => row.id) } },
  });
  await db.settlementRollback.deleteMany({
    where: { id: { in: rollbackRows.map((row) => row.id) } },
  });

  const affectedUploadIds = await db.auditDataRow.findMany({
    where: {
      invoiceId: { in: Array.from(invoiceIdsToDelete) },
      OR: [
        { market: { equals: 'uk', mode: 'insensitive' } },
        { market: { contains: 'amazon.co.uk', mode: 'insensitive' } },
      ],
    },
    select: { uploadId: true },
    distinct: ['uploadId'],
  });
  for (const row of affectedUploadIds) {
    auditUploadsMaybeEmpty.add(row.uploadId);
  }

  await db.auditDataRow.deleteMany({
    where: {
      invoiceId: { in: Array.from(invoiceIdsToDelete) },
      OR: [
        { market: { equals: 'uk', mode: 'insensitive' } },
        { market: { contains: 'amazon.co.uk', mode: 'insensitive' } },
      ],
    },
  });

  for (const uploadId of auditUploadsMaybeEmpty) {
    const remaining = await db.auditDataRow.count({ where: { uploadId } });
    if (remaining === 0) {
      await db.auditDataUpload.delete({ where: { id: uploadId } });
    }
  }

  const requiredMemos = new Set<string>();
  let needBankAccount = false;
  let needPaymentAccount = false;
  for (const { draft } of rebuildDrafts) {
    if (draft.originalTotalCents > 0 && draft.fundTransferStatus === 'Succeeded') needBankAccount = true;
    if (draft.originalTotalCents < 0) needPaymentAccount = true;
    for (const segment of draft.segments) {
      for (const [memo, cents] of segment.memoTotalsCents.entries()) {
        if (cents === 0) continue;
        requiredMemos.add(memo);
      }
    }
  }

  const mapping = await loadUkSettlementPostingMapping({ requiredMemos, needBankAccount, needPaymentAccount });

  const preferencesResult = await fetchPreferences(activeConnection);
  if (preferencesResult.updatedConnection) {
    activeConnection = preferencesResult.updatedConnection;
  }

  const homeCurrencyCode = preferencesResult.preferences.CurrencyPrefs?.HomeCurrency?.value
    ? preferencesResult.preferences.CurrencyPrefs.HomeCurrency.value.trim().toUpperCase()
    : '';
  if (!/^[A-Z]{3}$/.test(homeCurrencyCode)) {
    throw new Error('Missing home currency in QBO preferences');
  }

  const currencyValidation = await validateUkSettlementCashAccountCurrencies({
    connection: activeConnection,
    needBankAccount,
    needPaymentAccount,
    bankAccountId: mapping.bankAccountId,
    paymentAccountId: mapping.paymentAccountId,
    homeCurrencyCode,
  });
  if (currencyValidation.updatedConnection) {
    activeConnection = currencyValidation.updatedConnection;
  }
  const settlementControlAccountId = currencyValidation.settlementControlAccountId;

  const exchangeRateByTxnDate = new Map<string, number>();
  if (homeCurrencyCode !== 'GBP') {
    const txnDates = Array.from(
      new Set(
        rebuildDrafts.flatMap((entry) => entry.draft.segments.map((segment) => segment.txnDate)),
      ),
    ).sort();

    for (const txnDate of txnDates) {
      const rateResult = await fetchExchangeRate(activeConnection, {
        sourceCurrencyCode: 'GBP',
        targetCurrencyCode: homeCurrencyCode,
        asOfDate: txnDate,
      });
      if (rateResult.updatedConnection) {
        activeConnection = rateResult.updatedConnection;
      }
      exchangeRateByTxnDate.set(txnDate, rateResult.exchangeRate.Rate);
    }
  }

  const rebuildResults: Array<{
    sourceInvoiceId: string;
    docNumber: string;
    settlementJournalEntryId: string;
    pnlJournalEntryId: string;
    cogsJournalEntryId: string;
  }> = [];

  for (const { source, draft } of rebuildDrafts) {
    const uploadFilename = `uk-settlement-audit-rebuild-${source.sourceInvoiceId}.json`;
    const uploadRows = draft.segments.flatMap((segment) =>
      segment.auditRows.map((row) => ({
        invoiceId: row.invoiceId,
        market: row.market,
        date: row.date,
        orderId: row.orderId,
        sku: row.sku,
        quantity: row.quantity,
        description: row.description,
        net: row.netCents,
      })),
    );

    const upload = await db.auditDataUpload.create({
      data: {
        filename: uploadFilename,
        rowCount: uploadRows.length,
        invoiceCount: draft.segments.length,
        rows: {
          createMany: {
            data: uploadRows,
          },
        },
      },
    });

    const jeDrafts = buildQboJournalEntriesFromUkSettlementDraft({
      draft,
      privateNote: `Plutus (audit rebuild) | Region: UK | Source invoice: ${source.sourceInvoiceId} | Upload: ${upload.id}`,
      settlementControlAccountId,
      bankAccountId: mapping.bankAccountId,
      paymentAccountId: mapping.paymentAccountId,
      accountIdByMemo: mapping.accountIdByMemo,
    });

    const segmentByDocNumber = new Map(draft.segments.map((segment) => [segment.docNumber, segment]));

    for (const jeDraft of jeDrafts) {
      const segment = segmentByDocNumber.get(jeDraft.docNumber);
      if (!segment) {
        throw new Error(`Missing segment for ${jeDraft.docNumber}`);
      }

      const existingLookup = await findExistingJournalEntryIdByDocNumber(activeConnection, jeDraft.docNumber);
      if (existingLookup.updatedConnection) {
        activeConnection = existingLookup.updatedConnection;
      }
      if (existingLookup.journalEntryId !== null) {
        throw new Error(`Settlement JE already exists for rebuilt invoice ${jeDraft.docNumber}: ${existingLookup.journalEntryId}`);
      }

      const created = await createJournalEntry(activeConnection, {
        txnDate: jeDraft.txnDate,
        docNumber: buildPlutusSettlementDocNumber(jeDraft.docNumber),
        privateNote: jeDraft.privateNote,
        currencyCode: 'GBP',
        exchangeRate: (() => {
          if (homeCurrencyCode === 'GBP') return undefined;
          const rate = exchangeRateByTxnDate.get(jeDraft.txnDate);
          if (rate === undefined) {
            throw new Error(`Missing FX rate for settlement date ${jeDraft.txnDate} (GBP->${homeCurrencyCode})`);
          }
          return rate;
        })(),
        lines: jeDraft.lines.map((line) => ({
          amount: line.amount,
          postingType: line.postingType,
          accountId: line.accountId,
          description: line.description,
          taxCodeId: (() => {
            const description = line.description.trim();
            if (description === '') return undefined;
            if (!mapping.taxCodeIdByMemo.has(description)) return undefined;
            const taxCodeId = mapping.taxCodeIdByMemo.get(description);
            return typeof taxCodeId === 'string' ? taxCodeId : undefined;
          })(),
        })),
      });
      if (created.updatedConnection) {
        activeConnection = created.updatedConnection;
      }

      const attachmentResult = await ensureJournalEntryHasSettlementEvidenceAttachments(activeConnection, {
        journalEntryId: created.journalEntry.Id,
        docNumber: jeDraft.docNumber,
        startIsoDay: segment.startIsoDay,
        endIsoDay: segment.endIsoDay,
        auditRows: segment.auditRows,
        accountIdByMemo: mapping.accountIdByMemo,
        taxCodeIdByMemo: mapping.taxCodeIdByMemo,
      });
      if (attachmentResult.updatedConnection) {
        activeConnection = attachmentResult.updatedConnection;
      }

      const processResult = await processSettlement({
        connection: activeConnection,
        settlementJournalEntryId: created.journalEntry.Id,
        auditRows: segment.auditRows.map((row) => ({
          invoiceId: row.invoiceId,
          market: row.market,
          date: row.date,
          orderId: row.orderId,
          sku: row.sku,
          quantity: row.quantity,
          description: row.description,
          net: fromCents(row.netCents),
        })),
        sourceFilename: uploadFilename,
        invoiceId: segment.docNumber,
        settlementId: source.sourceInvoiceId,
      });
      if (processResult.updatedConnection) {
        activeConnection = processResult.updatedConnection;
      }
      if (!processResult.result.ok) {
        throw new Error(
          `Settlement processing blocked for ${segment.docNumber}: ${processResult.result.preview.blocks.map((block) => block.code).join(', ')}`,
        );
      }

      rebuildResults.push({
        sourceInvoiceId: source.sourceInvoiceId,
        docNumber: segment.docNumber,
        settlementJournalEntryId: created.journalEntry.Id,
        pnlJournalEntryId: processResult.result.posted.pnlJournalEntryId,
        cogsJournalEntryId: processResult.result.posted.cogsJournalEntryId,
      });
    }
  }

  await saveServerQboConnection(activeConnection);

  console.log(
    JSON.stringify(
      {
        dryRun: false,
        options: { startDate, endDate },
        totals: {
          deletedQboJournalEntries: deletedCount,
          skippedQboJournalEntries: skippedCount,
          deletedSettlementProcessingRows: processingRows.length,
          deletedSettlementRollbackRows: rollbackRows.length,
          deletedAuditInvoiceIds: Array.from(invoiceIdsToDelete).length,
          rebuiltSources: rebuildDrafts.length,
          rebuiltSegments: rebuildResults.length,
        },
        rebuildResults,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
