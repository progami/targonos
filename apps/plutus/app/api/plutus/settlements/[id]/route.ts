import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';
import type { QboAccount } from '@/lib/qbo/api';
import { deleteJournalEntry, fetchAccounts, fetchJournalEntryById, QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { computeSettlementTotalFromJournalEntry, parseSettlementDocNumber } from '@/lib/plutus/settlement-doc-number';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { logAudit } from '@/lib/plutus/audit-log';
import { isQboJournalEntryId } from '@/lib/plutus/journal-entry-id';

const logger = createLogger({ name: 'plutus-settlement-detail' });

type RouteContext = { params: Promise<{ id: string }> };

function isQboNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('Object Not Found') && error.message.includes('"code":"610"');
}

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

    const existing = await db.settlementProcessing.findUnique({
      where: { qboSettlementJournalEntryId: settlementId },
      select: {
        marketplace: true,
        qboSettlementJournalEntryId: true,
        settlementDocNumber: true,
        settlementPostedDate: true,
        invoiceId: true,
        processingHash: true,
        sourceFilename: true,
        uploadedAt: true,
        qboCogsJournalEntryId: true,
        qboPnlReclassJournalEntryId: true,
        _count: { select: { orderSales: true, orderReturns: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Settlement not processed' }, { status: 404 });
    }

    // Delete the COGS + P&L reclass journal entries created by Plutus so rollback is a true undo.
    // We only delete IDs that look like QBO JournalEntry IDs (digits). NOOP ids are left alone.
    if (isQboJournalEntryId(existing.qboCogsJournalEntryId)) {
      try {
        const deleted = await deleteJournalEntry(activeConnection, existing.qboCogsJournalEntryId);
        if (deleted.updatedConnection) activeConnection = deleted.updatedConnection;
      } catch (error) {
        if (!isQboNotFoundError(error)) throw error;
        logger.warn('COGS Journal Entry already missing in QBO; skipping delete during rollback', {
          journalEntryId: existing.qboCogsJournalEntryId,
          settlementId,
        });
      }
    }
    if (isQboJournalEntryId(existing.qboPnlReclassJournalEntryId)) {
      try {
        const deleted = await deleteJournalEntry(activeConnection, existing.qboPnlReclassJournalEntryId);
        if (deleted.updatedConnection) activeConnection = deleted.updatedConnection;
      } catch (error) {
        if (!isQboNotFoundError(error)) throw error;
        logger.warn('P&L Reclass Journal Entry already missing in QBO; skipping delete during rollback', {
          journalEntryId: existing.qboPnlReclassJournalEntryId,
          settlementId,
        });
      }
    }

    await db.$transaction([
      db.settlementRollback.create({
        data: {
          marketplace: existing.marketplace,
          qboSettlementJournalEntryId: existing.qboSettlementJournalEntryId,
          settlementDocNumber: existing.settlementDocNumber,
          settlementPostedDate: existing.settlementPostedDate,
          invoiceId: existing.invoiceId,
          processingHash: existing.processingHash,
          sourceFilename: existing.sourceFilename,
          processedAt: existing.uploadedAt,
          qboCogsJournalEntryId: existing.qboCogsJournalEntryId,
          qboPnlReclassJournalEntryId: existing.qboPnlReclassJournalEntryId,
          orderSalesCount: existing._count.orderSales,
          orderReturnsCount: existing._count.orderReturns,
        },
      }),
      db.settlementProcessing.delete({
        where: { qboSettlementJournalEntryId: settlementId },
      }),
    ]);

    const user = await getCurrentUser();
    await logAudit({
      userId: user?.id ?? 'system',
      userName: user?.name ?? user?.email ?? 'system',
      action: 'SETTLEMENT_ROLLED_BACK',
      entityType: 'SettlementProcessing',
      entityId: settlementId,
      details: {
        marketplace: existing.marketplace,
        invoiceId: existing.invoiceId,
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
