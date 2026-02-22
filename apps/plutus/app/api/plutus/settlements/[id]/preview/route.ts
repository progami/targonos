import { NextResponse, type NextRequest } from 'next/server';
import { createLogger } from '@targon/logger';
import { QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { computeSettlementPreview } from '@/lib/plutus/settlement-processing';
import { isBlockingProcessingBlock } from '@/lib/plutus/settlement-types';
import { fromCents } from '@/lib/inventory/money';
import { db } from '@/lib/db';
import type { SettlementAuditRow } from '@/lib/plutus/settlement-audit';
import type { MarketplaceId } from '@/lib/plutus/audit-invoice-matching';

export const runtime = 'nodejs';

const logger = createLogger({ name: 'plutus-settlement-preview' });

type RouteContext = { params: Promise<{ id: string }> };

function buildMarketWhere(marketplace: MarketplaceId) {
  if (marketplace === 'amazon.com') {
    return {
      market: { equals: 'us', mode: 'insensitive' as const },
    };
  }
  if (marketplace === 'amazon.co.uk') {
    return {
      market: { equals: 'uk', mode: 'insensitive' as const },
    };
  }

  const exhaustive: never = marketplace;
  throw new Error(`Unsupported marketplace: ${exhaustive}`);
}

async function loadAuditRowsFromDb(input: {
  invoiceId: string;
  marketplace: MarketplaceId;
}): Promise<{ rows: SettlementAuditRow[]; sourceFilename: string }> {
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

  const rows: SettlementAuditRow[] = dbRows.map((r) => ({
    invoiceId: r.invoiceId,
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
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Unsupported content type (expected application/json)' }, { status: 415 });
    }

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

    const computed = await computeSettlementPreview({
      connection,
      settlementJournalEntryId,
      auditRows: rows,
      sourceFilename,
      invoiceId,
    });

    if (computed.updatedConnection) {
      await saveServerQboConnection(computed.updatedConnection);
    }

    const status = computed.preview.blocks.some((block) => isBlockingProcessingBlock(block)) ? 400 : 200;
    return NextResponse.json(computed.preview, { status });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to compute settlement preview', { error });
    return NextResponse.json(
      {
        error: 'Failed to compute settlement preview',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
