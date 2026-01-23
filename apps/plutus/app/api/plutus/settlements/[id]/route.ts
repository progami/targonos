import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createLogger } from '@targon/logger';
import type { QboAccount, QboConnection } from '@/lib/qbo/api';
import { fetchAccounts, fetchJournalEntryById } from '@/lib/qbo/api';
import { ensureServerQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { computeSettlementTotalFromJournalEntry, parseLmbSettlementDocNumber } from '@/lib/lmb/settlements';
import { db } from '@/lib/db';

const logger = createLogger({ name: 'plutus-settlement-detail' });

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const cookieStore = await cookies();
    const connectionCookie = cookieStore.get('qbo_connection')?.value;
    if (!connectionCookie) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const connection: QboConnection = JSON.parse(connectionCookie);
    await ensureServerQboConnection(connection);

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
      cookieStore.set('qbo_connection', JSON.stringify(activeConnection), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 100,
        path: '/',
      });
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

    const meta = parseLmbSettlementDocNumber(je.DocNumber);
    const settlementTotal = computeSettlementTotalFromJournalEntry(je, accountsById);

    const processing = await db.settlementProcessing.findUnique({
      where: { qboSettlementJournalEntryId: settlementId },
      include: { orderSales: true, orderReturns: true },
    });

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
        lmbStatus: 'Posted',
        plutusStatus: processing ? 'Processed' : 'Pending',
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
    });
  } catch (error) {
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
    const cookieStore = await cookies();
    const connectionCookie = cookieStore.get('qbo_connection')?.value;
    if (!connectionCookie) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const body = await req.json();
    if (!body || body.action !== 'rollback') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const { id: settlementId } = await context.params;

    const existing = await db.settlementProcessing.findUnique({
      where: { qboSettlementJournalEntryId: settlementId },
      select: { qboSettlementJournalEntryId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Settlement not processed' }, { status: 404 });
    }

    await db.settlementProcessing.delete({
      where: { qboSettlementJournalEntryId: settlementId },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
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
