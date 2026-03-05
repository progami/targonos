import { NextResponse, type NextRequest } from 'next/server';
import { createLogger } from '@targon/logger';
import { QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { computeSettlementPreview } from '@/lib/plutus/settlement-processing';
import { isBlockingProcessingBlock } from '@/lib/plutus/settlement-types';
import { loadAuditRowsFromDb } from '@/lib/plutus/audit-data';

export const runtime = 'nodejs';

const logger = createLogger({ name: 'plutus-settlement-preview' });

type RouteContext = { params: Promise<{ id: string }> };

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
      settlementJournalEntryId,
      invoiceId,
      marketplace,
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
