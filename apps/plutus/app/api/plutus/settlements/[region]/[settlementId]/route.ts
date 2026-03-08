import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { getCurrentUser } from '@/lib/current-user';
import { logAudit } from '@/lib/plutus/audit-log';
import {
  formatAuditInvoiceResolutionMessage,
  resolveAuditInvoicesForSettlementChildren,
} from '@/lib/plutus/audit-invoice-resolution';
import { fetchSettlementParentDetail } from '@/lib/plutus/settlement-parents-server';
import { rollbackProcessedSettlementByJournalEntryId } from '@/lib/plutus/settlement-rollback';

const logger = createLogger({ name: 'plutus-parent-settlement-detail' });

type RouteContext = { params: Promise<{ region: string; settlementId: string }> };

function requireRegion(value: string): 'US' | 'UK' {
  const trimmed = value.trim().toUpperCase();
  if (trimmed === 'US' || trimmed === 'UK') return trimmed;
  throw new Error(`Unsupported settlement region: ${value}`);
}

function buildHistory(parent: Awaited<ReturnType<typeof fetchSettlementParentDetail>>['parent']) {
  const events: Array<{
    id: string;
    timestamp: string;
    title: string;
    description: string;
    childDocNumber: string;
    kind: 'posted' | 'processed' | 'rolled_back';
  }> = [];

  for (const child of parent.children) {
    events.push({
      id: `posted:${child.qboJournalEntryId}`,
      timestamp: `${child.postedDate}T00:00:00.000Z`,
      title: 'Posting created',
      description: `Month-end posting ${child.docNumber} was posted to QBO.`,
      childDocNumber: child.docNumber,
      kind: 'posted',
    });

    if (child.processing) {
      events.push({
        id: `processed:${child.processing.id}`,
        timestamp: child.processing.uploadedAt,
        title: 'Processed in Plutus',
        description: `Matched to invoice ${child.processing.invoiceId}.`,
        childDocNumber: child.docNumber,
        kind: 'processed',
      });
    }

    if (child.rollback) {
      events.push({
        id: `rolled-back:${child.rollback.id}`,
        timestamp: child.rollback.rolledBackAt,
        title: 'Rolled back in Plutus',
        description: `Previously processed with invoice ${child.rollback.invoiceId}.`,
        childDocNumber: child.docNumber,
        kind: 'rolled_back',
      });
    }
  }

  return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function GET(_req: NextRequest, context: RouteContext) {
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

    if (detail.updatedConnection !== connection) {
      await saveServerQboConnection(detail.updatedConnection);
    }

    const invoiceResolutions = await resolveAuditInvoicesForSettlementChildren(detail.parent.children);

    return NextResponse.json({
      settlement: {
        parentId: detail.parent.parentId,
        sourceSettlementId: detail.parent.sourceSettlementId,
        marketplace: detail.parent.marketplace,
        periodStart: detail.parent.periodStart,
        periodEnd: detail.parent.periodEnd,
        postedDate: detail.parent.postedDate,
        settlementTotal: detail.parent.settlementTotal,
        qboStatus: 'Posted',
        plutusStatus: detail.parent.plutusStatus,
        splitCount: detail.parent.splitCount,
        isSplit: detail.parent.isSplit,
        childCount: detail.parent.childCount,
        hasInconsistency: detail.parent.hasInconsistency,
      },
      children: detail.parent.children.map((child) => {
        const invoiceResolution = invoiceResolutions.get(child.qboJournalEntryId);
        if (!invoiceResolution) {
          throw new Error(`Missing invoice resolution for ${child.docNumber}`);
        }
        return {
          ...child,
          invoiceResolution,
          invoiceResolutionMessage: formatAuditInvoiceResolutionMessage(invoiceResolution),
        };
      }),
      history: buildHistory(detail.parent),
    });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to fetch parent settlement detail', { error });
    return NextResponse.json(
      {
        error: 'Failed to fetch parent settlement detail',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const body = await req.json();
    if (!body || body.action !== 'rollback') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const params = await context.params;
    const region = requireRegion(params.region);
    const sourceSettlementId = decodeURIComponent(params.settlementId);

    const detail = await fetchSettlementParentDetail({
      connection,
      region,
      sourceSettlementId,
    });

    if (detail.parent.plutusStatus !== 'Processed') {
      return NextResponse.json({ error: 'Parent settlement is not fully processed' }, { status: 400 });
    }

    let activeConnection = detail.updatedConnection;
    const user = await getCurrentUser();

    for (const child of detail.parent.children) {
      const rolledBack = await rollbackProcessedSettlementByJournalEntryId({
        connection: activeConnection,
        settlementJournalEntryId: child.qboJournalEntryId,
      });
      activeConnection = rolledBack.updatedConnection;

      await logAudit({
        userId: user?.id ?? 'system',
        userName: user?.name ?? user?.email ?? 'system',
        action: 'SETTLEMENT_ROLLED_BACK',
        entityType: 'SettlementProcessing',
        entityId: child.qboJournalEntryId,
        details: {
          marketplace: rolledBack.rollback.marketplace,
          invoiceId: rolledBack.rollback.invoiceId,
          parentSettlementId: sourceSettlementId,
        },
      });
    }

    if (activeConnection !== connection) {
      await saveServerQboConnection(activeConnection);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to rollback parent settlement', { error });
    return NextResponse.json(
      {
        error: 'Failed to rollback parent settlement',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
