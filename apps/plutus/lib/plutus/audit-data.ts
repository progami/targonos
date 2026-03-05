import { db } from '@/lib/db';
import { fromCents } from '@/lib/inventory/money';

import type { MarketplaceId } from './audit-invoice-matching';
import type { SettlementAuditRow } from './settlement-audit';

export function buildAuditMarketWhere(marketplace: MarketplaceId) {
  if (marketplace === 'amazon.com') {
    return {
      OR: [
        { market: { equals: 'us', mode: 'insensitive' as const } },
        { market: { contains: 'amazon.com', mode: 'insensitive' as const } },
      ],
    };
  }
  if (marketplace === 'amazon.co.uk') {
    return {
      OR: [
        { market: { equals: 'uk', mode: 'insensitive' as const } },
        { market: { contains: 'amazon.co.uk', mode: 'insensitive' as const } },
      ],
    };
  }

  const exhaustive: never = marketplace;
  throw new Error(`Unsupported marketplace: ${exhaustive}`);
}

async function chooseLatestAuditUploadForInvoice(input: {
  invoiceId: string;
  marketplace: MarketplaceId;
}): Promise<{ uploadId: string; sourceFilename: string }> {
  const latestRow = await db.auditDataRow.findFirst({
    where: {
      invoiceId: input.invoiceId,
      ...buildAuditMarketWhere(input.marketplace),
    },
    orderBy: { upload: { uploadedAt: 'desc' } },
    select: { uploadId: true, upload: { select: { filename: true } } },
  });

  if (!latestRow) {
    throw new Error(`No stored audit data found for invoice ${input.invoiceId} (${input.marketplace})`);
  }

  return { uploadId: latestRow.uploadId, sourceFilename: latestRow.upload.filename };
}

export async function chooseAuditUploadForInvoice(input: {
  settlementJournalEntryId?: string;
  invoiceId: string;
  marketplace: MarketplaceId;
}): Promise<{ uploadId: string; sourceFilename: string }> {
  const settlementJournalEntryId = input.settlementJournalEntryId ? input.settlementJournalEntryId.trim() : '';
  if (settlementJournalEntryId !== '') {
    const processing = await db.settlementProcessing.findUnique({
      where: { qboSettlementJournalEntryId: settlementJournalEntryId },
      select: { sourceFilename: true, uploadedAt: true },
    });

    if (processing) {
      const uploads = await db.auditDataUpload.findMany({
        where: { filename: processing.sourceFilename },
        orderBy: { uploadedAt: 'desc' },
        select: { id: true, filename: true, uploadedAt: true },
      });

      const chosen = uploads.find((upload) => upload.uploadedAt <= processing.uploadedAt);
      if (!chosen) {
        throw new Error(
          `No audit upload found for processed settlement ${settlementJournalEntryId} (filename=${processing.sourceFilename})`,
        );
      }

      return { uploadId: chosen.id, sourceFilename: chosen.filename };
    }
  }

  return chooseLatestAuditUploadForInvoice({
    invoiceId: input.invoiceId,
    marketplace: input.marketplace,
  });
}

export async function loadAuditRowsFromDb(input: {
  settlementJournalEntryId?: string;
  invoiceId: string;
  marketplace: MarketplaceId;
}): Promise<{ rows: SettlementAuditRow[]; sourceFilename: string }> {
  const chosen = await chooseAuditUploadForInvoice(input);

  const dbRows = await db.auditDataRow.findMany({
    where: {
      uploadId: chosen.uploadId,
      invoiceId: input.invoiceId,
      ...buildAuditMarketWhere(input.marketplace),
    },
    orderBy: [{ date: 'asc' }, { orderId: 'asc' }, { sku: 'asc' }, { description: 'asc' }],
  });

  if (dbRows.length === 0) {
    throw new Error(
      `No stored audit data found for invoice ${input.invoiceId} (${input.marketplace}) in upload ${chosen.uploadId}`,
    );
  }

  const rows: SettlementAuditRow[] = dbRows.map((row) => ({
    invoiceId: row.invoiceId,
    market: row.market,
    date: row.date,
    orderId: row.orderId,
    sku: row.sku,
    quantity: row.quantity,
    description: row.description,
    net: fromCents(row.net),
  }));

  return { rows, sourceFilename: chosen.sourceFilename };
}
