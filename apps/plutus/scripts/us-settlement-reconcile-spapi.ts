import { promises as fs } from 'node:fs';

import { buildQboJournalEntriesFromUsSettlementDraft, buildUsSettlementDraftFromSpApiFinances } from '@/lib/amazon-finances/us-settlement-builder';
import {
  fetchAllFinancialEventsByGroupId,
  findFinancialEventGroupIdForSettlementId,
  listAllFinancialEventGroups,
} from '@/lib/amazon-finances/sp-api-finances';
import type { SpApiFinancialEvents } from '@/lib/amazon-finances/types';
import { normalizeSku } from '@/lib/plutus/settlement-validation';
import { fetchJournalEntries, fetchJournalEntryById, type QboConnection, type QboJournalEntry } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

type CliOptions = {
  startDate: string;
  amazonEnvPath: string;
  plutusEnvPath: string;
  onlySettlementIds: string[] | null;
  maxMismatchLines: number;
};

type QboLine = {
  accountId: string;
  postingType: 'Debit' | 'Credit';
  amount: number;
  description: string;
};

type SegmentResult = {
  settlementId: string;
  eventGroupId: string;
  docNumber: string;
  txnDate: string;
  status: 'ok' | 'mismatch';
  mismatchCount: number;
  mismatches: Array<{ key: string; expected: number; actual: number }>;
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

async function loadAmazonEnvFile(filePath: string): Promise<void> {
  const raw = await fs.readFile(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line);
    if (!parsed) continue;
    const isAmazon = parsed.key.startsWith('AMAZON_') || parsed.key.startsWith('AWS_');
    if (!isAmazon) continue;
    if (process.env[parsed.key] !== undefined) continue;
    process.env[parsed.key] = parsed.value;
  }
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

function normalizeAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function keyOfLine(line: QboLine): string {
  return `${line.accountId}::${line.postingType}::${line.description}`;
}

function sumLines(lines: QboLine[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const k = keyOfLine(line);
    const current = totals.get(k);
    totals.set(k, normalizeAmount((current === undefined ? 0 : current) + line.amount));
  }
  return totals;
}

function extractLinesFromJe(je: QboJournalEntry): QboLine[] {
  const lines = Array.isArray(je.Line) ? je.Line : [];
  const result: QboLine[] = [];

  for (const line of lines) {
    const detail = line.JournalEntryLineDetail;
    if (!detail) continue;
    const accountId = detail.AccountRef?.value;
    if (typeof accountId !== 'string') continue;

    const postingType = detail.PostingType;
    if (postingType !== 'Debit' && postingType !== 'Credit') continue;

    const amount = line.Amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) continue;

    const description = typeof line.Description === 'string' ? line.Description : '';
    result.push({ accountId, postingType, amount: normalizeAmount(amount), description });
  }

  return result;
}

function requireSettlementIdFromPrivateNote(input: { docNumber: string; privateNote: string | undefined }): string {
  const privateNote = typeof input.privateNote === 'string' ? input.privateNote : '';
  const match = privateNote.match(/downloadAuditFile\/\d+-([0-9]+)/);
  if (!match) {
    throw new Error(`Missing settlementId in PrivateNote for ${input.docNumber}`);
  }
  return match[1]!;
}

function extractBrandLabelFromMemo(description: string): string | null {
  const prefixes = [
    'Amazon Sales - Principal - ',
    'Amazon Sales - Shipping - ',
    'Amazon Sales - Shipping Promotion - ',
    'Amazon Refunds - Refunded Principal - ',
    'Amazon Refunds - Refunded Shipping - ',
    'Amazon Refunds - Refunded Shipping Promotion - ',
  ];

  for (const prefix of prefixes) {
    if (!description.startsWith(prefix)) continue;
    const label = description.slice(prefix.length).trim();
    return label === '' ? null : label;
  }

  return null;
}

function collectBrandLabelsFromJournalEntries(journalEntries: QboJournalEntry[]): Set<string> {
  const result = new Set<string>();
  for (const je of journalEntries) {
    const lines = extractLinesFromJe(je);
    for (const line of lines) {
      const label = extractBrandLabelFromMemo(line.description);
      if (label) result.add(label);
    }
  }
  return result;
}

function requireSkuBrandName(skuRaw: string, skuToBrandName: Map<string, string>): string {
  const normalized = normalizeSku(skuRaw);
  const brandName = skuToBrandName.get(normalized);
  if (!brandName) {
    throw new Error(`SKU not mapped to brand: ${normalized}`);
  }
  return brandName;
}

function collectBrandNamesFromEvents(events: SpApiFinancialEvents, skuToBrandName: Map<string, string>): Set<string> {
  const result = new Set<string>();

  for (const shipment of events.ShipmentEventList ?? []) {
    for (const item of shipment.ShipmentItemList ?? []) {
      const skuRaw = typeof item.SellerSKU === 'string' ? item.SellerSKU.trim() : '';
      if (skuRaw === '') continue;
      result.add(requireSkuBrandName(skuRaw, skuToBrandName));
    }
  }

  for (const refund of events.RefundEventList ?? []) {
    for (const item of refund.ShipmentItemAdjustmentList ?? []) {
      const skuRaw = typeof item.SellerSKU === 'string' ? item.SellerSKU.trim() : '';
      if (skuRaw === '') continue;
      result.add(requireSkuBrandName(skuRaw, skuToBrandName));
    }
  }

  return result;
}

function buildBrandLabelByBrandName(input: {
  brandNamesUsed: Set<string>;
  journalBrandLabels: Set<string>;
}): Map<string, string> | undefined {
  if (input.brandNamesUsed.size === 0 && input.journalBrandLabels.size === 0) return undefined;

  if (input.brandNamesUsed.size === 0) {
    throw new Error(`Journal uses brand labels, but no brands were detected from SP-API events: ${Array.from(input.journalBrandLabels).join(', ')}`);
  }

  if (input.journalBrandLabels.size === 0) {
    throw new Error(`SP-API events use brands (${Array.from(input.brandNamesUsed).join(', ')}), but journal entry has no brand-labeled memos`);
  }

  const brandNames = Array.from(input.brandNamesUsed).sort();
  const labels = Array.from(input.journalBrandLabels).sort();

  const mapping = new Map<string, string>();

  for (const brandName of brandNames) {
    if (input.journalBrandLabels.has(brandName)) {
      mapping.set(brandName, brandName);
    }
  }

  const usedLabels = new Set(mapping.values());
  const unmappedBrandNames = brandNames.filter((b) => !mapping.has(b));
  const remainingLabels = labels.filter((l) => !usedLabels.has(l));

  if (unmappedBrandNames.length === 0 && remainingLabels.length === 0) {
    return mapping;
  }

  if (unmappedBrandNames.length === 1 && remainingLabels.length === 1) {
    mapping.set(unmappedBrandNames[0]!, remainingLabels[0]!);
    return mapping;
  }

  if (brandNames.length !== labels.length) {
    throw new Error(`Brand mismatch: SP-API brands (${brandNames.join(', ')}) vs QBO brand labels (${labels.join(', ')})`);
  }

  throw new Error(`Ambiguous brand label mapping: SP-API brands (${brandNames.join(', ')}) vs QBO labels (${labels.join(', ')})`);
}

function parseArgs(argv: string[]): CliOptions {
  let startDate = '2025-12-01';
  let amazonEnvPath = '../talos/.env.local';
  let plutusEnvPath = '.env.local';
  let onlySettlementIds: string[] | null = null;
  let maxMismatchLines = 25;

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

    if (arg === '--amazon-env') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --amazon-env');
      amazonEnvPath = next;
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

    if (arg === '--only-settlements') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --only-settlements');
      onlySettlementIds = next
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x !== '');
      i += 2;
      continue;
    }

    if (arg === '--max-mismatch-lines') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --max-mismatch-lines');
      const n = Number(next);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        throw new Error('Invalid value for --max-mismatch-lines');
      }
      maxMismatchLines = n;
      i += 2;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { startDate, amazonEnvPath, plutusEnvPath, onlySettlementIds, maxMismatchLines };
}

async function fetchLmbUsJournalEntries(input: {
  connection: any;
  startDate: string;
}): Promise<{ journalEntries: Array<{ id: string; docNumber: string; txnDate: string }>; updatedConnection?: any }> {
  const pageSize = 100;
  let startPosition = 1;
  let settlementJournals: Array<{ Id: string; DocNumber?: string; TxnDate: string }> = [];
  let connection = input.connection;

  while (true) {
    const page = await fetchJournalEntries(connection, {
      docNumberContains: 'LMB-US-',
      startDate: input.startDate,
      maxResults: pageSize,
      startPosition,
    });
    if (page.updatedConnection) {
      connection = page.updatedConnection;
    }

    settlementJournals = settlementJournals.concat(page.journalEntries);
    if (settlementJournals.length >= page.totalCount) break;
    if (page.journalEntries.length === 0) break;
    startPosition += page.journalEntries.length;
  }

  const filtered = settlementJournals
    .filter((entry) => entry.DocNumber && entry.DocNumber.includes('LMB-US-'))
    .map((entry) => ({ id: entry.Id, docNumber: entry.DocNumber!, txnDate: entry.TxnDate }));

  return { journalEntries: filtered, updatedConnection: connection };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  await loadAmazonEnvFile(options.amazonEnvPath);
  await loadPlutusEnvFile(options.plutusEnvPath);

  const { db } = await import('@/lib/db');

  const maybeConnection = await getQboConnection();
  if (!maybeConnection) throw new Error('Not connected to QBO');
  let connection: QboConnection = maybeConnection;

  const fetched = await fetchLmbUsJournalEntries({ connection, startDate: options.startDate });
  if (fetched.updatedConnection) {
    connection = fetched.updatedConnection as QboConnection;
  }

  const journals: Array<{ settlementId: string; je: QboJournalEntry }> = [];

  for (const entry of fetched.journalEntries) {
    const result = await fetchJournalEntryById(connection, entry.id);
    if (result.updatedConnection) {
      connection = result.updatedConnection;
    }

    const settlementId = requireSettlementIdFromPrivateNote({
      docNumber: entry.docNumber,
      privateNote: result.journalEntry.PrivateNote,
    });
    journals.push({ settlementId, je: result.journalEntry });
  }

  const journalsBySettlement = new Map<string, QboJournalEntry[]>();
  for (const row of journals) {
    const existing = journalsBySettlement.get(row.settlementId);
    if (!existing) {
      journalsBySettlement.set(row.settlementId, [row.je]);
    } else {
      existing.push(row.je);
    }
  }

  const targetSettlementIds = options.onlySettlementIds
    ? Array.from(new Set(options.onlySettlementIds)).sort()
    : Array.from(journalsBySettlement.keys()).sort();

  const postedAfterIso = `${options.startDate}T00:00:00.000Z`;
  const postedBeforeIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const eventGroups = await listAllFinancialEventGroups({
    tenantCode: 'US',
    startedAfterIso: postedAfterIso,
    startedBeforeIso: postedBeforeIso,
  });

  const groupById = new Map<string, any>();
  for (const g of eventGroups) {
    const id = g.FinancialEventGroupId;
    if (typeof id !== 'string' || id.trim() === '') {
      continue;
    }
    groupById.set(id, g);
  }

  const skus = await db.sku.findMany({ include: { brand: true } });
  const skuToBrandName = new Map<string, string>();
  for (const row of skus) {
    if (row.brand.marketplace !== 'amazon.com') continue;
    skuToBrandName.set(normalizeSku(row.sku), row.brand.name);
  }

  const results: SegmentResult[] = [];

  for (const settlementId of targetSettlementIds) {
    const settlementJournals = journalsBySettlement.get(settlementId);
    if (!settlementJournals) continue;

    const eventGroupId = await findFinancialEventGroupIdForSettlementId({
      tenantCode: 'US',
      settlementId,
      postedAfterIso,
      postedBeforeIso,
    });

    const eventGroup = groupById.get(eventGroupId);
    if (!eventGroup) {
      throw new Error(`Event group not found for settlement ${settlementId}: ${eventGroupId}`);
    }

    const events = await fetchAllFinancialEventsByGroupId({ tenantCode: 'US', eventGroupId });

    const journalBrandLabels = collectBrandLabelsFromJournalEntries(settlementJournals);
    const brandNamesUsed = collectBrandNamesFromEvents(events, skuToBrandName);
    const brandLabelByBrandName = buildBrandLabelByBrandName({ brandNamesUsed, journalBrandLabels });

    const draft = buildUsSettlementDraftFromSpApiFinances({
      settlementId,
      eventGroupId,
      eventGroup,
      events,
      skuToBrandName,
      brandLabelByBrandName,
    });

    const journalsByDocNumber = new Map<string, QboJournalEntry>();
    for (const je of settlementJournals) {
      if (!je.DocNumber) continue;
      journalsByDocNumber.set(je.DocNumber, je);
    }

    for (let segmentIdx = 0; segmentIdx < draft.segments.length; segmentIdx++) {
      const segment = draft.segments[segmentIdx]!;
      const actualJe = journalsByDocNumber.get(segment.docNumber);
      if (!actualJe) {
        throw new Error(`Missing QBO JE for DocNumber ${segment.docNumber} (settlement ${settlementId})`);
      }

      const actualLines = extractLinesFromJe(actualJe);

      const accountIdByMemo = new Map<string, string>();
      let bankAccountId = '';
      let paymentAccountId = '';

      for (const line of actualLines) {
        if (line.description === 'Transfer to Bank') {
          bankAccountId = line.accountId;
          continue;
        }
        if (line.description === 'Payment to Amazon') {
          paymentAccountId = line.accountId;
          continue;
        }
        if (!accountIdByMemo.has(line.description)) {
          accountIdByMemo.set(line.description, line.accountId);
        }
      }

      const isLast = segmentIdx === draft.segments.length - 1;
      const originalTotalCents = isLast ? draft.originalTotalCents : 0;

      if (isLast && originalTotalCents > 0 && bankAccountId === '') {
        throw new Error(`Missing 'Transfer to Bank' line in ${segment.docNumber}`);
      }
      if (isLast && originalTotalCents < 0 && paymentAccountId === '') {
        throw new Error(`Missing 'Payment to Amazon' line in ${segment.docNumber}`);
      }

      const expectedDrafts = buildQboJournalEntriesFromUsSettlementDraft({
        draft: {
          ...draft,
          originalTotalCents,
          segments: [segment],
        },
        privateNote: 'Plutus reconcile (SP-API Finances)',
        bankAccountId,
        paymentAccountId,
        accountIdByMemo,
      });

      const expectedLines = expectedDrafts[0]!.lines;

      const expectedTotals = sumLines(expectedLines);
      const actualTotals = sumLines(actualLines);

      const keys = new Set([...expectedTotals.keys(), ...actualTotals.keys()]);
      const mismatches: Array<{ key: string; expected: number; actual: number }> = [];

      for (const k of Array.from(keys).sort()) {
        const expected = expectedTotals.get(k) ?? 0;
        const actual = actualTotals.get(k) ?? 0;
        if (Math.abs(expected - actual) > 0.01) {
          mismatches.push({ key: k, expected, actual });
        }
      }

      results.push({
        settlementId,
        eventGroupId,
        docNumber: segment.docNumber,
        txnDate: segment.txnDate,
        status: mismatches.length === 0 ? 'ok' : 'mismatch',
        mismatchCount: mismatches.length,
        mismatches: mismatches.slice(0, options.maxMismatchLines),
      });
    }
  }

  results.sort((a, b) => {
    if (a.txnDate !== b.txnDate) return a.txnDate.localeCompare(b.txnDate);
    if (a.settlementId !== b.settlementId) return a.settlementId.localeCompare(b.settlementId);
    return a.docNumber.localeCompare(b.docNumber);
  });

  await saveServerQboConnection(connection);

  const okCount = results.filter((r) => r.status === 'ok').length;
  const mismatchCount = results.length - okCount;

  console.log(
    JSON.stringify(
      {
        options,
        totals: { segments: results.length, ok: okCount, mismatched: mismatchCount },
        results,
      },
      null,
      2,
    ),
  );

  if (mismatchCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
