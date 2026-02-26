import { buildQboJournalEntriesFromUsSettlementDraft, buildUsSettlementDraftFromSpApiFinances } from '@/lib/amazon-finances/us-settlement-builder';
import {
  fetchAllFinancialEventsByGroupId,
  findFinancialEventGroupIdForSettlementId,
  listAllFinancialEventGroups,
  listSettlementEventGroupsFromTransactions,
} from '@/lib/amazon-finances/sp-api-finances';
import {
  buildSettlementAuditCsvBytes,
  buildSettlementAuditFilename,
  buildSettlementFullAuditTrailCsvBytes,
  buildSettlementFullAuditTrailFilename,
  buildSettlementMtdDailySummaryCsvBytes,
  buildSettlementMtdDailySummaryFilename,
} from '@/lib/amazon-finances/settlement-evidence';
import { fromCents } from '@/lib/inventory/money';
import { db } from '@/lib/db';
import { computeProcessingHash, normalizeSku } from '@/lib/plutus/settlement-validation';
import { processSettlement } from '@/lib/plutus/settlement-processing';
import { buildPlutusSettlementDocNumber, isSettlementDocNumber, normalizeSettlementDocNumber } from '@/lib/plutus/settlement-doc-number';
import {
  createJournalEntry,
  fetchJournalEntries,
  findJournalEntryAttachmentIdByFileName,
  uploadJournalEntryAttachment,
  type QboConnection,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

type SettlementDraftBundle = {
  settlementId: string;
  eventGroupId: string;
  draft: ReturnType<typeof buildUsSettlementDraftFromSpApiFinances>;
};

function computeDraftSegmentHash(segment: SettlementDraftBundle['draft']['segments'][number]): string {
  const rows = segment.auditRows.map((r) => ({
    invoiceId: r.invoiceId,
    market: r.market,
    date: r.date,
    orderId: r.orderId,
    sku: r.sku,
    quantity: r.quantity,
    description: r.description,
    net: fromCents(r.netCents),
  }));
  return computeProcessingHash(rows);
}

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
  const maxNow = new Date(Date.now() - 5 * 60 * 1000);

  if (endDate === undefined) {
    return maxNow.toISOString();
  }

  const requested = new Date(`${endDate}T23:59:59.999Z`);
  if (Number.isNaN(requested.getTime())) {
    throw new Error(`Invalid endDate: ${endDate}`);
  }

  if (requested > maxNow) {
    return maxNow.toISOString();
  }

  return requested.toISOString();
}

function computeGroupStartedAfterIso(startDate: string): string {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
  return new Date(start.getTime() - sixtyDaysMs).toISOString();
}

function isClosedFinancialEventGroup(group: any): boolean {
  if (!group || typeof group !== 'object') return false;
  if (group.ProcessingStatus !== 'Closed') return false;
  const start = group.FinancialEventGroupStart;
  const end = group.FinancialEventGroupEnd;
  if (typeof start !== 'string' || start.trim() === '') return false;
  if (typeof end !== 'string' || end.trim() === '') return false;
  return true;
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

  const normalizedTarget = normalizeSettlementDocNumber(docNumber);
  const match = existing.journalEntries.find((je) => {
    const candidateDocNumber = je.DocNumber;
    if (typeof candidateDocNumber !== 'string') return false;
    if (!isSettlementDocNumber(candidateDocNumber)) return false;
    return normalizeSettlementDocNumber(candidateDocNumber) === normalizedTarget;
  });

  if (!match) {
    return { journalEntryId: null, updatedConnection: activeConnection === connection ? undefined : activeConnection };
  }

  return { journalEntryId: match.Id, updatedConnection: activeConnection === connection ? undefined : activeConnection };
}

async function ensureJournalEntryHasSettlementEvidenceAttachments(
  connection: QboConnection,
  input: {
    journalEntryId: string;
    docNumber: string;
    startIsoDay: string;
    endIsoDay: string;
    auditRows: SettlementDraftBundle['draft']['segments'][number]['auditRows'];
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
          countryCode: 'US',
          accountIdByMemo: input.accountIdByMemo,
          taxCodeIdByMemo: input.taxCodeIdByMemo,
          rows: input.auditRows,
        }),
    },
    {
      fileName: buildSettlementMtdDailySummaryFilename(input.docNumber),
      buildBytes: () =>
        buildSettlementMtdDailySummaryCsvBytes({
          marketplaceName: 'Amazon.com',
          currencyCode: 'USD',
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

    if (existingLookup.attachableId !== null) {
      continue;
    }

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

type MemoMappingEntry = { accountId: string; taxCodeId: string | null };

function requireMemoMapping(value: unknown): Record<string, MemoMappingEntry> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('US settlement memo mapping must be an object');
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

    const taxRaw = entry.taxCodeId;
    let taxCodeId: string | null = null;
    if (taxRaw === null || taxRaw === undefined) {
      taxCodeId = null;
    } else if (typeof taxRaw === 'string') {
      const trimmed = taxRaw.trim();
      taxCodeId = trimmed === '' ? null : trimmed;
    } else {
      throw new Error(`Invalid tax code id for memo mapping: ${memo}`);
    }

    result[memo] = { accountId, taxCodeId };
  }

  return result;
}

async function loadUsSettlementPostingMapping(input: {
  requiredMemos: Set<string>;
  needBankAccount: boolean;
  needPaymentAccount: boolean;
}): Promise<{
  accountIdByMemo: Map<string, string>;
  taxCodeIdByMemo: Map<string, string | null>;
  bankAccountId: string;
  paymentAccountId: string;
}> {
  const config = await db.settlementPostingConfig.findUnique({ where: { marketplace: 'amazon.com' } });
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

  if (settlementIds.length > 0) {
    for (const [settlementId, eventGroupId] of settlementToGroupId.entries()) {
      const eventGroup = groupById.get(eventGroupId);
      if (!eventGroup) {
        throw new Error(`Event group not found for settlement ${settlementId}: ${eventGroupId}`);
      }
      if (!isClosedFinancialEventGroup(eventGroup)) {
        throw new Error(`Settlement is not closed yet: ${settlementId} (${String(eventGroup.ProcessingStatus ?? 'unknown')})`);
      }
    }
  } else {
    const closedSettlementToGroupId = new Map<string, string>();
    for (const [settlementId, eventGroupId] of settlementToGroupId.entries()) {
      const eventGroup = groupById.get(eventGroupId);
      if (!eventGroup) continue;
      if (!isClosedFinancialEventGroup(eventGroup)) continue;
      closedSettlementToGroupId.set(settlementId, eventGroupId);
    }
    settlementToGroupId = closedSettlementToGroupId;
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

  const allInvoiceIds = Array.from(
    new Set(
      bundles.flatMap((b) => b.draft.segments.map((s) => s.docNumber)),
    ),
  ).sort();

  const existingProcessings = allInvoiceIds.length === 0
    ? []
    : await db.settlementProcessing.findMany({
        where: {
          marketplace: 'amazon.com',
          invoiceId: { in: allInvoiceIds },
        },
        select: {
          id: true,
          invoiceId: true,
          processingHash: true,
        },
      });

  const processingByInvoiceId = new Map(existingProcessings.map((p) => [p.invoiceId, p]));

  const mapping = await loadUsSettlementPostingMapping({ requiredMemos, needBankAccount, needPaymentAccount });

  const segments: UsSpApiSettlementSyncSegmentResult[] = [];

  for (const bundle of bundles) {
    const uploadFilename = `spapi-finances-settlement-${bundle.settlementId}.json`;

    const segmentMeta = bundle.draft.segments.map((segment) => {
      const hash = computeDraftSegmentHash(segment);
      const existing = processingByInvoiceId.get(segment.docNumber);
      if (!existing) {
        return { segment, hash, alreadyProcessed: false as const };
      }
      if (existing.processingHash !== hash) {
        throw new Error(
          `INVOICE_CONFLICT: ${segment.docNumber} already processed with different data (hash mismatch). Roll back invoice first. settlementProcessingId=${existing.id}`,
        );
      }
      return { segment, hash, alreadyProcessed: true as const };
    });

    const segmentByDocNumber = new Map(segmentMeta.map((m) => [m.segment.docNumber, m]));

    const invoiceIdsToRefresh = segmentMeta.filter((m) => !m.alreadyProcessed).map((m) => m.segment.docNumber);
    const uploadRows = segmentMeta.filter((m) => !m.alreadyProcessed).flatMap((m) => m.segment.auditRows);

    const upload =
      uploadRows.length === 0
        ? null
        : await (async () => {
            await db.auditDataRow.deleteMany({
              where: {
                invoiceId: { in: invoiceIdsToRefresh },
                OR: [
                  { market: { equals: 'us', mode: 'insensitive' } },
                  { market: { contains: 'amazon.com', mode: 'insensitive' } },
                ],
              },
            });

            return db.auditDataUpload.create({
              data: {
                filename: uploadFilename,
                rowCount: uploadRows.length,
                invoiceCount: invoiceIdsToRefresh.length,
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
          })();

    const jeDrafts = buildQboJournalEntriesFromUsSettlementDraft({
      draft: bundle.draft,
      privateNote: `Plutus (SP-API Finances) | Settlement: ${bundle.settlementId} | Group: ${bundle.eventGroupId}${upload ? ` | Upload: ${upload.id}` : ''}`,
      bankAccountId: mapping.bankAccountId,
      paymentAccountId: mapping.paymentAccountId,
      accountIdByMemo: mapping.accountIdByMemo,
    });

    for (const jeDraft of jeDrafts) {
      try {
        const docNumber = jeDraft.docNumber;
        const meta = segmentByDocNumber.get(docNumber);
        if (!meta) {
          throw new Error(`Missing segment metadata for ${docNumber}`);
        }

        if (jeDraft.lines.length === 0) {
          segments.push({
            settlementId: bundle.settlementId,
            eventGroupId: bundle.eventGroupId,
            docNumber: jeDraft.docNumber,
            txnDate: jeDraft.txnDate,
            qboJournalEntryId: null,
            qboAction: 'skipped',
            processed: false,
            reason: 'No non-zero lines (empty settlement segment)',
          });
          continue;
        }

        const existingLookup = await findExistingJournalEntryIdByDocNumber(activeConnection, jeDraft.docNumber);
        if (existingLookup.updatedConnection) {
          activeConnection = existingLookup.updatedConnection;
        }

        let qboJournalEntryId: string | null = existingLookup.journalEntryId;
        let qboAction: 'existing' | 'posted' | 'skipped' = 'existing';

        if (meta.alreadyProcessed) {
          if (qboJournalEntryId === null) {
            throw new Error(`Settlement JE missing for already-processed invoice: ${docNumber}`);
          }

          if (postToQbo) {
            const attachmentResult = await ensureJournalEntryHasSettlementEvidenceAttachments(activeConnection, {
              journalEntryId: qboJournalEntryId,
              docNumber: jeDraft.docNumber,
              startIsoDay: meta.segment.startIsoDay,
              endIsoDay: meta.segment.endIsoDay,
              auditRows: meta.segment.auditRows,
              accountIdByMemo: mapping.accountIdByMemo,
              taxCodeIdByMemo: mapping.taxCodeIdByMemo,
            });
            if (attachmentResult.updatedConnection) {
              activeConnection = attachmentResult.updatedConnection;
            }
          }

          segments.push({
            settlementId: bundle.settlementId,
            eventGroupId: bundle.eventGroupId,
            docNumber,
            txnDate: jeDraft.txnDate,
            qboJournalEntryId,
            qboAction,
            processed: true,
            reason: 'Already processed (hash match)',
          });
          continue;
        }

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
            docNumber: buildPlutusSettlementDocNumber(jeDraft.docNumber),
            privateNote: jeDraft.privateNote,
            lines: jeDraft.lines.map((l) => ({
              amount: l.amount,
              postingType: l.postingType,
              accountId: l.accountId,
              description: l.description,
              taxCodeId: (() => {
                const description = l.description ? l.description.trim() : '';
                if (description === '') return undefined;
                if (!mapping.taxCodeIdByMemo.has(description)) return undefined;
                const taxCode = mapping.taxCodeIdByMemo.get(description);
                return typeof taxCode === 'string' ? taxCode : undefined;
              })(),
            })),
          });
          if (res.updatedConnection) {
            activeConnection = res.updatedConnection;
          }
          qboJournalEntryId = res.journalEntry.Id;
          qboAction = 'posted';
        }

        if (postToQbo) {
          const attachmentResult = await ensureJournalEntryHasSettlementEvidenceAttachments(activeConnection, {
            journalEntryId: qboJournalEntryId,
            docNumber: jeDraft.docNumber,
            startIsoDay: meta.segment.startIsoDay,
            endIsoDay: meta.segment.endIsoDay,
            auditRows: meta.segment.auditRows,
            accountIdByMemo: mapping.accountIdByMemo,
            taxCodeIdByMemo: mapping.taxCodeIdByMemo,
          });
          if (attachmentResult.updatedConnection) {
            activeConnection = attachmentResult.updatedConnection;
          }
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

        const segmentDraft = meta.segment;

        const auditRows = segmentDraft.auditRows.map((r) => ({
          invoiceId: r.invoiceId,
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
