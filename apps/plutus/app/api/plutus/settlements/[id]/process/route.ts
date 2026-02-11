import { NextResponse, type NextRequest } from 'next/server';
import { createLogger } from '@targon/logger';
import { QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { processSettlement } from '@/lib/plutus/settlement-processing';
import { fromCents } from '@/lib/inventory/money';
import { db } from '@/lib/db';
import type { LmbAuditRow } from '@/lib/lmb/audit-csv';
import type { MarketplaceId } from '@/lib/plutus/audit-invoice-matching';
import { unzipSync, strFromU8 } from 'fflate';
import { getCurrentUser } from '@/lib/current-user';
import { logAudit } from '@/lib/plutus/audit-log';

export const runtime = 'nodejs';

const logger = createLogger({ name: 'plutus-settlement-process' });

type RouteContext = { params: Promise<{ id: string }> };

function toUint8Array(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}

function buildMarketWhere(marketplace: MarketplaceId) {
  if (marketplace === 'amazon.com') {
    return {
      OR: [
        { market: { equals: 'US', mode: 'insensitive' as const } },
        { market: { contains: 'amazon.com', mode: 'insensitive' as const } },
      ],
    };
  }
  if (marketplace === 'amazon.co.uk') {
    return {
      OR: [
        { market: { equals: 'UK', mode: 'insensitive' as const } },
        { market: { contains: 'amazon.co.uk', mode: 'insensitive' as const } },
      ],
    };
  }

  const exhaustive: never = marketplace;
  throw new Error(`Unsupported marketplace: ${exhaustive}`);
}

async function readAuditCsvText(file: File): Promise<{ csvText: string; sourceFilename: string }> {
  const bytes = toUint8Array(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.zip')) {
    const unzipped = unzipSync(bytes);
    const csvEntries = Object.entries(unzipped).filter(([name]) => name.toLowerCase().endsWith('.csv'));
    if (csvEntries.length !== 1) {
      throw new Error(`ZIP must contain exactly one .csv (found ${csvEntries.length})`);
    }

    const entry = csvEntries[0];
    if (!entry) {
      throw new Error('ZIP is missing CSV entry');
    }

    return { csvText: strFromU8(entry[1]), sourceFilename: file.name };
  }

  if (lowerName.endsWith('.csv')) {
    return { csvText: strFromU8(bytes), sourceFilename: file.name };
  }

  throw new Error('Unsupported file type. Upload a .zip or .csv');
}

async function loadAuditRowsFromDb(input: {
  invoiceId: string;
  marketplace: MarketplaceId;
}): Promise<{ rows: LmbAuditRow[]; sourceFilename: string }> {
  const dbRows = await db.auditDataRow.findMany({
    where: {
      invoiceId: input.invoiceId,
      ...buildMarketWhere(input.marketplace),
    },
    include: { upload: { select: { filename: true } } },
  });

  if (dbRows.length === 0) {
    throw new Error(`No stored audit data found for invoice ${input.invoiceId} (${input.marketplace})`);
  }

  const rows: LmbAuditRow[] = dbRows.map((r) => ({
    invoice: r.invoiceId,
    market: r.market,
    date: r.date,
    orderId: r.orderId,
    sku: r.sku,
    quantity: r.quantity,
    description: r.description,
    net: fromCents(r.net),
  }));

  const sourceFilename = dbRows[0]!.upload.filename;

  return { rows, sourceFilename };
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id: settlementJournalEntryId } = await context.params;

    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const contentType = req.headers.get('content-type') ?? '';

    let processed;

    if (contentType.includes('application/json')) {
      // JSON path: read stored audit data from DB
      const body = await req.json();
      const invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId.trim() : '';
      const marketplace = typeof body.marketplace === 'string' ? body.marketplace.trim() : '';
      if (invoiceId === '') {
        return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 });
      }
      if (marketplace !== 'amazon.com' && marketplace !== 'amazon.co.uk') {
        return NextResponse.json({ error: 'Missing marketplace' }, { status: 400 });
      }

      const { rows, sourceFilename } = await loadAuditRowsFromDb({
        invoiceId,
        marketplace: marketplace as MarketplaceId,
      });

      processed = await processSettlement({
        connection,
        settlementJournalEntryId,
        auditRows: rows,
        sourceFilename,
        invoiceId,
      });
    } else {
      // FormData path: legacy file upload
      const formData = await req.formData();
      const file = formData.get('file');
      const invoiceRaw = formData.get('invoice');

      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Missing file' }, { status: 400 });
      }

      const invoiceId = typeof invoiceRaw === 'string' ? invoiceRaw.trim() : undefined;
      const { csvText, sourceFilename } = await readAuditCsvText(file);

      processed = await processSettlement({
        connection,
        settlementJournalEntryId,
        auditCsvText: csvText,
        sourceFilename,
        invoiceId,
      });
    }

    if (processed.updatedConnection) {
      await saveServerQboConnection(processed.updatedConnection);
    }

    if (!processed.result.ok) {
      return NextResponse.json(processed.result.preview, { status: 400 });
    }

    const user = await getCurrentUser();
    await logAudit({
      userId: user?.id ?? 'system',
      userName: user?.name ?? user?.email ?? 'system',
      action: 'SETTLEMENT_PROCESSED',
      entityType: 'SettlementProcessing',
      entityId: settlementJournalEntryId,
      details: {
        marketplace: processed.result.preview.marketplace,
        invoiceId: processed.result.preview.invoiceId,
      },
    });

    return NextResponse.json(processed.result, { status: 200 });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to process settlement', { error });
    return NextResponse.json(
      {
        error: 'Failed to process settlement',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
