import { NextResponse, type NextRequest } from 'next/server';
import { createLogger } from '@targon/logger';

import { QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { getCurrentUser } from '@/lib/current-user';
import { loadAuditRowsFromDb } from '@/lib/plutus/audit-data';
import { logAudit } from '@/lib/plutus/audit-log';
import { fetchSettlementParentDetail } from '@/lib/plutus/settlement-parents-server';
import { computeSettlementPreview, processSettlement } from '@/lib/plutus/settlement-processing';
import { rollbackProcessedSettlementByJournalEntryId } from '@/lib/plutus/settlement-rollback';
import { isBlockingProcessingBlock, type SettlementProcessingPreview } from '@/lib/plutus/settlement-types';

const logger = createLogger({ name: 'plutus-parent-settlement-process' });

type RouteContext = { params: Promise<{ region: string; settlementId: string }> };

type ParentSelection = {
  qboJournalEntryId: string;
  invoiceId: string;
};

function requireRegion(value: string): 'US' | 'UK' {
  const trimmed = value.trim().toUpperCase();
  if (trimmed === 'US' || trimmed === 'UK') return trimmed;
  throw new Error(`Unsupported settlement region: ${value}`);
}

function readSelections(body: unknown): Map<string, string> {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Missing selections payload');
  }

  const selections = (body as { selections?: unknown }).selections;
  if (!Array.isArray(selections)) {
    throw new Error('Missing selections');
  }

  const result = new Map<string, string>();
  for (const selection of selections as ParentSelection[]) {
    const qboJournalEntryId = typeof selection.qboJournalEntryId === 'string' ? selection.qboJournalEntryId.trim() : '';
    const invoiceId = typeof selection.invoiceId === 'string' ? selection.invoiceId.trim() : '';
    if (qboJournalEntryId === '' || invoiceId === '') {
      throw new Error('Every selection must include qboJournalEntryId and invoiceId');
    }
    result.set(qboJournalEntryId, invoiceId);
  }

  return result;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Unsupported content type (expected application/json)' }, { status: 415 });
    }

    const params = await context.params;
    const region = requireRegion(params.region);
    const sourceSettlementId = decodeURIComponent(params.settlementId);
    const selectionMap = readSelections(await req.json());

    const detail = await fetchSettlementParentDetail({
      connection,
      region,
      sourceSettlementId,
    });

    let activeConnection = detail.updatedConnection;
    const previews: Array<{
      qboJournalEntryId: string;
      docNumber: string;
      invoiceId: string;
      sourceFilename: string;
      rows: Awaited<ReturnType<typeof loadAuditRowsFromDb>>['rows'];
      preview: SettlementProcessingPreview;
    }> = [];

    for (const child of detail.parent.children) {
      const invoiceId = selectionMap.get(child.qboJournalEntryId);
      if (!invoiceId) {
        throw new Error(`Missing invoice selection for ${child.docNumber}`);
      }

      const audit = await loadAuditRowsFromDb({
        settlementJournalEntryId: child.qboJournalEntryId,
        invoiceId,
        marketplace: child.marketplace.id,
      });

      const computed = await computeSettlementPreview({
        connection: activeConnection,
        settlementJournalEntryId: child.qboJournalEntryId,
        auditRows: audit.rows,
        sourceFilename: audit.sourceFilename,
        invoiceId,
      });
      if (computed.updatedConnection) {
        activeConnection = computed.updatedConnection;
      }

      previews.push({
        qboJournalEntryId: child.qboJournalEntryId,
        docNumber: child.docNumber,
        invoiceId,
        sourceFilename: audit.sourceFilename,
        rows: audit.rows,
        preview: computed.preview,
      });

      if (computed.preview.blocks.some((block) => isBlockingProcessingBlock(block))) {
        if (activeConnection !== connection) {
          await saveServerQboConnection(activeConnection);
        }
        return NextResponse.json(
          {
            settlement: {
              parentId: detail.parent.parentId,
              sourceSettlementId: detail.parent.sourceSettlementId,
              marketplace: detail.parent.marketplace,
              periodStart: detail.parent.periodStart,
              periodEnd: detail.parent.periodEnd,
              postedDate: detail.parent.postedDate,
              settlementTotal: detail.parent.settlementTotal,
              plutusStatus: detail.parent.plutusStatus,
              splitCount: detail.parent.splitCount,
              isSplit: detail.parent.isSplit,
              hasInconsistency: detail.parent.hasInconsistency,
            },
            children: previews.map((entry) => ({
              qboJournalEntryId: entry.qboJournalEntryId,
              docNumber: entry.docNumber,
              invoiceId: entry.invoiceId,
              sourceFilename: entry.sourceFilename,
              preview: entry.preview,
            })),
          },
          { status: 400 },
        );
      }
    }

    const user = await getCurrentUser();
    const processedChildren: string[] = [];

    try {
      activeConnection = detail.updatedConnection;

      for (const preview of previews) {
        const processed = await processSettlement({
          connection: activeConnection,
          settlementJournalEntryId: preview.qboJournalEntryId,
          auditRows: preview.rows,
          sourceFilename: preview.sourceFilename,
          invoiceId: preview.invoiceId,
        });

        if (processed.updatedConnection) {
          activeConnection = processed.updatedConnection;
        }

        if (!processed.result.ok) {
          throw new Error(`Parent processing blocked for ${preview.docNumber}`);
        }

        processedChildren.push(preview.qboJournalEntryId);

        await logAudit({
          userId: user?.id ?? 'system',
          userName: user?.name ?? user?.email ?? 'system',
          action: 'SETTLEMENT_PROCESSED',
          entityType: 'SettlementProcessing',
          entityId: preview.qboJournalEntryId,
          details: {
            marketplace: processed.result.preview.marketplace,
            invoiceId: processed.result.preview.invoiceId,
            parentSettlementId: sourceSettlementId,
          },
        });
      }
    } catch (error) {
      for (const settlementJournalEntryId of processedChildren.reverse()) {
        try {
          const rolledBack = await rollbackProcessedSettlementByJournalEntryId({
            connection: activeConnection,
            settlementJournalEntryId,
          });
          activeConnection = rolledBack.updatedConnection;
        } catch (rollbackError) {
          logger.error('Failed to compensate parent settlement processing after partial child success', {
            settlementJournalEntryId,
            rollbackError,
          });
        }
      }

      throw error;
    }

    if (activeConnection !== connection) {
      await saveServerQboConnection(activeConnection);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to process parent settlement', { error });
    return NextResponse.json(
      {
        error: 'Failed to process parent settlement',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
