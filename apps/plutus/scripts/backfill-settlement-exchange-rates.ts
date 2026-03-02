import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  fetchExchangeRate,
  fetchJournalEntryById,
  fetchJournalEntries,
  fetchPreferences,
  type QboConnection,
  type QboJournalEntry,
  updateJournalEntry,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { isSettlementDocNumber, normalizeSettlementDocNumber } from '@/lib/plutus/settlement-doc-number';

type CliOptions = {
  apply: boolean;
  market: 'UK' | 'ALL';
  overrides: Map<string, number>;
};

function parseDotenvLine(rawLine: string): { key: string; value: string } | null {
  let line = rawLine.trim();
  if (line === '' || line.startsWith('#')) return null;

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
  let apply = false;
  let market: 'UK' | 'ALL' = 'UK';
  const overrides = new Map<string, number>();

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
      if (upper !== 'UK' && upper !== 'ALL') {
        throw new Error(`Invalid --market value: ${next}`);
      }
      market = upper;
      i += 2;
      continue;
    }
    if (arg === '--override-home-amount') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --override-home-amount');
      const parts = next.split('=');
      if (parts.length !== 2) {
        throw new Error(`Invalid override format: ${next} (expected DOCNUMBER=AMOUNT)`);
      }
      const docNumber = parts[0]!.trim().toUpperCase();
      const amount = Number(parts[1]);
      if (docNumber === '' || !Number.isFinite(amount) || amount <= 0) {
        throw new Error(`Invalid override value: ${next}`);
      }
      overrides.set(docNumber, amount);
      i += 2;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { apply, market, overrides };
}

function shouldIncludeDocNumber(docNumber: string, market: 'UK' | 'ALL'): boolean {
  const upper = docNumber.trim().toUpperCase();
  if (market === 'ALL') {
    return upper.includes('UK-') || upper.includes('PUK-') || upper.includes('CUK-');
  }
  return upper.includes('UK-') || upper.includes('PUK-') || upper.includes('CUK-');
}

function findCashLineAmount(entry: QboJournalEntry): number | null {
  for (const line of entry.Line) {
    const description = line.Description ? line.Description.trim().toLowerCase() : '';
    if (!description.includes('payment to amazon') && !description.includes('transfer to bank')) continue;
    if (typeof line.Amount !== 'number' || !Number.isFinite(line.Amount) || line.Amount <= 0) continue;
    return line.Amount;
  }
  return null;
}

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function computeHomeSplitDeltaAtRate(entry: QboJournalEntry, exchangeRate: number): number {
  let delta = 0;
  for (const line of entry.Line) {
    const amount = line.Amount;
    const postingType = line.JournalEntryLineDetail?.PostingType;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) continue;
    if (postingType !== 'Debit' && postingType !== 'Credit') continue;
    const signed = postingType === 'Debit' ? 1 : -1;
    delta += signed * roundToCents(amount * exchangeRate);
  }
  return roundToCents(delta);
}

function findNearestBalancedExchangeRate(input: {
  entry: QboJournalEntry;
  targetExchangeRate: number;
}): number {
  const targetDelta = computeHomeSplitDeltaAtRate(input.entry, input.targetExchangeRate);
  if (targetDelta === 0) {
    return Number(input.targetExchangeRate.toFixed(10));
  }

  const step = 0.000001;
  const maxSteps = 200000; // +/-0.20 around target

  for (let offset = 1; offset <= maxSteps; offset += 1) {
    const down = input.targetExchangeRate - offset * step;
    if (down > 0) {
      const downDelta = computeHomeSplitDeltaAtRate(input.entry, down);
      if (downDelta === 0) {
        return Number(down.toFixed(10));
      }
    }

    const up = input.targetExchangeRate + offset * step;
    const upDelta = computeHomeSplitDeltaAtRate(input.entry, up);
    if (upDelta === 0) {
      return Number(up.toFixed(10));
    }
  }

  throw new Error(
    `Unable to find split-balanced exchange rate for ${input.entry.DocNumber ?? input.entry.Id} around target ${input.targetExchangeRate}`,
  );
}

function buildQboJournalHref(journalEntryId: string): string {
  return `https://app.qbo.intuit.com/app/journal?txnId=${journalEntryId}`;
}

async function fetchCandidateJournals(connection: QboConnection, market: 'UK' | 'ALL'): Promise<{
  journalEntries: QboJournalEntry[];
  updatedConnection?: QboConnection;
}> {
  let activeConnection = connection;
  const byId = new Map<string, QboJournalEntry>();
  const queries = market === 'ALL' ? ['UK-', 'PUK-', 'CUK-'] : ['UK-', 'PUK-', 'CUK-'];

  for (const query of queries) {
    let startPosition = 1;
    while (true) {
      const page = await fetchJournalEntries(activeConnection, {
        docNumberContains: query,
        maxResults: 200,
        startPosition,
      });
      if (page.updatedConnection) {
        activeConnection = page.updatedConnection;
      }
      for (const je of page.journalEntries) {
        byId.set(je.Id, je);
      }
      if (page.journalEntries.length === 0) break;
      if (startPosition + page.journalEntries.length > page.totalCount) break;
      startPosition += page.journalEntries.length;
    }
  }

  const journalEntries = Array.from(byId.values())
    .filter((je) => {
      const docNumber = je.DocNumber;
      if (!docNumber) return false;
      return shouldIncludeDocNumber(docNumber, market);
    })
    .sort((a, b) => {
      if (a.TxnDate !== b.TxnDate) return a.TxnDate.localeCompare(b.TxnDate);
      return a.Id.localeCompare(b.Id);
    });

  return {
    journalEntries,
    updatedConnection: activeConnection === connection ? undefined : activeConnection,
  };
}

async function main(): Promise<void> {
  await loadPlutusEnv();
  const options = parseArgs(process.argv.slice(2));

  const connection = await getQboConnection();
  if (!connection) {
    throw new Error('Not connected to QBO');
  }
  let activeConnection = connection;

  const prefs = await fetchPreferences(activeConnection);
  if (prefs.updatedConnection) {
    activeConnection = prefs.updatedConnection;
  }
  const homeCurrencyCode = prefs.preferences.CurrencyPrefs?.HomeCurrency?.value
    ? prefs.preferences.CurrencyPrefs.HomeCurrency.value.trim().toUpperCase()
    : '';
  if (!/^[A-Z]{3}$/.test(homeCurrencyCode)) {
    throw new Error('Missing home currency in QBO preferences');
  }

  const fetched = await fetchCandidateJournals(activeConnection, options.market);
  if (fetched.updatedConnection) {
    activeConnection = fetched.updatedConnection;
  }

  const rateCache = new Map<string, number>();

  const plans: Array<{
    journalEntryId: string;
    docNumber: string;
    txnDate: string;
    sourceCurrencyCode: string;
    oldExchangeRate: number;
    targetExchangeRate: number;
    newExchangeRate: number;
    splitDeltaAtTargetRate: number;
    splitDeltaAtNewRate: number;
    splitAdjusted: boolean;
    reason: string;
    qboUrl: string;
  }> = [];

  for (const summary of fetched.journalEntries) {
    const full = await fetchJournalEntryById(activeConnection, summary.Id);
    if (full.updatedConnection) {
      activeConnection = full.updatedConnection;
    }

    const entry = full.journalEntry;
    if (!entry.DocNumber) continue;

    const docNumberUpper = entry.DocNumber.trim().toUpperCase();
    const sourceCurrencyCode = entry.CurrencyRef?.value ? entry.CurrencyRef.value.trim().toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(sourceCurrencyCode)) continue;
    if (sourceCurrencyCode === homeCurrencyCode) continue;

    const oldExchangeRate = entry.ExchangeRate;
    if (typeof oldExchangeRate !== 'number' || !Number.isFinite(oldExchangeRate)) continue;
    if (oldExchangeRate !== 1) continue;

    let targetExchangeRate: number;
    let reason: string;

    const overrideKey = isSettlementDocNumber(docNumberUpper)
      ? normalizeSettlementDocNumber(docNumberUpper)
      : docNumberUpper;

    const overrideHomeAmount = options.overrides.get(overrideKey);
    if (overrideHomeAmount !== undefined) {
      const cashAmount = findCashLineAmount(entry);
      if (cashAmount === null) {
        throw new Error(`Override requires settlement cash line, but none found for ${entry.DocNumber} (${entry.Id})`);
      }
      targetExchangeRate = Number((overrideHomeAmount / cashAmount).toFixed(10));
      if (!Number.isFinite(targetExchangeRate) || targetExchangeRate <= 0) {
        throw new Error(`Computed invalid override exchange rate for ${entry.DocNumber} (${entry.Id})`);
      }
      reason = `override_home_amount_${overrideHomeAmount.toFixed(2)}`;
    } else {
      const cacheKey = `${sourceCurrencyCode}:${homeCurrencyCode}:${entry.TxnDate}`;
      const cached = rateCache.get(cacheKey);
      if (cached !== undefined) {
        targetExchangeRate = cached;
      } else {
        const rateResult = await fetchExchangeRate(activeConnection, {
          sourceCurrencyCode,
          targetCurrencyCode: homeCurrencyCode,
          asOfDate: entry.TxnDate,
        });
        if (rateResult.updatedConnection) {
          activeConnection = rateResult.updatedConnection;
        }
        targetExchangeRate = rateResult.exchangeRate.Rate;
        rateCache.set(cacheKey, targetExchangeRate);
      }
      reason = 'qbo_exchange_rate';
    }

    const splitDeltaAtTargetRate = computeHomeSplitDeltaAtRate(entry, targetExchangeRate);
    const newExchangeRate =
      splitDeltaAtTargetRate === 0
        ? Number(targetExchangeRate.toFixed(10))
        : findNearestBalancedExchangeRate({
            entry,
            targetExchangeRate,
          });
    const splitDeltaAtNewRate = computeHomeSplitDeltaAtRate(entry, newExchangeRate);
    if (splitDeltaAtNewRate !== 0) {
      throw new Error(`Computed non-balanced exchange rate for ${entry.DocNumber} (${entry.Id})`);
    }

    plans.push({
      journalEntryId: entry.Id,
      docNumber: docNumberUpper,
      txnDate: entry.TxnDate,
      sourceCurrencyCode,
      oldExchangeRate,
      targetExchangeRate,
      newExchangeRate,
      splitDeltaAtTargetRate,
      splitDeltaAtNewRate,
      splitAdjusted: newExchangeRate !== Number(targetExchangeRate.toFixed(10)),
      reason,
      qboUrl: buildQboJournalHref(entry.Id),
    });
  }

  let updatedCount = 0;
  const updatedLinks: string[] = [];
  const failures: Array<{
    journalEntryId: string;
    docNumber: string;
    qboUrl: string;
    error: string;
  }> = [];
  if (options.apply) {
    for (const plan of plans) {
      try {
        const updated = await updateJournalEntry(activeConnection, plan.journalEntryId, {
          exchangeRate: plan.newExchangeRate,
        });
        if (updated.updatedConnection) {
          activeConnection = updated.updatedConnection;
        }
        updatedCount += 1;
        updatedLinks.push(plan.qboUrl);
      } catch (error) {
        failures.push({
          journalEntryId: plan.journalEntryId,
          docNumber: plan.docNumber,
          qboUrl: plan.qboUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (activeConnection !== connection) {
    await saveServerQboConnection(activeConnection);
  }

  const summary = {
    apply: options.apply,
    market: options.market,
    homeCurrencyCode,
    overrideCount: options.overrides.size,
    planned: plans.length,
    updated: updatedCount,
    plans,
    updatedLinks,
    failures,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
