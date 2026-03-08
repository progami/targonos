import { NextResponse, type NextRequest } from 'next/server';
import { createLogger } from '@targon/logger';

import { QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { loadAuditRowsFromDb } from '@/lib/plutus/audit-data';
import {
  formatAuditInvoiceResolutionMessage,
  resolveAuditInvoicesForSettlementChildren,
} from '@/lib/plutus/audit-invoice-resolution';
import { fetchSettlementParentDetail } from '@/lib/plutus/settlement-parents-server';
import { computeSettlementPreview } from '@/lib/plutus/settlement-processing';
import { isBlockingProcessingBlock, type SettlementProcessingPreview } from '@/lib/plutus/settlement-types';

const logger = createLogger({ name: 'plutus-parent-settlement-preview' });

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
          error: 'Cannot preview parent settlement',
          details: unresolved.join(' '),
        },
        { status: 400 },
      );
    }

    let activeConnection = detail.updatedConnection;
    const children: Array<{
      qboJournalEntryId: string;
      docNumber: string;
      invoiceId: string;
      sourceFilename: string;
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

      children.push({
        qboJournalEntryId: child.qboJournalEntryId,
        docNumber: child.docNumber,
        invoiceId,
        sourceFilename: audit.sourceFilename,
        preview: computed.preview,
      });
    }

    if (activeConnection !== connection) {
      await saveServerQboConnection(activeConnection);
    }

    const blocking = children.some((child) =>
      child.preview.blocks.some((block) => isBlockingProcessingBlock(block)),
    );

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
        children,
      },
      { status: blocking ? 400 : 200 },
    );
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to compute parent settlement preview', { error });
    return NextResponse.json(
      {
        error: 'Failed to compute parent settlement preview',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
