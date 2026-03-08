import { NextResponse, type NextRequest } from 'next/server';
import { createLogger } from '@targon/logger';

import { QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { getCurrentUser } from '@/lib/current-user';
import { loadAuditRowsFromDb } from '@/lib/plutus/audit-data';
import {
  formatAuditInvoiceResolutionMessage,
  resolveAuditInvoicesForSettlementChildren,
} from '@/lib/plutus/audit-invoice-resolution';
import { logAudit } from '@/lib/plutus/audit-log';
import { fetchSettlementParentDetail } from '@/lib/plutus/settlement-parents-server';
import { computeSettlementPreview, processSettlement } from '@/lib/plutus/settlement-processing';
import { rollbackProcessedSettlementByJournalEntryId } from '@/lib/plutus/settlement-rollback';
import { isBlockingProcessingBlock, type SettlementProcessingPreview } from '@/lib/plutus/settlement-types';

const logger = createLogger({ name: 'plutus-parent-settlement-process' });

type RouteContext = { params: Promise<{ region: string; settlementId: string }> };

function requireRegion(value: string): 'US' | 'UK' {
  const trimmed = value.trim().toUpperCase();
  if (trimmed === 'US' || trimmed === 'UK') return trimmed;
  throw new Error(`Unsupported settlement region: ${value}`);
}

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const params = await context.params;
    const region = requireRegion(params.region);
    const sourceSettlementId = decodeURIComponent(params.settlementId);

    const detail = await fetchSettlementParentDetail({
      connection,
      region,
      sourceSettlementId,
    });

    const invoiceResolutions = await resolveAuditInvoicesForSettlementChildren(detail.parent.children);
    const unresolved = detail.parent.children.flatMap((child) => {
      const resolution = invoiceResolutions.get(child.qboJournalEntryId);
      if (!resolution) {
        throw new Error(`Missing invoice resolution for ${child.docNumber}`);
      }
      if (resolution.status === 'resolved') return [];
      return [`${child.docNumber}: ${formatAuditInvoiceResolutionMessage(resolution)}`];
    });

    if (unresolved.length > 0) {
      return NextResponse.json(
        {
          error: 'Cannot process parent settlement',
          details: unresolved.join(' '),
        },
        { status: 400 },
      );
    }

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
      const resolution = invoiceResolutions.get(child.qboJournalEntryId);
      if (!resolution) {
        throw new Error(`Missing invoice resolution for ${child.docNumber}`);
      }
      if (resolution.status !== 'resolved') {
        throw new Error(`Unresolved audit invoice for ${child.docNumber}`);
      }
      const invoiceId = resolution.invoiceId;

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
