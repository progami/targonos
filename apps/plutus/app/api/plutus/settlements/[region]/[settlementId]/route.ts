import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { db } from '@/lib/db';
import { QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { getCurrentUser } from '@/lib/current-user';
import { logAudit } from '@/lib/plutus/audit-log';
import { HumanApprovalError, requireHumanApprovalHeader } from '@/lib/plutus/human-approval';
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
        description: `Matched to support ${child.processing.invoiceId}.`,
        childDocNumber: child.docNumber,
        kind: 'processed',
      });
    }

    if (child.rollback) {
      events.push({
        id: `rolled-back:${child.rollback.id}`,
        timestamp: child.rollback.rolledBackAt,
        title: 'Rolled back in Plutus',
        description: `Previously processed with support ${child.rollback.invoiceId}.`,
        childDocNumber: child.docNumber,
        kind: 'rolled_back',
      });
    }
  }

  return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

async function fetchCogsConsumptions(input: {
  marketplace: string;
  settlementIds: string[];
}) {
  const distinctSettlementIds = Array.from(new Set(input.settlementIds));
  if (distinctSettlementIds.length === 0) return [];

  const rows = await db.cogsConsumption.findMany({
    where: {
      marketplace: input.marketplace,
      settlementId: { in: distinctSettlementIds },
    },
    include: {
      settlementPosting: {
        select: {
          txnDate: true,
          qboDocNumber: true,
          qboJournalId: true,
        },
      },
    },
    orderBy: [
      { settlementId: 'asc' },
      { poNumber: 'asc' },
      { sku: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  return rows.map((row) => ({
    id: row.id,
    settlementId: row.settlementId,
    marketplace: row.marketplace,
    sku: row.sku,
    poNumber: row.poNumber,
    costLayerId: row.costLayerId,
    qtyConsumed: row.qtyConsumed,
    unitCost: Number(row.unitCost),
    cogsAmountCents: row.cogsAmountCents,
    currency: row.currency,
    qboJournalId: row.settlementPosting?.qboJournalId ?? row.qboJournalId,
    qboDocNumber: row.settlementPosting?.qboDocNumber ?? null,
    txnDate: row.settlementPosting?.txnDate ?? null,
  }));
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

    const invoiceResolutions = await resolveAuditInvoicesForSettlementChildren(
      detail.parent.children,
    );
    const cogsSettlementIds = new Set<string>([detail.parent.sourceSettlementId]);
    for (const child of detail.parent.children) {
      const invoiceResolution = invoiceResolutions.get(child.qboJournalEntryId);
      if (invoiceResolution?.status === 'resolved') {
        cogsSettlementIds.add(invoiceResolution.invoiceId);
      }
      if (child.processing !== null) {
        cogsSettlementIds.add(child.processing.invoiceId);
      }
      if (child.rollback !== null) {
        cogsSettlementIds.add(child.rollback.invoiceId);
      }
    }
    const cogsConsumptions = await fetchCogsConsumptions({
      marketplace: detail.parent.marketplace.id,
      settlementIds: Array.from(cogsSettlementIds),
    });

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
      cogsConsumptions,
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
    requireHumanApprovalHeader(req, 'Parent settlement rollback');
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
      return NextResponse.json(
        { error: 'Parent settlement is not fully processed' },
        { status: 400 },
      );
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
    if (error instanceof HumanApprovalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

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
