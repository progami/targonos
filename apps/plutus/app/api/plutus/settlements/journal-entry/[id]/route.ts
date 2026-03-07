import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';
import type { QboAccount } from '@/lib/qbo/api';
import { fetchAccounts, fetchJournalEntryById, QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { computeSettlementTotalFromJournalEntry, parseSettlementDocNumber } from '@/lib/plutus/settlement-doc-number';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { logAudit } from '@/lib/plutus/audit-log';
import { resolveParentRouteForSettlementJournalEntry } from '@/lib/plutus/settlement-parents-server';
import { rollbackProcessedSettlementByJournalEntryId } from '@/lib/plutus/settlement-rollback';

const logger = createLogger({ name: 'plutus-settlement-detail' });

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const { id: settlementId } = await context.params;

    const jeResult = await fetchJournalEntryById(connection, settlementId);

    const accountsResult = await fetchAccounts(jeResult.updatedConnection ? jeResult.updatedConnection : connection, {
      includeInactive: true,
    });

    const activeConnection = accountsResult.updatedConnection
      ? accountsResult.updatedConnection
      : jeResult.updatedConnection
        ? jeResult.updatedConnection
        : connection;

    if (activeConnection !== connection) {
      await saveServerQboConnection(activeConnection);
    }

    const je = jeResult.journalEntry;
    if (!je.DocNumber) {
      throw new Error(`Missing DocNumber on journal entry ${je.Id}`);
    }

    const accountsById = new Map<string, QboAccount>();
    for (const account of accountsResult.accounts) {
      accountsById.set(account.Id, account);
    }

    const meta = parseSettlementDocNumber(je.DocNumber);
    const settlementTotal = computeSettlementTotalFromJournalEntry(je, accountsById);
    const parentRoute = await resolveParentRouteForSettlementJournalEntry({
      connection: activeConnection,
      settlementJournalEntryId: settlementId,
    });

    const processing = await db.settlementProcessing.findUnique({
      where: { qboSettlementJournalEntryId: settlementId },
      include: { orderSales: true, orderReturns: true },
    });

    const rollback = await db.settlementRollback.findFirst({
      where: { qboSettlementJournalEntryId: settlementId },
      orderBy: { rolledBackAt: 'desc' },
    });

    const plutusStatus = processing ? 'Processed' : rollback ? 'RolledBack' : 'Pending';

    return NextResponse.json({
      settlement: {
        id: je.Id,
        docNumber: je.DocNumber,
        postedDate: je.TxnDate,
        memo: je.PrivateNote ? je.PrivateNote : '',
        marketplace: meta.marketplace,
        periodStart: meta.periodStart,
        periodEnd: meta.periodEnd,
        settlementTotal,
        qboStatus: 'Posted',
        plutusStatus,
        lines: je.Line.map((line) => {
          const accountId = line.JournalEntryLineDetail.AccountRef.value;
          const account = accountsById.get(accountId);

          return {
            id: line.Id,
            description: line.Description ? line.Description : '',
            amount: line.Amount === undefined ? 0 : line.Amount,
            postingType: line.JournalEntryLineDetail.PostingType,
            accountId,
            accountName: account ? account.Name : '',
            accountFullyQualifiedName: account?.FullyQualifiedName,
            accountType: account?.AccountType,
          };
        }),
      },
      parent: {
        region: parentRoute.region,
        sourceSettlementId: parentRoute.sourceSettlementId,
      },
      processing: processing
        ? {
            id: processing.id,
            marketplace: processing.marketplace,
            invoiceId: processing.invoiceId,
            processingHash: processing.processingHash,
            sourceFilename: processing.sourceFilename,
            uploadedAt: processing.uploadedAt,
            qboCogsJournalEntryId: processing.qboCogsJournalEntryId,
            qboPnlReclassJournalEntryId: processing.qboPnlReclassJournalEntryId,
            orderSalesCount: processing.orderSales.length,
            orderReturnsCount: processing.orderReturns.length,
          }
        : null,
      rollback: rollback
        ? {
            id: rollback.id,
            marketplace: rollback.marketplace,
            invoiceId: rollback.invoiceId,
            processingHash: rollback.processingHash,
            sourceFilename: rollback.sourceFilename,
            processedAt: rollback.processedAt,
            rolledBackAt: rollback.rolledBackAt,
            qboCogsJournalEntryId: rollback.qboCogsJournalEntryId,
            qboPnlReclassJournalEntryId: rollback.qboPnlReclassJournalEntryId,
            orderSalesCount: rollback.orderSalesCount,
            orderReturnsCount: rollback.orderReturnsCount,
          }
        : null,
    });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to fetch settlement detail', { error });
    return NextResponse.json(
      {
        error: 'Failed to fetch settlement detail',
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
    let activeConnection = connection;

    const body = await req.json();
    if (!body || body.action !== 'rollback') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const { id: settlementId } = await context.params;
    const rolledBack = await rollbackProcessedSettlementByJournalEntryId({
      connection: activeConnection,
      settlementJournalEntryId: settlementId,
    });
    activeConnection = rolledBack.updatedConnection;

    const user = await getCurrentUser();
    await logAudit({
      userId: user?.id ?? 'system',
      userName: user?.name ?? user?.email ?? 'system',
      action: 'SETTLEMENT_ROLLED_BACK',
      entityType: 'SettlementProcessing',
      entityId: settlementId,
      details: {
        marketplace: rolledBack.rollback.marketplace,
        invoiceId: rolledBack.rollback.invoiceId,
      },
    });

    if (activeConnection !== connection) {
      await saveServerQboConnection(activeConnection);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to rollback settlement processing', { error });
    return NextResponse.json(
      {
        error: 'Failed to rollback settlement processing',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
