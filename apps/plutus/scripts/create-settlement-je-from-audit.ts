import { promises as fs } from 'node:fs';

import { buildPlutusSettlementDocNumber, normalizeSettlementDocNumber } from '@/lib/plutus/settlement-doc-number';
import type { QboConnection } from '@/lib/qbo/api';
import { createJournalEntry, fetchExchangeRate, fetchJournalEntries, fetchPreferences } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

type CliOptions = {
  invoiceId: string;
  marketplace: 'amazon.com' | 'amazon.co.uk';
  apply: boolean;
  plutusEnvPath: string;
};

type MemoMappingEntry = { accountId: string; taxCodeId: string | null };

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

function parseArgs(argv: string[]): CliOptions {
  let invoiceId: string | null = null;
  let marketplace: CliOptions['marketplace'] | null = null;
  let apply = false;
  let plutusEnvPath = '.env.local';

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === '--invoice-id') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --invoice-id');
      invoiceId = next.trim();
      i += 2;
      continue;
    }

    if (arg === '--marketplace') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --marketplace');
      const value = next.trim();
      if (value !== 'amazon.com' && value !== 'amazon.co.uk') {
        throw new Error('marketplace must be amazon.com or amazon.co.uk');
      }
      marketplace = value;
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

    if (arg === '--apply') {
      apply = true;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!invoiceId) {
    throw new Error('Missing --invoice-id');
  }
  if (!marketplace) {
    throw new Error('Missing --marketplace');
  }

  return { invoiceId, marketplace, apply, plutusEnvPath };
}

function requireMemoMapping(value: unknown): Record<string, MemoMappingEntry> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Settlement memo mapping must be an object');
  }

  const obj = value as Record<string, unknown>;
  const result: Record<string, MemoMappingEntry> = {};

  for (const [memo, raw] of Object.entries(obj)) {
    if (typeof raw === 'string') {
      const accountId = raw.trim();
      if (accountId === '') {
        throw new Error(`Invalid account id for memo mapping: ${memo}`);
      }
      result[memo] = { accountId, taxCodeId: null };
      continue;
    }

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error(`Invalid memo mapping entry: ${memo}`);
    }

    const entry = raw as Record<string, unknown>;
    const accountIdRaw = entry.accountId;
    if (typeof accountIdRaw !== 'string' || accountIdRaw.trim() === '') {
      throw new Error(`Invalid account id for memo mapping: ${memo}`);
    }
    const accountId = accountIdRaw.trim();

    const taxRaw = (entry as any).taxCodeId;
    let taxCodeId: string | null = null;
    if (taxRaw === null || taxRaw === undefined) {
      taxCodeId = null;
    } else if (typeof taxRaw === 'string') {
      const trimmed = taxRaw.trim();
      taxCodeId = trimmed === '' ? null : trimmed;
    } else {
      throw new Error(`Invalid taxCodeId for memo mapping: ${memo}`);
    }

    result[memo] = { accountId, taxCodeId };
  }

  return result;
}

function postingForNonBank(cents: number): { postingType: 'Debit' | 'Credit'; amount: number } {
  const abs = Math.abs(cents);
  const amount = abs / 100;
  return cents > 0 ? { postingType: 'Credit', amount } : { postingType: 'Debit', amount };
}

function isoDayFromDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function resolveExchangeRate(input: {
  connection: QboConnection;
  currencyCode: 'USD' | 'GBP';
  txnDate: string;
}): Promise<{ exchangeRate?: number; updatedConnection?: QboConnection }> {
  let activeConnection = input.connection;

  const preferences = await fetchPreferences(activeConnection);
  if (preferences.updatedConnection) {
    activeConnection = preferences.updatedConnection;
  }

  const homeCurrencyCode = preferences.preferences.CurrencyPrefs?.HomeCurrency?.value
    ? preferences.preferences.CurrencyPrefs.HomeCurrency.value.trim().toUpperCase()
    : '';

  if (homeCurrencyCode === '' || homeCurrencyCode === input.currencyCode) {
    return { updatedConnection: activeConnection === input.connection ? undefined : activeConnection };
  }

  const fx = await fetchExchangeRate(activeConnection, {
    sourceCurrencyCode: input.currencyCode,
    targetCurrencyCode: homeCurrencyCode,
    asOfDate: input.txnDate,
  });
  if (fx.updatedConnection) {
    activeConnection = fx.updatedConnection;
  }

  return {
    exchangeRate: fx.exchangeRate.Rate,
    updatedConnection: activeConnection === input.connection ? undefined : activeConnection,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await loadPlutusEnvFile(options.plutusEnvPath);

  const connectionMaybe = await getQboConnection();
  if (!connectionMaybe) throw new Error('Not connected to QBO (missing server connection file)');
  let activeConnection: QboConnection = connectionMaybe;

  const { db } = await import('@/lib/db');
  const { normalizeAuditMarketToMarketplaceId } = await import('@/lib/plutus/audit-invoice-matching');

  const normalizedInvoiceId = normalizeSettlementDocNumber(options.invoiceId);
  const existingSearch = await fetchJournalEntries(activeConnection, {
    docNumberContains: normalizedInvoiceId,
    maxResults: 10,
    startPosition: 1,
  });
  if (existingSearch.updatedConnection) {
    activeConnection = existingSearch.updatedConnection;
  }

  const alreadyExists = existingSearch.journalEntries.some((je: any) => {
    const docNumber = typeof je.DocNumber === 'string' ? je.DocNumber : '';
    return normalizeSettlementDocNumber(docNumber) === normalizedInvoiceId;
  });

  if (alreadyExists) {
    console.log(JSON.stringify({ ok: true, created: false, reason: 'Settlement journal entry already exists in QBO' }, null, 2));
    return;
  }

  const auditRows = await db.auditDataRow.findMany({
    where: { invoiceId: normalizedInvoiceId },
    select: { market: true, description: true, net: true },
  });

  const memoTotals = new Map<string, number>();
  for (const row of auditRows) {
    const marketplaceId = normalizeAuditMarketToMarketplaceId(row.market);
    if (marketplaceId !== options.marketplace) continue;
    const memo = row.description.trim();
    if (memo === '') continue;
    const current = memoTotals.get(memo);
    memoTotals.set(memo, (current === undefined ? 0 : current) + row.net);
  }

  if (memoTotals.size === 0) {
    throw new Error(`No audit rows found for invoiceId=${normalizedInvoiceId} marketplace=${options.marketplace}`);
  }

  let originalTotalCents = 0;
  for (const cents of memoTotals.values()) {
    originalTotalCents += cents;
  }

  const needBankAccount = originalTotalCents > 0;
  const needPaymentAccount = originalTotalCents < 0;

  const postingConfig = await db.settlementPostingConfig.findUnique({ where: { marketplace: options.marketplace } });
  if (!postingConfig) {
    throw new Error(`Missing settlement posting config for marketplace=${options.marketplace}`);
  }

  const bankAccountId = postingConfig.bankAccountId ? postingConfig.bankAccountId.trim() : '';
  const paymentAccountId = postingConfig.paymentAccountId ? postingConfig.paymentAccountId.trim() : '';

  if (needBankAccount && bankAccountId === '') {
    throw new Error("Missing 'Transfer to Bank' account id (configure it in Settlement Mapping)");
  }
  if (needPaymentAccount && paymentAccountId === '') {
    throw new Error("Missing 'Payment to Amazon' account id (configure it in Settlement Mapping)");
  }

  const memoMapping = requireMemoMapping(postingConfig.accountIdByMemo);

  const missingMemos = Array.from(memoTotals.keys()).filter((memo) => memoMapping[memo] === undefined).sort();
  if (missingMemos.length > 0) {
    throw new Error(`Missing account mappings for memos: ${missingMemos.join(' | ')}`);
  }

  const latestRollback = await db.settlementRollback.findFirst({
    where: { marketplace: options.marketplace, invoiceId: normalizedInvoiceId },
    orderBy: { rolledBackAt: 'desc' },
    select: { settlementPostedDate: true },
  });

  const txnDate = latestRollback ? isoDayFromDate(latestRollback.settlementPostedDate) : new Date().toISOString().slice(0, 10);
  const currencyCode: 'USD' | 'GBP' = options.marketplace === 'amazon.co.uk' ? 'GBP' : 'USD';

  const fx = await resolveExchangeRate({ connection: activeConnection, currencyCode, txnDate });
  if (fx.updatedConnection) {
    activeConnection = fx.updatedConnection;
  }

  const lines: Array<{
    amount: number;
    postingType: 'Debit' | 'Credit';
    accountId: string;
    description: string;
    taxCodeId?: string;
  }> = [];

  for (const [memo, cents] of Array.from(memoTotals.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (cents === 0) continue;
    const mapping = memoMapping[memo]!;
    const posting = postingForNonBank(cents);
    lines.push({
      accountId: mapping.accountId,
      postingType: posting.postingType,
      amount: posting.amount,
      description: memo,
      ...(mapping.taxCodeId ? { taxCodeId: mapping.taxCodeId } : {}),
    });
  }

  if (originalTotalCents !== 0) {
    const absAmount = Math.abs(originalTotalCents) / 100;
    if (originalTotalCents > 0) {
      lines.push({
        accountId: bankAccountId,
        postingType: 'Debit',
        amount: absAmount,
        description: 'Transfer to Bank',
      });
    } else {
      lines.push({
        accountId: paymentAccountId,
        postingType: 'Credit',
        amount: absAmount,
        description: 'Payment to Amazon',
      });
    }
  }

  if (!options.apply) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          options: {
            marketplace: options.marketplace,
            invoiceId: normalizedInvoiceId,
          },
          totals: {
            memoCount: memoTotals.size,
            originalTotalCents,
            lineCount: lines.length,
            currencyCode,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const created = await createJournalEntry(activeConnection, {
    txnDate,
    docNumber: buildPlutusSettlementDocNumber(normalizedInvoiceId),
    privateNote: `Plutus Settlement (recreated from audit) | Invoice: ${normalizedInvoiceId}`,
    currencyCode,
    exchangeRate: fx.exchangeRate,
    lines,
  });
  if (created.updatedConnection) {
    activeConnection = created.updatedConnection;
  }

  if (activeConnection !== connectionMaybe) {
    await saveServerQboConnection(activeConnection);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        created: true,
        marketplace: options.marketplace,
        invoiceId: normalizedInvoiceId,
        journalEntryId: created.journalEntry.Id,
        txnDate,
        currencyCode,
        originalTotalCents,
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
