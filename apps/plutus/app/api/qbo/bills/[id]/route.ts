import { NextRequest, NextResponse } from 'next/server';
import { fetchBillById, updateBillLineAccounts, QboAuthError } from '@/lib/qbo/api';
import { createLogger } from '@targon/logger';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

const logger = createLogger({ name: 'qbo-bill-detail' });

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const connection = await getQboConnection();

    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const { bill, updatedConnection } = await fetchBillById(connection, id);

    if (updatedConnection) {
      await saveServerQboConnection(updatedConnection);
    }

    return NextResponse.json({
      id: bill.Id,
      syncToken: bill.SyncToken,
      date: bill.TxnDate,
      amount: bill.TotalAmt,
      docNumber: bill.DocNumber ?? '',
      memo: bill.PrivateNote ?? '',
      vendor: bill.VendorRef ? bill.VendorRef.name : 'Unknown',
      vendorId: bill.VendorRef ? bill.VendorRef.value : undefined,
      lineItems: (bill.Line ?? []).map((line) => ({
        id: line.Id,
        amount: line.Amount,
        description: line.Description,
        account: line.AccountBasedExpenseLineDetail
          ? line.AccountBasedExpenseLineDetail.AccountRef.name
          : undefined,
        accountId: line.AccountBasedExpenseLineDetail
          ? line.AccountBasedExpenseLineDetail.AccountRef.value
          : undefined,
      })),
    });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to fetch bill', error);
    return NextResponse.json(
      { error: 'Failed to fetch bill', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const connection = await getQboConnection();

    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const body = await req.json();
    const lineUpdates = body.lines;

    if (!Array.isArray(lineUpdates) || lineUpdates.length === 0) {
      return NextResponse.json({ error: 'Missing lines array' }, { status: 400 });
    }

    for (const update of lineUpdates) {
      if (typeof update.lineId !== 'string' || typeof update.accountId !== 'string' || typeof update.accountName !== 'string') {
        return NextResponse.json({ error: 'Each line must have lineId, accountId, and accountName' }, { status: 400 });
      }
    }

    const { bill: currentBill, updatedConnection: fetchConn } = await fetchBillById(connection, id);
    const activeConnection = fetchConn ?? connection;

    const { bill, updatedConnection } = await updateBillLineAccounts(
      activeConnection,
      id,
      currentBill.SyncToken,
      lineUpdates,
    );

    const finalConnection = updatedConnection ?? fetchConn;
    if (finalConnection) {
      await saveServerQboConnection(finalConnection);
    }

    return NextResponse.json({
      id: bill.Id,
      syncToken: bill.SyncToken,
      date: bill.TxnDate,
      amount: bill.TotalAmt,
      docNumber: bill.DocNumber ?? '',
      vendor: bill.VendorRef ? bill.VendorRef.name : 'Unknown',
      lineItems: (bill.Line ?? []).map((line) => ({
        id: line.Id,
        amount: line.Amount,
        description: line.Description,
        account: line.AccountBasedExpenseLineDetail
          ? line.AccountBasedExpenseLineDetail.AccountRef.name
          : undefined,
        accountId: line.AccountBasedExpenseLineDetail
          ? line.AccountBasedExpenseLineDetail.AccountRef.value
          : undefined,
      })),
    });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to update bill', error);
    return NextResponse.json(
      { error: 'Failed to update bill', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
