import { promises as fs } from 'node:fs';

import { buildQboJournalEntriesFromUsSettlementDraft, buildUsSettlementDraftFromSpApiFinances } from '@/lib/amazon-finances/us-settlement-builder';
import {
  fetchAllFinancialEventsByGroupId,
  findFinancialEventGroupIdForSettlementId,
  listAllFinancialEventGroups,
} from '@/lib/amazon-finances/sp-api-finances';
import { fromCents } from '@/lib/inventory/money';
import { normalizeSku } from '@/lib/plutus/settlement-validation';
import { createJournalEntry, fetchJournalEntries, fetchJournalEntryById, type QboConnection, type QboJournalEntry } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

type CliOptions = {
  settlementIds: string[];
  startDate: string;
  amazonEnvPath: string;
  plutusEnvPath: string;
  templateDocNumber: string | null;
  post: boolean;
  process: boolean;
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

function parseArgs(argv: string[]): CliOptions {
  let settlementIds: string[] = [];
  let startDate = '2025-12-01';
  let amazonEnvPath = '../talos/.env.local';
  let plutusEnvPath = '.env.local';
  let templateDocNumber: string | null = null;
  let post = false;
  let process = false;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === '--settlement-id') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --settlement-id');
      settlementIds = settlementIds.concat(
        next
          .split(',')
          .map((x) => x.trim())
          .filter((x) => x !== ''),
      );
      i += 2;
      continue;
    }

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

    if (arg === '--template-doc-number') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --template-doc-number');
      templateDocNumber = next;
      i += 2;
      continue;
    }

    if (arg === '--post') {
      post = true;
      i += 1;
      continue;
    }

    if (arg === '--process') {
      process = true;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (settlementIds.length === 0) {
    throw new Error('Usage: pnpm settlements:us:ingest:spapi --settlement-id <id[,id...]> [--post] [--process]');
  }

  return {
    settlementIds: Array.from(new Set(settlementIds)).sort(),
    startDate,
    amazonEnvPath,
    plutusEnvPath,
    templateDocNumber,
    post,
    process,
  };
}

async function fetchJeByDocNumber(connection: any, docNumber: string): Promise<{ je: QboJournalEntry; updatedConnection?: any }> {
  let activeConnection = connection;
  const page = await fetchJournalEntries(activeConnection, { docNumberContains: docNumber, maxResults: 10, startPosition: 1 });
  if (page.updatedConnection) {
    activeConnection = page.updatedConnection;
  }

  const matches = page.journalEntries.filter((je: any) => je.DocNumber === docNumber);
  if (matches.length !== 1) {
    throw new Error(`Expected 1 JE for DocNumber ${docNumber}, got ${matches.length}`);
  }

  const full = await fetchJournalEntryById(activeConnection, (matches[0] as { Id: string }).Id);
  if (full.updatedConnection) {
    activeConnection = full.updatedConnection;
  }

  return { je: full.journalEntry, updatedConnection: activeConnection };
}

function extractAccountMappingFromJournalEntry(je: QboJournalEntry): {
  accountIdByMemo: Map<string, string>;
  bankAccountId: string;
  paymentAccountId: string;
} {
  const lines = Array.isArray(je.Line) ? je.Line : [];
  const accountIdByMemo = new Map<string, string>();
  let bankAccountId = '';
  let paymentAccountId = '';

  for (const line of lines) {
    const detail = line.JournalEntryLineDetail;
    if (!detail) continue;
    const accountId = detail.AccountRef?.value;
    if (typeof accountId !== 'string') continue;

    const description = typeof line.Description === 'string' ? line.Description : '';
    if (description === '') continue;

    if (description === 'Transfer to Bank') {
      bankAccountId = accountId;
      continue;
    }
    if (description === 'Payment to Amazon') {
      paymentAccountId = accountId;
      continue;
    }

    if (!accountIdByMemo.has(description)) {
      accountIdByMemo.set(description, accountId);
    }
  }

  return { accountIdByMemo, bankAccountId, paymentAccountId };
}

function getLineAccountIdByDescription(je: QboJournalEntry, description: string): string | null {
  const lines = Array.isArray(je.Line) ? je.Line : [];
  for (const line of lines) {
    const detail = line.JournalEntryLineDetail;
    if (!detail) continue;
    const accountId = detail.AccountRef?.value;
    if (typeof accountId !== 'string') continue;
    const desc = typeof line.Description === 'string' ? line.Description : '';
    if (desc === description) return accountId;
  }
  return null;
}

async function findAccountIdInRecentLmbUsSettlementJournals(input: {
  connection: any;
  startDate: string;
  description: string;
}): Promise<{ accountId: string; updatedConnection?: any }> {
  const pageSize = 100;
  let startPosition = 1;
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

    for (const je of page.journalEntries) {
      const full = await fetchJournalEntryById(connection, je.Id);
      if (full.updatedConnection) {
        connection = full.updatedConnection;
      }

      const accountId = getLineAccountIdByDescription(full.journalEntry, input.description);
      if (accountId) {
        return { accountId, updatedConnection: connection };
      }
    }

    if (page.journalEntries.length === 0) break;
    startPosition += page.journalEntries.length;
    if (startPosition > page.totalCount) break;
  }

  throw new Error(`Could not find '${input.description}' line in any recent LMB-US settlement JE`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  await loadAmazonEnvFile(options.amazonEnvPath);
  await loadPlutusEnvFile(options.plutusEnvPath);

  const { db } = await import('@/lib/db');
  const { processSettlement } = await import('@/lib/plutus/settlement-processing');

  const skus = await db.sku.findMany({ include: { brand: true } });
  const skuToBrandName = new Map<string, string>();
  for (const row of skus) {
    if (row.brand.marketplace !== 'amazon.com') continue;
    skuToBrandName.set(normalizeSku(row.sku), row.brand.name);
  }

  const maybeConnection = await getQboConnection();
  if (!maybeConnection) throw new Error('Not connected to QBO');
  let connection: QboConnection = maybeConnection;

  let templateJe: QboJournalEntry;
  if (options.templateDocNumber) {
    const fetched = await fetchJeByDocNumber(connection, options.templateDocNumber);
    if (fetched.updatedConnection) connection = fetched.updatedConnection;
    templateJe = fetched.je;
  } else {
    const page = await fetchJournalEntries(connection, {
      docNumberContains: 'LMB-US-',
      startDate: options.startDate,
      maxResults: 1,
      startPosition: 1,
    });
    if (page.updatedConnection) connection = page.updatedConnection;
    if (page.journalEntries.length !== 1) {
      throw new Error('Could not find a template LMB-US-* journal entry in QBO');
    }
    const full = await fetchJournalEntryById(connection, page.journalEntries[0]!.Id);
    if (full.updatedConnection) connection = full.updatedConnection;
    templateJe = full.journalEntry;
  }

  const templateMapping = extractAccountMappingFromJournalEntry(templateJe);
  let bankAccountId = templateMapping.bankAccountId;
  let paymentAccountId = templateMapping.paymentAccountId;

  if (bankAccountId === '') {
    const found = await findAccountIdInRecentLmbUsSettlementJournals({
      connection,
      startDate: options.startDate,
      description: 'Transfer to Bank',
    });
    if (found.updatedConnection) connection = found.updatedConnection;
    bankAccountId = found.accountId;
  }

  if (paymentAccountId === '') {
    const found = await findAccountIdInRecentLmbUsSettlementJournals({
      connection,
      startDate: options.startDate,
      description: 'Payment to Amazon',
    });
    if (found.updatedConnection) connection = found.updatedConnection;
    paymentAccountId = found.accountId;
  }

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
    if (typeof id !== 'string' || id.trim() === '') continue;
    groupById.set(id, g);
  }

  const runSummary: Array<Record<string, unknown>> = [];

  for (const settlementId of options.settlementIds) {
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

    const draft = buildUsSettlementDraftFromSpApiFinances({
      settlementId,
      eventGroupId,
      eventGroup,
      events,
      skuToBrandName,
    });

    const jeDrafts = buildQboJournalEntriesFromUsSettlementDraft({
      draft,
      privateNote: `Plutus (SP-API Finances) | Settlement: ${settlementId} | Group: ${eventGroupId}`,
      bankAccountId,
      paymentAccountId,
      accountIdByMemo: templateMapping.accountIdByMemo,
    });

    for (const jeDraft of jeDrafts) {
      const existing = await fetchJournalEntries(connection, {
        docNumberContains: jeDraft.docNumber,
        maxResults: 10,
        startPosition: 1,
      });
      if (existing.updatedConnection) connection = existing.updatedConnection;
      const exact = existing.journalEntries.find((x: any) => x.DocNumber === jeDraft.docNumber);
      if (exact) {
        throw new Error(`QBO JE already exists for DocNumber ${jeDraft.docNumber} (settlement ${settlementId})`);
      }
    }

    runSummary.push({
      settlementId,
      eventGroupId,
      segments: draft.segments.map((s) => ({ docNumber: s.docNumber, txnDate: s.txnDate, memoLines: s.memoTotalsCents.size, auditRows: s.auditRows.length })),
      action: options.post ? 'post' : 'dry_run',
    });

    if (!options.post) {
      continue;
    }

    const invoiceIds = draft.segments.map((s) => s.docNumber);
    await db.auditDataRow.deleteMany({
      where: {
        invoiceId: { in: invoiceIds },
        market: { equals: 'us', mode: 'insensitive' },
      },
    });

    const uploadFilename = `spapi-finances-settlement-${settlementId}.json`;
    const uploadRows = draft.segments.flatMap((s) => s.auditRows);

    await db.auditDataUpload.create({
      data: {
        filename: uploadFilename,
        rowCount: uploadRows.length,
        invoiceCount: draft.segments.length,
        rows: {
          createMany: {
            data: uploadRows.map((r) => ({
              invoiceId: r.invoiceId,
              market: r.market,
              date: r.date,
              orderId: r.orderId,
              sku: r.sku,
              quantity: r.quantity,
              description: r.description,
              net: r.netCents,
            })),
          },
        },
      },
    });

    const postedJeIdsByDocNumber = new Map<string, string>();

    for (const jeDraft of jeDrafts) {
      const res = await createJournalEntry(connection, {
        txnDate: jeDraft.txnDate,
        docNumber: jeDraft.docNumber,
        privateNote: jeDraft.privateNote,
        lines: jeDraft.lines.map((l) => ({
          amount: l.amount,
          postingType: l.postingType,
          accountId: l.accountId,
          description: l.description,
        })),
      });
      if (res.updatedConnection) connection = res.updatedConnection;
      postedJeIdsByDocNumber.set(jeDraft.docNumber, res.journalEntry.Id);
    }

    if (options.process) {
      for (const segment of draft.segments) {
        const jeId = postedJeIdsByDocNumber.get(segment.docNumber);
        if (!jeId) throw new Error(`Missing posted JE id for segment ${segment.docNumber}`);

        const auditRows = segment.auditRows.map((r) => ({
          invoice: r.invoiceId,
          market: r.market,
          date: r.date,
          orderId: r.orderId,
          sku: r.sku,
          quantity: r.quantity,
          description: r.description,
          net: fromCents(r.netCents),
        }));

        const result = await processSettlement({
          connection,
          settlementJournalEntryId: jeId,
          auditRows,
          sourceFilename: uploadFilename,
          invoiceId: segment.docNumber,
        });
        if (result.updatedConnection) connection = result.updatedConnection;
        if (!result.result.ok) {
          throw new Error(
            `Settlement processing blocked for ${segment.docNumber}: ${JSON.stringify(result.result.preview.blocks)}`,
          );
        }
      }
    }
  }

  await saveServerQboConnection(connection);

  console.log(JSON.stringify({ options, runSummary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
