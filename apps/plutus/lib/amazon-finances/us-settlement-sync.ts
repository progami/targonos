import { buildQboJournalEntriesFromUsSettlementDraft, buildUsSettlementDraftFromSpApiFinances } from '@/lib/amazon-finances/us-settlement-builder';
import {
  fetchAllFinancialEventsByGroupId,
  findFinancialEventGroupIdForSettlementId,
  listAllFinancialEventGroups,
  listSettlementEventGroupsFromTransactions,
} from '@/lib/amazon-finances/sp-api-finances';
import { fromCents } from '@/lib/inventory/money';
import { db } from '@/lib/db';
import { normalizeSku } from '@/lib/plutus/settlement-validation';
import { processSettlement } from '@/lib/plutus/settlement-processing';
import { createJournalEntry, fetchJournalEntries, fetchJournalEntryById, type QboConnection } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

type SettlementDraftBundle = {
  settlementId: string;
  eventGroupId: string;
  draft: ReturnType<typeof buildUsSettlementDraftFromSpApiFinances>;
};

export type UsSpApiSettlementSyncInput = {
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD (optional)
  settlementIds?: string[];
  postToQbo: boolean;
  process: boolean;
};

export type UsSpApiSettlementSyncSegmentResult = {
  settlementId: string;
  eventGroupId: string;
  docNumber: string;
  txnDate: string;
  qboJournalEntryId: string | null;
  qboAction: 'existing' | 'posted' | 'skipped' | 'error';
  processed: boolean;
  reason?: string;
  error?: string;
};

export type UsSpApiSettlementSyncResult = {
  options: UsSpApiSettlementSyncInput;
  totals: {
    settlements: number;
    segments: number;
    posted: number;
    existing: number;
    processed: number;
    skipped: number;
    errors: number;
  };
  segments: UsSpApiSettlementSyncSegmentResult[];
};

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

function computePostedAfterIso(startDate: string): string {
  return `${startDate}T00:00:00.000Z`;
}

function computePostedBeforeIso(endDate: string | undefined): string {
  if (endDate !== undefined) {
    return `${endDate}T23:59:59.999Z`;
  }
  return new Date(Date.now() - 5 * 60 * 1000).toISOString();
}

function computeGroupStartedAfterIso(startDate: string): string {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
  return new Date(start.getTime() - sixtyDaysMs).toISOString();
}

async function buildSkuToBrandName(): Promise<Map<string, string>> {
  const skus = await db.sku.findMany({ include: { brand: true } });
  const skuToBrandName = new Map<string, string>();
  for (const row of skus) {
    if (row.brand.marketplace !== 'amazon.com') continue;
    skuToBrandName.set(normalizeSku(row.sku), row.brand.name);
  }
  return skuToBrandName;
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

  const exact = existing.journalEntries.find((je) => je.DocNumber === docNumber);
  if (!exact) {
    return { journalEntryId: null, updatedConnection: activeConnection === connection ? undefined : activeConnection };
  }

  return { journalEntryId: exact.Id, updatedConnection: activeConnection === connection ? undefined : activeConnection };
}

async function buildAccountMappingFromExistingUsSettlements(input: {
  connection: QboConnection;
  scanStartDate?: string;
  requiredMemos: Set<string>;
  needBankAccount: boolean;
  needPaymentAccount: boolean;
}): Promise<{
  accountIdByMemo: Map<string, string>;
  bankAccountId: string;
  paymentAccountId: string;
  updatedConnection?: QboConnection;
}> {
  let activeConnection = input.connection;

  const remainingMemos = new Set(Array.from(input.requiredMemos));
  const accountIdByMemo = new Map<string, string>();
  let bankAccountId = '';
  let paymentAccountId = '';

  const pageSize = 100;
  let startPosition = 1;

  while (true) {
    const page = await fetchJournalEntries(activeConnection, {
      docNumberContains: 'LMB-US-',
      startDate: input.scanStartDate,
      maxResults: pageSize,
      startPosition,
    });

    if (page.updatedConnection) {
      activeConnection = page.updatedConnection;
    }

    for (const je of page.journalEntries) {
      const full = await fetchJournalEntryById(activeConnection, je.Id);
      if (full.updatedConnection) {
        activeConnection = full.updatedConnection;
      }

      const lines = Array.isArray(full.journalEntry.Line) ? full.journalEntry.Line : [];
      for (const line of lines) {
        const detail = line.JournalEntryLineDetail;
        if (!detail) continue;
        const accountId = detail.AccountRef?.value;
        if (typeof accountId !== 'string' || accountId.trim() === '') continue;

        const description = typeof line.Description === 'string' ? line.Description.trim() : '';
        if (description === '') continue;

        if (description === 'Transfer to Bank') {
          if (bankAccountId !== '' && bankAccountId !== accountId) {
            throw new Error(`Multiple bank accounts detected for 'Transfer to Bank': ${bankAccountId}, ${accountId}`);
          }
          bankAccountId = accountId;
          continue;
        }

        if (description === 'Payment to Amazon') {
          if (paymentAccountId !== '' && paymentAccountId !== accountId) {
            throw new Error(`Multiple payment accounts detected for 'Payment to Amazon': ${paymentAccountId}, ${accountId}`);
          }
          paymentAccountId = accountId;
          continue;
        }

        if (!remainingMemos.has(description)) continue;

        const existing = accountIdByMemo.get(description);
        if (existing !== undefined && existing !== accountId) {
          throw new Error(`Memo '${description}' maps to multiple accounts: ${existing}, ${accountId}`);
        }

        accountIdByMemo.set(description, accountId);
        remainingMemos.delete(description);
      }

      const hasAllMemos = remainingMemos.size === 0;
      const hasBank = input.needBankAccount ? bankAccountId !== '' : true;
      const hasPayment = input.needPaymentAccount ? paymentAccountId !== '' : true;
      if (hasAllMemos && hasBank && hasPayment) {
        return {
          accountIdByMemo,
          bankAccountId,
          paymentAccountId,
          updatedConnection: activeConnection === input.connection ? undefined : activeConnection,
        };
      }
    }

    if (page.journalEntries.length === 0) break;
    startPosition += page.journalEntries.length;
    if (startPosition > page.totalCount) break;
  }

  const missingMemos = Array.from(remainingMemos).sort();
  if (missingMemos.length > 0) {
    throw new Error(`Missing account mappings for memos: ${missingMemos.join(' | ')}`);
  }

  if (input.needBankAccount && bankAccountId === '') {
    throw new Error("Missing 'Transfer to Bank' account id (no positive settlements found in QBO history)");
  }
  if (input.needPaymentAccount && paymentAccountId === '') {
    throw new Error("Missing 'Payment to Amazon' account id (no negative settlements found in QBO history)");
  }

  return {
    accountIdByMemo,
    bankAccountId,
    paymentAccountId,
    updatedConnection: activeConnection === input.connection ? undefined : activeConnection,
  };
}

export async function syncUsSettlementsFromSpApiFinances(input: UsSpApiSettlementSyncInput): Promise<UsSpApiSettlementSyncResult> {
  const startDate = requireIsoDay(input.startDate, 'startDate');
  const endDate = input.endDate === undefined ? undefined : requireIsoDay(input.endDate, 'endDate');

  const postToQbo = input.postToQbo === true;
  const process = input.process === true;

  const settlementIds = Array.isArray(input.settlementIds)
    ? input.settlementIds.map((id) => String(id).trim()).filter((id) => id !== '')
    : [];

  const connection = await getQboConnection();
  if (!connection) {
    throw new Error('Not connected to QBO');
  }
  let activeConnection: QboConnection = connection;

  const skuToBrandName = await buildSkuToBrandName();

  const postedAfterIso = computePostedAfterIso(startDate);
  const postedBeforeIso = computePostedBeforeIso(endDate);

  let settlementToGroupId: Map<string, string>;
  if (settlementIds.length > 0) {
    settlementToGroupId = new Map<string, string>();
    for (const settlementId of Array.from(new Set(settlementIds)).sort()) {
      const eventGroupId = await findFinancialEventGroupIdForSettlementId({
        tenantCode: 'US',
        settlementId,
        postedAfterIso,
        postedBeforeIso,
      });
      settlementToGroupId.set(settlementId, eventGroupId);
    }
  } else {
    settlementToGroupId = await listSettlementEventGroupsFromTransactions({
      tenantCode: 'US',
      postedAfterIso,
      postedBeforeIso,
    });
  }

  const groupStartedAfterIso = computeGroupStartedAfterIso(startDate);
  const eventGroups = await listAllFinancialEventGroups({
    tenantCode: 'US',
    startedAfterIso: groupStartedAfterIso,
    startedBeforeIso: postedBeforeIso,
  });

  const groupById = new Map<string, any>();
  for (const g of eventGroups) {
    const id = g.FinancialEventGroupId;
    if (typeof id !== 'string' || id.trim() === '') continue;
    groupById.set(id, g);
  }

  const bundles: SettlementDraftBundle[] = [];
  const requiredMemos = new Set<string>();
  let needBankAccount = false;
  let needPaymentAccount = false;

  for (const [settlementId, eventGroupId] of Array.from(settlementToGroupId.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
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

    if (draft.originalTotalCents > 0) needBankAccount = true;
    if (draft.originalTotalCents < 0) needPaymentAccount = true;

    for (const segment of draft.segments) {
      for (const [memo, cents] of segment.memoTotalsCents.entries()) {
        if (cents === 0) continue;
        requiredMemos.add(memo);
      }
    }

    bundles.push({ settlementId, eventGroupId, draft });
  }

  const mapping = await buildAccountMappingFromExistingUsSettlements({
    connection: activeConnection,
    requiredMemos,
    needBankAccount,
    needPaymentAccount,
  });
  if (mapping.updatedConnection) {
    activeConnection = mapping.updatedConnection;
  }

  const segments: UsSpApiSettlementSyncSegmentResult[] = [];

  for (const bundle of bundles) {
    const uploadFilename = `spapi-finances-settlement-${bundle.settlementId}.json`;

    const invoiceIds = bundle.draft.segments.map((s) => s.docNumber);
    await db.auditDataRow.deleteMany({
      where: {
        invoiceId: { in: invoiceIds },
        market: { equals: 'us', mode: 'insensitive' },
      },
    });

    const uploadRows = bundle.draft.segments.flatMap((s) => s.auditRows);

    const upload = await db.auditDataUpload.create({
      data: {
        filename: uploadFilename,
        rowCount: uploadRows.length,
        invoiceCount: bundle.draft.segments.length,
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

    const jeDrafts = buildQboJournalEntriesFromUsSettlementDraft({
      draft: bundle.draft,
      privateNote: `Plutus (SP-API Finances) | Settlement: ${bundle.settlementId} | Group: ${bundle.eventGroupId} | Upload: ${upload.id}`,
      bankAccountId: mapping.bankAccountId,
      paymentAccountId: mapping.paymentAccountId,
      accountIdByMemo: mapping.accountIdByMemo,
    });

    for (const jeDraft of jeDrafts) {
      try {
        const existingLookup = await findExistingJournalEntryIdByDocNumber(activeConnection, jeDraft.docNumber);
        if (existingLookup.updatedConnection) {
          activeConnection = existingLookup.updatedConnection;
        }

        let qboJournalEntryId: string | null = existingLookup.journalEntryId;
        let qboAction: 'existing' | 'posted' | 'skipped' = 'existing';

        if (qboJournalEntryId === null) {
          if (!postToQbo) {
            segments.push({
              settlementId: bundle.settlementId,
              eventGroupId: bundle.eventGroupId,
              docNumber: jeDraft.docNumber,
              txnDate: jeDraft.txnDate,
              qboJournalEntryId: null,
              qboAction: 'skipped',
              processed: false,
              reason: 'QBO posting disabled',
            });
            continue;
          }

          const res = await createJournalEntry(activeConnection, {
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
          if (res.updatedConnection) {
            activeConnection = res.updatedConnection;
          }
          qboJournalEntryId = res.journalEntry.Id;
          qboAction = 'posted';
        }

        if (!process) {
          segments.push({
            settlementId: bundle.settlementId,
            eventGroupId: bundle.eventGroupId,
            docNumber: jeDraft.docNumber,
            txnDate: jeDraft.txnDate,
            qboJournalEntryId,
            qboAction,
            processed: false,
            reason: 'Processing disabled',
          });
          continue;
        }

        const segmentDraft = bundle.draft.segments.find((s) => s.docNumber === jeDraft.docNumber);
        if (!segmentDraft) {
          throw new Error(`Missing segment draft for ${jeDraft.docNumber}`);
        }

        const auditRows = segmentDraft.auditRows.map((r) => ({
          invoice: r.invoiceId,
          market: r.market,
          date: r.date,
          orderId: r.orderId,
          sku: r.sku,
          quantity: r.quantity,
          description: r.description,
          net: fromCents(r.netCents),
        }));

        const processResult = await processSettlement({
          connection: activeConnection,
          settlementJournalEntryId: qboJournalEntryId,
          auditRows,
          sourceFilename: uploadFilename,
          invoiceId: segmentDraft.docNumber,
        });
        if (processResult.updatedConnection) {
          activeConnection = processResult.updatedConnection;
        }

        if (!processResult.result.ok) {
          segments.push({
            settlementId: bundle.settlementId,
            eventGroupId: bundle.eventGroupId,
            docNumber: jeDraft.docNumber,
            txnDate: jeDraft.txnDate,
            qboJournalEntryId,
            qboAction,
            processed: false,
            reason: `Processing blocked (${processResult.result.preview.blocks.length} blocks)`,
          });
          continue;
        }

        segments.push({
          settlementId: bundle.settlementId,
          eventGroupId: bundle.eventGroupId,
          docNumber: jeDraft.docNumber,
          txnDate: jeDraft.txnDate,
          qboJournalEntryId,
          qboAction,
          processed: true,
        });
      } catch (error) {
        segments.push({
          settlementId: bundle.settlementId,
          eventGroupId: bundle.eventGroupId,
          docNumber: jeDraft.docNumber,
          txnDate: jeDraft.txnDate,
          qboJournalEntryId: null,
          qboAction: 'error',
          processed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await saveServerQboConnection(activeConnection);

  const posted = segments.filter((s) => s.qboAction === 'posted').length;
  const existing = segments.filter((s) => s.qboAction === 'existing').length;
  const processedCount = segments.filter((s) => s.processed).length;
  const skipped = segments.filter((s) => s.qboAction === 'skipped').length;
  const errors = segments.filter((s) => s.qboAction === 'error').length;

  return {
    options: {
      startDate,
      endDate,
      settlementIds: settlementIds.length > 0 ? settlementIds : undefined,
      postToQbo,
      process,
    },
    totals: {
      settlements: bundles.length,
      segments: segments.length,
      posted,
      existing,
      processed: processedCount,
      skipped,
      errors,
    },
    segments,
  };
}
