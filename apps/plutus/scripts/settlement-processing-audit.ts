import { promises as fs } from 'node:fs';
import path from 'node:path';

import { classifyPnlBucket, computePnlAllocation, type PnlBucketKey } from '@/lib/pnl-allocation';
import type { SettlementAuditRow } from '@/lib/plutus/settlement-audit';
import { isNoopJournalEntryId, isQboJournalEntryId } from '@/lib/plutus/journal-entry-id';
import { buildCogsJournalLines, buildPnlJournalLines } from '@/lib/plutus/journal-builder';
import { normalizeAuditMarketToMarketplaceId } from '@/lib/plutus/audit-invoice-matching';
import {
  computeProcessingHash,
  mergeBrandComponentCents,
  mergeBrandComponentSkuCents,
  normalizeSku,
  requireAccountMapping,
  sumCentsByBrandComponent,
  sumCentsByBrandComponentSku,
} from '@/lib/plutus/settlement-validation';
import {
  fetchAccounts,
  fetchJournalEntryById,
  type QboAccount,
  type QboConnection,
  type QboJournalEntry,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

type DbClient = typeof import('@/lib/db').db;
type BuildDeterministicSkuAllocations = typeof import('@/lib/plutus/fee-allocation').buildDeterministicSkuAllocations;

type CliOptions = {
  invoiceId: string | null;
  includeJson: boolean;
};

type JournalLineKey = `${string}::${'Debit' | 'Credit'}::${string}`;

type LineSummary = {
  accountId: string;
  postingType: 'Debit' | 'Credit';
  amountCents: number;
  description: string;
};

type JeCompareResult = {
  status: 'ok' | 'mismatch' | 'missing';
  expectedLineCount: number;
  actualLineCount: number;
  mismatches: Array<{ key: string; expectedCents: number; actualCents: number }>;
  docNumber?: { expected: string; actual: string | null; ok: boolean };
  privateNote?: { expectedPrefix: string; actual: string | null; ok: boolean };
  txnDate?: { expected: string; actual: string | null; ok: boolean };
};

type SettlementAuditResult = {
  marketplace: string;
  invoiceId: string;
  processingHash: string;

  settlementJournalEntryId: string;
  cogsJournalEntryId: string;
  pnlJournalEntryId: string;

  processingHashMatchesAuditUpload: boolean;
  auditUpload?: { id: string; filename: string; uploadedAt: string };

  settlementJe: { status: 'ok' | 'missing' | 'mismatch'; docNumber: string | null; txnDate: string | null };
  cogsJe: JeCompareResult;
  pnlJe: JeCompareResult;
  deterministicPnlOk: boolean;
  warnings: string[];
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
    process.env[parsed.key] = parsed.value;
  }
}

async function loadPlutusEnv(): Promise<void> {
  const cwd = process.cwd();
  await loadEnvFile(path.join(cwd, '.env.local'));
  await loadEnvFile(path.join(cwd, '.env'));
}

function parseArgs(argv: string[]): CliOptions {
  let invoiceId: string | null = null;
  let includeJson = false;

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

    if (arg === '--json') {
      includeJson = true;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { invoiceId, includeJson };
}

function buildProcessingDocNumber(kind: 'C' | 'P', invoiceId: string): string {
  const base = `${kind}${invoiceId}`;
  if (base.length <= 21) return base;
  return `${kind}${invoiceId.slice(-20)}`;
}

function datePartFromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function centsFromAmount(amount: number): number {
  return Math.round(amount * 100);
}

function centsFromNet(net: number): number {
  return Math.round(net * 100);
}

function keyOfLine(line: LineSummary): JournalLineKey {
  return `${line.accountId}::${line.postingType}::${line.description}` as const;
}

function sumLines(lines: LineSummary[]): Map<JournalLineKey, number> {
  const totals = new Map<JournalLineKey, number>();
  for (const line of lines) {
    const key = keyOfLine(line);
    const current = totals.get(key);
    totals.set(key, (current === undefined ? 0 : current) + line.amountCents);
  }
  return totals;
}

function extractLinesFromJe(je: QboJournalEntry): LineSummary[] {
  const result: LineSummary[] = [];

  for (const line of je.Line) {
    const detail = line.JournalEntryLineDetail;
    const accountId = detail?.AccountRef?.value;
    const postingType = detail?.PostingType;
    const amount = line.Amount;

    if (typeof accountId !== 'string' || accountId.trim() === '') continue;
    if (postingType !== 'Debit' && postingType !== 'Credit') continue;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) continue;

    const descriptionRaw = typeof line.Description === 'string' ? line.Description : '';
    const description = descriptionRaw.trim();

    result.push({
      accountId,
      postingType,
      amountCents: centsFromAmount(amount),
      description,
    });
  }

  return result;
}

function compareJeLines(input: { expected: LineSummary[]; actual: LineSummary[] }): { mismatches: Array<{ key: string; expectedCents: number; actualCents: number }> } {
  const expectedTotals = sumLines(input.expected);
  const actualTotals = sumLines(input.actual);

  const keys = new Set<JournalLineKey>();
  for (const key of expectedTotals.keys()) keys.add(key);
  for (const key of actualTotals.keys()) keys.add(key);

  const mismatches: Array<{ key: string; expectedCents: number; actualCents: number }> = [];

  for (const key of Array.from(keys).sort()) {
    const expectedCents = expectedTotals.get(key);
    const actualCents = actualTotals.get(key);
    const expectedValue = expectedCents === undefined ? 0 : expectedCents;
    const actualValue = actualCents === undefined ? 0 : actualCents;
    if (expectedValue !== actualValue) {
      mismatches.push({ key, expectedCents: expectedValue, actualCents: actualValue });
    }
  }

  return { mismatches };
}

async function requireAccounts(connection: QboConnection): Promise<{ accounts: QboAccount[]; updatedConnection?: QboConnection }> {
  return fetchAccounts(connection, { includeInactive: true });
}

function buildSkuToBrandMapsByMarketplace(
  skuRows: Array<{ sku: string; brand: { name: string; marketplace: string } }>,
): Map<string, Map<string, string>> {
  const byMarketplace = new Map<string, Map<string, string>>();

  for (const row of skuRows) {
    const marketplace = row.brand.marketplace;
    let skuToBrand = byMarketplace.get(marketplace);
    if (skuToBrand === undefined) {
      skuToBrand = new Map<string, string>();
      byMarketplace.set(marketplace, skuToBrand);
    }
    skuToBrand.set(normalizeSku(row.sku), row.brand.name);
  }

  return byMarketplace;
}

async function loadAuditRowsForProcessing(input: {
  db: DbClient;
  invoiceId: string;
  marketplace: string;
  sourceFilename: string;
  processedAt: Date;
}): Promise<{ upload: { id: string; filename: string; uploadedAt: Date } | null; rows: SettlementAuditRow[] }> {
  const uploads = await input.db.auditDataUpload.findMany({
    where: { filename: input.sourceFilename },
    orderBy: { uploadedAt: 'desc' },
    select: { id: true, filename: true, uploadedAt: true },
  });

  let chosen: { id: string; filename: string; uploadedAt: Date } | null = null;
  for (const upload of uploads) {
    if (upload.uploadedAt <= input.processedAt) {
      chosen = upload;
      break;
    }
  }

  if (chosen === null && uploads.length > 0) {
    chosen = uploads[0]!;
  }

  if (chosen === null) {
    return { upload: null, rows: [] };
  }

  const storedRows = await input.db.auditDataRow.findMany({
    where: {
      uploadId: chosen.id,
      invoiceId: input.invoiceId,
    },
    select: {
      invoiceId: true,
      market: true,
      date: true,
      orderId: true,
      sku: true,
      quantity: true,
      description: true,
      net: true,
    },
  });

  const scoped: SettlementAuditRow[] = [];
  for (const row of storedRows) {
    const marketplaceId = normalizeAuditMarketToMarketplaceId(row.market);
    if (marketplaceId !== input.marketplace) continue;

    scoped.push({
      invoiceId: row.invoiceId,
      market: row.market,
      date: row.date,
      orderId: row.orderId,
      sku: row.sku,
      quantity: row.quantity,
      description: row.description,
      net: row.net / 100,
    });
  }

  return { upload: chosen, rows: scoped };
}

async function auditSettlementProcessingRow(input: {
  db: DbClient;
  buildDeterministicSkuAllocations: BuildDeterministicSkuAllocations;
  processing: {
    id: string;
    marketplace: string;
    invoiceId: string;
    processingHash: string;
    sourceFilename: string;
    createdAt: Date;
    qboSettlementJournalEntryId: string;
    qboCogsJournalEntryId: string;
    qboPnlReclassJournalEntryId: string;
    settlementDocNumber: string;
    settlementPostedDate: Date;
  };
  connection: QboConnection;
  accounts: QboAccount[];
  setupConfig: Record<string, unknown>;
  skuToBrand: Map<string, string>;
}): Promise<{ result: SettlementAuditResult; updatedConnection?: QboConnection }> {
  const warnings: string[] = [];
  let deterministicPnlOk = true;

  let connection = input.connection;

  const { processing } = input;

  const expectedSettlementDocNumber = processing.settlementDocNumber;
  const expectedSettlementTxnDate = datePartFromUtcDate(processing.settlementPostedDate);

  const settlementRes = await fetchJournalEntryById(connection, processing.qboSettlementJournalEntryId);
  if (settlementRes.updatedConnection) connection = settlementRes.updatedConnection;

  const settlementDocNumberRaw = settlementRes.journalEntry.DocNumber;
  const settlementDocNumber = typeof settlementDocNumberRaw === 'string' ? settlementDocNumberRaw.trim() : null;
  const settlementTxnDate = settlementRes.journalEntry.TxnDate;

  const settlementDocOk = settlementDocNumber === expectedSettlementDocNumber;
  const settlementDateOk = settlementTxnDate === expectedSettlementTxnDate;

  let settlementStatus: 'ok' | 'mismatch' = 'ok';
  if (!settlementDocOk || !settlementDateOk) {
    settlementStatus = 'mismatch';
  }

  const requiredMappingKeys = [
    'invManufacturing',
    'invFreight',
    'invDuty',
    'invMfgAccessories',
    'cogsManufacturing',
    'cogsFreight',
    'cogsDuty',
    'cogsMfgAccessories',
    'amazonSellerFees',
    'amazonFbaFees',
    'amazonStorageFees',
    'amazonAdvertisingCosts',
    'amazonPromotions',
    'amazonFbaInventoryReimbursement',
    'warehousingAwd',
  ];

  const mapping: Record<string, string | undefined> = {};
  for (const key of requiredMappingKeys) {
    mapping[key] = requireAccountMapping(input.setupConfig, key);
  }

  const processingOrders = await input.db.settlementProcessing.findUnique({
    where: { id: processing.id },
    select: {
      orderSales: {
        select: {
          sku: true,
          costManufacturingCents: true,
          costFreightCents: true,
          costDutyCents: true,
          costMfgAccessoriesCents: true,
          principalCents: true,
        },
      },
      orderReturns: {
        select: {
          sku: true,
          costManufacturingCents: true,
          costFreightCents: true,
          costDutyCents: true,
          costMfgAccessoriesCents: true,
          principalCents: true,
        },
      },
    },
  });

  if (processingOrders === null) {
    throw new Error(`Missing SettlementProcessing row: ${processing.id}`);
  }

  const computedSales = processingOrders.orderSales.map((row) => ({
    sku: normalizeSku(row.sku),
    principalCents: row.principalCents,
    costByComponentCents: {
      manufacturing: row.costManufacturingCents,
      freight: row.costFreightCents,
      duty: row.costDutyCents,
      mfgAccessories: row.costMfgAccessoriesCents,
    },
  }));

  const computedReturns = processingOrders.orderReturns.map((row) => ({
    sku: normalizeSku(row.sku),
    principalCents: row.principalCents,
    costByComponentCents: {
      manufacturing: row.costManufacturingCents,
      freight: row.costFreightCents,
      duty: row.costDutyCents,
      mfgAccessories: row.costMfgAccessoriesCents,
    },
  }));

  const zeroCostSales = computedSales.filter(
    (row) =>
      row.principalCents !== 0 &&
      row.costByComponentCents.manufacturing === 0 &&
      row.costByComponentCents.freight === 0 &&
      row.costByComponentCents.duty === 0 &&
      row.costByComponentCents.mfgAccessories === 0,
  );
  if (zeroCostSales.length > 0) {
    warnings.push(`Detected ${zeroCostSales.length} sales with principal but zero cost basis`);
  }

  const salesCogsByBrand = sumCentsByBrandComponent(computedSales, input.skuToBrand);
  const returnsCogsByBrand = sumCentsByBrandComponent(computedReturns, input.skuToBrand);
  const netCogsByBrand = mergeBrandComponentCents(salesCogsByBrand, returnsCogsByBrand, 'sub');

  const salesCogsByBrandSku = sumCentsByBrandComponentSku(computedSales, input.skuToBrand);
  const returnsCogsByBrandSku = sumCentsByBrandComponentSku(computedReturns, input.skuToBrand);
  const netCogsByBrandSku = mergeBrandComponentSkuCents(salesCogsByBrandSku, returnsCogsByBrandSku, 'sub');

  const brandNames = Array.from(new Set(input.skuToBrand.values())).sort();

  const cogsExpectedLines = buildCogsJournalLines(
    netCogsByBrand,
    brandNames,
    mapping,
    input.accounts,
    processing.invoiceId,
    [],
    netCogsByBrandSku,
  ).map((line) => ({
    accountId: line.accountId,
    postingType: line.postingType,
    amountCents: line.amountCents,
    description: line.description.trim(),
  }));

  const auditRowsResult = await loadAuditRowsForProcessing({
    db: input.db,
    invoiceId: processing.invoiceId,
    marketplace: processing.marketplace,
    sourceFilename: processing.sourceFilename,
    processedAt: processing.createdAt,
  });

  const auditRows = auditRowsResult.rows;
  const computedHash = auditRows.length > 0 ? computeProcessingHash(auditRows) : '';
  const hashMatches = computedHash !== '' && computedHash === processing.processingHash;

  if (auditRows.length === 0) {
    warnings.push('No audit rows found for invoice (cannot fully audit P&L allocation)');
  }

  if (!hashMatches) {
    warnings.push('Processing hash mismatch vs stored audit upload rows');
  }

  let minDate = '';
  let maxDate = '';
  for (const row of auditRows) {
    if (minDate === '' || row.date < minDate) minDate = row.date;
    if (maxDate === '' || row.date > maxDate) maxDate = row.date;
  }

  let pnlExpectedLines: LineSummary[] = [];
  if (auditRows.length > 0 && minDate !== '' && maxDate !== '') {
    const skuLessTotalsByBucket = new Map<PnlBucketKey, number>();
    let hasAnyPrincipalSku = false;
    for (const row of auditRows) {
      const description = row.description.trim();
      const sku = row.sku.trim();
      if (sku !== '') {
        if (
          description.startsWith('Amazon Sales - Principal') ||
          description.startsWith('Amazon Refunds - Refunded Principal')
        ) {
          hasAnyPrincipalSku = true;
        }
      }

      const bucket = classifyPnlBucket(row.description);
      if (bucket === null) continue;

      if (sku === '') {
        const cents = centsFromNet(row.net);
        if (cents === 0) continue;
        const current = skuLessTotalsByBucket.get(bucket);
        skuLessTotalsByBucket.set(bucket, (current === undefined ? 0 : current) + cents);
        continue;
      }
    }

    if (!hasAnyPrincipalSku && skuLessTotalsByBucket.size > 0) {
      const reliesOnPrincipalWeights = Array.from(skuLessTotalsByBucket.keys()).some(
        (bucket) => bucket !== 'amazonAdvertisingCosts' && bucket !== 'warehousingAwd',
      );
      if (reliesOnPrincipalWeights) {
        warnings.push('Invoice has SKU-less buckets but no principal SKU rows; allocations may rely on trailing/equal weights');
      }
    }

    const brandResolver = {
      getBrandForSku: (skuRaw: string) => {
        const sku = normalizeSku(skuRaw);
        const brand = input.skuToBrand.get(sku);
        if (!brand) throw new Error(`SKU not mapped to brand: ${sku}`);
        return brand;
      },
    };

    const deterministic = await input.buildDeterministicSkuAllocations({
      rows: auditRows,
      marketplace: processing.marketplace as 'amazon.com' | 'amazon.co.uk',
      invoiceStartDate: minDate,
      invoiceEndDate: maxDate,
      skuToBrand: input.skuToBrand,
    });
    if (deterministic.issues.length > 0) {
      for (const issue of deterministic.issues) {
        warnings.push(`Deterministic allocation issue: ${issue.bucket} ${issue.message}`);
      }
    }

    const pnlAllocation = computePnlAllocation(auditRows, brandResolver, {
      skuAllocationsByBucket: deterministic.skuAllocationsByBucket,
    });
    if (pnlAllocation.unallocatedSkuLessBuckets.length > 0) {
      for (const issue of pnlAllocation.unallocatedSkuLessBuckets) {
        warnings.push(`Unallocated SKU-less bucket: ${issue.bucket} ${issue.reason} (${issue.totalCents} cents)`);
      }
    }

    const blockingUnallocatedBuckets = pnlAllocation.unallocatedSkuLessBuckets;
    deterministicPnlOk = deterministic.issues.length === 0 && blockingUnallocatedBuckets.length === 0;

    pnlExpectedLines = buildPnlJournalLines(
      pnlAllocation.allocationsByBucket,
      mapping,
      input.accounts,
      processing.invoiceId,
      [],
      pnlAllocation.skuBreakdownByBucketBrand,
    ).map((line) => ({
      accountId: line.accountId,
      postingType: line.postingType,
      amountCents: line.amountCents,
      description: line.description.trim(),
    }));
  }

  const hashPrefix = processing.processingHash.slice(0, 10);
  const expectedCogsDoc = buildProcessingDocNumber('C', processing.invoiceId);
  const expectedPnlDoc = buildProcessingDocNumber('P', processing.invoiceId);
  const expectedCogsNotePrefix = `Plutus COGS | Invoice: ${processing.invoiceId} | Hash: ${hashPrefix}`;
  const expectedPnlNotePrefix = `Plutus P&L Reclass | Invoice: ${processing.invoiceId} | Hash: ${hashPrefix}`;

  const expectedTxnDate = expectedSettlementTxnDate;

  let cogsJeResult: JeCompareResult;
  if (isNoopJournalEntryId(processing.qboCogsJournalEntryId)) {
    const status: 'ok' | 'mismatch' = cogsExpectedLines.length === 0 ? 'ok' : 'mismatch';
    if (status === 'mismatch') {
      warnings.push('COGS JE is NOOP but expected lines are non-empty');
    }
    cogsJeResult = {
      status,
      expectedLineCount: cogsExpectedLines.length,
      actualLineCount: 0,
      mismatches: status === 'mismatch' ? [{ key: 'NOOP', expectedCents: 0, actualCents: 0 }] : [],
      docNumber: { expected: expectedCogsDoc, actual: null, ok: status === 'ok' },
      privateNote: { expectedPrefix: expectedCogsNotePrefix, actual: null, ok: status === 'ok' },
      txnDate: { expected: expectedTxnDate, actual: null, ok: status === 'ok' },
    };
  } else if (isQboJournalEntryId(processing.qboCogsJournalEntryId)) {
    const res = await fetchJournalEntryById(connection, processing.qboCogsJournalEntryId);
    if (res.updatedConnection) connection = res.updatedConnection;

    const actualLines = extractLinesFromJe(res.journalEntry);
    const compared = compareJeLines({ expected: cogsExpectedLines, actual: actualLines });

    const docNumberRaw = res.journalEntry.DocNumber;
    const docNumber = typeof docNumberRaw === 'string' ? docNumberRaw.trim() : null;
    const privateNoteRaw = res.journalEntry.PrivateNote;
    const privateNote = typeof privateNoteRaw === 'string' ? privateNoteRaw : null;
    const privateOk = privateNote !== null && privateNote.startsWith(expectedCogsNotePrefix);
    const docOk = docNumber === expectedCogsDoc;
    const txnOk = res.journalEntry.TxnDate === expectedTxnDate;

    const status: 'ok' | 'mismatch' = compared.mismatches.length === 0 && docOk && privateOk && txnOk ? 'ok' : 'mismatch';
    if (!docOk) warnings.push(`COGS JE DocNumber mismatch (expected ${expectedCogsDoc}, got ${docNumber ?? 'null'})`);
    if (!privateOk) warnings.push('COGS JE PrivateNote mismatch');
    if (!txnOk) warnings.push(`COGS JE TxnDate mismatch (expected ${expectedTxnDate}, got ${res.journalEntry.TxnDate})`);

    cogsJeResult = {
      status,
      expectedLineCount: cogsExpectedLines.length,
      actualLineCount: actualLines.length,
      mismatches: compared.mismatches,
      docNumber: { expected: expectedCogsDoc, actual: docNumber, ok: docOk },
      privateNote: { expectedPrefix: expectedCogsNotePrefix, actual: privateNote, ok: privateOk },
      txnDate: { expected: expectedTxnDate, actual: res.journalEntry.TxnDate, ok: txnOk },
    };
  } else {
    warnings.push(`COGS JE id is not a QBO id or NOOP: ${processing.qboCogsJournalEntryId}`);
    cogsJeResult = {
      status: 'missing',
      expectedLineCount: cogsExpectedLines.length,
      actualLineCount: 0,
      mismatches: [{ key: 'MISSING', expectedCents: 0, actualCents: 0 }],
    };
  }

  let pnlJeResult: JeCompareResult;
  if (isNoopJournalEntryId(processing.qboPnlReclassJournalEntryId)) {
    const status: 'ok' | 'mismatch' = pnlExpectedLines.length === 0 ? 'ok' : 'mismatch';
    if (status === 'mismatch') {
      warnings.push('P&L JE is NOOP but expected lines are non-empty');
    }
    pnlJeResult = {
      status,
      expectedLineCount: pnlExpectedLines.length,
      actualLineCount: 0,
      mismatches: status === 'mismatch' ? [{ key: 'NOOP', expectedCents: 0, actualCents: 0 }] : [],
      docNumber: { expected: expectedPnlDoc, actual: null, ok: status === 'ok' },
      privateNote: { expectedPrefix: expectedPnlNotePrefix, actual: null, ok: status === 'ok' },
      txnDate: { expected: expectedTxnDate, actual: null, ok: status === 'ok' },
    };
  } else if (isQboJournalEntryId(processing.qboPnlReclassJournalEntryId)) {
    const res = await fetchJournalEntryById(connection, processing.qboPnlReclassJournalEntryId);
    if (res.updatedConnection) connection = res.updatedConnection;

    const actualLines = extractLinesFromJe(res.journalEntry);
    const compared = compareJeLines({ expected: pnlExpectedLines, actual: actualLines });

    const docNumberRaw = res.journalEntry.DocNumber;
    const docNumber = typeof docNumberRaw === 'string' ? docNumberRaw.trim() : null;
    const privateNoteRaw = res.journalEntry.PrivateNote;
    const privateNote = typeof privateNoteRaw === 'string' ? privateNoteRaw : null;
    const privateOk = privateNote !== null && privateNote.startsWith(expectedPnlNotePrefix);
    const docOk = docNumber === expectedPnlDoc;
    const txnOk = res.journalEntry.TxnDate === expectedTxnDate;

    const status: 'ok' | 'mismatch' = compared.mismatches.length === 0 && docOk && privateOk && txnOk ? 'ok' : 'mismatch';
    if (!docOk) warnings.push(`P&L JE DocNumber mismatch (expected ${expectedPnlDoc}, got ${docNumber ?? 'null'})`);
    if (!privateOk) warnings.push('P&L JE PrivateNote mismatch');
    if (!txnOk) warnings.push(`P&L JE TxnDate mismatch (expected ${expectedTxnDate}, got ${res.journalEntry.TxnDate})`);

    pnlJeResult = {
      status,
      expectedLineCount: pnlExpectedLines.length,
      actualLineCount: actualLines.length,
      mismatches: compared.mismatches,
      docNumber: { expected: expectedPnlDoc, actual: docNumber, ok: docOk },
      privateNote: { expectedPrefix: expectedPnlNotePrefix, actual: privateNote, ok: privateOk },
      txnDate: { expected: expectedTxnDate, actual: res.journalEntry.TxnDate, ok: txnOk },
    };
  } else {
    warnings.push(`P&L JE id is not a QBO id or NOOP: ${processing.qboPnlReclassJournalEntryId}`);
    pnlJeResult = {
      status: 'missing',
      expectedLineCount: pnlExpectedLines.length,
      actualLineCount: 0,
      mismatches: [{ key: 'MISSING', expectedCents: 0, actualCents: 0 }],
    };
  }

  const auditUpload = auditRowsResult.upload
    ? {
        id: auditRowsResult.upload.id,
        filename: auditRowsResult.upload.filename,
        uploadedAt: auditRowsResult.upload.uploadedAt.toISOString(),
      }
    : undefined;

  const result: SettlementAuditResult = {
    marketplace: processing.marketplace,
    invoiceId: processing.invoiceId,
    processingHash: processing.processingHash,
    settlementJournalEntryId: processing.qboSettlementJournalEntryId,
    cogsJournalEntryId: processing.qboCogsJournalEntryId,
    pnlJournalEntryId: processing.qboPnlReclassJournalEntryId,
    processingHashMatchesAuditUpload: hashMatches,
    auditUpload,
    settlementJe: {
      status: settlementStatus,
      docNumber: settlementDocNumber,
      txnDate: settlementTxnDate,
    },
    cogsJe: cogsJeResult,
    pnlJe: pnlJeResult,
      warnings,
      deterministicPnlOk,
    };

  return { result, updatedConnection: connection };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await loadPlutusEnv();

  const { db } = await import('@/lib/db');
  const { buildDeterministicSkuAllocations } = await import('@/lib/plutus/fee-allocation');

  const connectionMaybe = await getQboConnection();
  if (connectionMaybe === null) {
    throw new Error('Not connected to QBO (missing server connection file)');
  }
  let connection: QboConnection = connectionMaybe;

  const setupConfig = await db.setupConfig.findFirst();
  if (setupConfig === null) throw new Error('Missing SetupConfig');

  const accountsRes = await requireAccounts(connection);
  if (accountsRes.updatedConnection) {
    connection = accountsRes.updatedConnection;
  }
  const accounts = accountsRes.accounts;

  const skuRows = await db.sku.findMany({ include: { brand: true } });
  const skuToBrandByMarketplace = buildSkuToBrandMapsByMarketplace(skuRows);

  const where = options.invoiceId
    ? {
        marketplace_invoiceId: {
          marketplace: 'amazon.com',
          invoiceId: options.invoiceId,
        },
      }
    : undefined;

  const processed = where
    ? await db.settlementProcessing.findUnique({
        where,
        select: {
          id: true,
          marketplace: true,
          invoiceId: true,
          processingHash: true,
          sourceFilename: true,
          createdAt: true,
          qboSettlementJournalEntryId: true,
          qboCogsJournalEntryId: true,
          qboPnlReclassJournalEntryId: true,
          settlementDocNumber: true,
          settlementPostedDate: true,
        },
      })
    : null;

  const processingRows = processed
    ? [processed]
    : await db.settlementProcessing.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          marketplace: true,
          invoiceId: true,
          processingHash: true,
          sourceFilename: true,
          createdAt: true,
          qboSettlementJournalEntryId: true,
          qboCogsJournalEntryId: true,
          qboPnlReclassJournalEntryId: true,
          settlementDocNumber: true,
          settlementPostedDate: true,
        },
      });

  if (processed === null && where !== undefined) {
    throw new Error(`SettlementProcessing not found for invoiceId=${options.invoiceId}`);
  }

  const results: SettlementAuditResult[] = [];

  for (const row of processingRows) {
    const skuToBrand = skuToBrandByMarketplace.get(row.marketplace);
    if (skuToBrand === undefined) {
      throw new Error(`Missing SKU mappings for marketplace: ${row.marketplace}`);
    }

    const audited = await auditSettlementProcessingRow({
      db,
      buildDeterministicSkuAllocations,
      processing: row,
      connection,
      accounts,
      setupConfig,
      skuToBrand,
    });
    if (audited.updatedConnection) connection = audited.updatedConnection;
    results.push(audited.result);
  }

  await saveServerQboConnection(connection);

  const ok = results.filter(
    (r) => r.settlementJe.status === 'ok' && r.cogsJe.status === 'ok' && r.pnlJe.status === 'ok' && r.deterministicPnlOk,
  );
  const mismatched = results.filter(
    (r) =>
      r.settlementJe.status !== 'ok' ||
      r.cogsJe.status !== 'ok' ||
      r.pnlJe.status !== 'ok' ||
      r.deterministicPnlOk !== true,
  );

  if (!options.includeJson) {
    for (const row of results) {
      const status =
        row.settlementJe.status === 'ok' && row.cogsJe.status === 'ok' && row.pnlJe.status === 'ok' && row.deterministicPnlOk
          ? 'ok'
          : 'not ok';
      console.log(`${status} ${row.invoiceId} | settlement=${row.settlementJournalEntryId} cogs=${row.cogsJournalEntryId} pnl=${row.pnlJournalEntryId}`);
      for (const warning of row.warnings) {
        console.log(`  warn: ${warning}`);
      }
      if (row.cogsJe.status !== 'ok') {
        console.log(`  cogs mismatches: ${row.cogsJe.mismatches.length}`);
      }
      if (row.pnlJe.status !== 'ok') {
        console.log(`  pnl mismatches: ${row.pnlJe.mismatches.length}`);
      }
    }

    console.log(`\nTotals: ${results.length} processed | ok=${ok.length} not_ok=${mismatched.length}`);
  } else {
    console.log(JSON.stringify({ options, totals: { processed: results.length, ok: ok.length, notOk: mismatched.length }, results }, null, 2));
  }

  if (mismatched.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
