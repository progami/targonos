import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { fetchPurchases, type QboConnection } from '@/lib/qbo/api';
import { getComplianceStatus } from '@/lib/sop/config';
import { createLogger } from '@targon/logger';
import { ensureServerQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

const logger = createLogger({ name: 'qbo-purchases' });

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const connectionCookie = cookieStore.get('qbo_connection')?.value;

    if (!connectionCookie) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const connection: QboConnection = JSON.parse(connectionCookie);
    await ensureServerQboConnection(connection);

    // Get query params
    const searchParams = req.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
    const startPosition = (page - 1) * pageSize + 1;

    const { purchases, totalCount, updatedConnection } = await fetchPurchases(connection, {
      startDate,
      endDate,
      maxResults: pageSize,
      startPosition,
    });

    // Update cookie if token was refreshed
    if (updatedConnection) {
      cookieStore.set('qbo_connection', JSON.stringify(updatedConnection), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 100,
        path: '/',
      });
      await saveServerQboConnection(updatedConnection);
    }

    // Transform purchases for frontend with compliance status
    const transformedPurchases = purchases.map((p) => {
      // Get primary account from line items
      const primaryAccount = p.Line?.find(l => l.AccountBasedExpenseLineDetail)?.AccountBasedExpenseLineDetail?.AccountRef;

      return {
        id: p.Id,
        syncToken: p.SyncToken,
        date: p.TxnDate,
        amount: p.TotalAmt,
        paymentType: p.PaymentType,
        reference: p.DocNumber || '',
        memo: p.PrivateNote || '',
        vendor: p.EntityRef?.name || 'Unknown',
        vendorId: p.EntityRef?.value,
        account: primaryAccount?.name || 'Uncategorized',
        accountId: primaryAccount?.value,
        complianceStatus: getComplianceStatus(p.DocNumber, p.PrivateNote),
        lineItems: p.Line?.map(l => ({
          id: l.Id,
          amount: l.Amount,
          description: l.Description,
          account: l.AccountBasedExpenseLineDetail?.AccountRef?.name,
          accountId: l.AccountBasedExpenseLineDetail?.AccountRef?.value,
        })) || [],
        createdAt: p.MetaData?.CreateTime,
        updatedAt: p.MetaData?.LastUpdatedTime,
      };
    });

    return NextResponse.json({
      purchases: transformedPurchases,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error) {
    logger.error('Failed to fetch purchases', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchases', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
