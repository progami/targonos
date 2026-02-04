import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { fetchBills, type QboConnection } from '@/lib/qbo/api';
import { createLogger } from '@targon/logger';
import { ensureServerQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

const logger = createLogger({ name: 'qbo-bills' });

function shouldUseSecureCookies(req: NextRequest): boolean {
  let isHttps = req.nextUrl.protocol === 'https:';
  if (!isHttps) {
    const forwardedProto = req.headers.get('x-forwarded-proto');
    if (forwardedProto === 'https') {
      isHttps = true;
    }
  }
  return isHttps;
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const connectionCookie = cookieStore.get('qbo_connection')?.value;

    if (!connectionCookie) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const connection: QboConnection = JSON.parse(connectionCookie);
    await ensureServerQboConnection(connection);

    const searchParams = req.nextUrl.searchParams;
    const rawStartDate = searchParams.get('startDate');
    const rawEndDate = searchParams.get('endDate');
    const startDate = rawStartDate === null ? undefined : rawStartDate;
    const endDate = rawEndDate === null ? undefined : rawEndDate;
    const rawPage = searchParams.get('page');
    const rawPageSize = searchParams.get('pageSize');
    const page = parseInt(rawPage ? rawPage : '1', 10);
    const pageSize = parseInt(rawPageSize ? rawPageSize : '50', 10);
    const startPosition = (page - 1) * pageSize + 1;

    const { bills, totalCount, updatedConnection } = await fetchBills(connection, {
      startDate,
      endDate,
      maxResults: pageSize,
      startPosition,
    });

    if (updatedConnection) {
      cookieStore.set('qbo_connection', JSON.stringify(updatedConnection), {
        httpOnly: true,
        secure: shouldUseSecureCookies(req),
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 100,
        path: '/',
      });
      await saveServerQboConnection(updatedConnection);
    }

    const transformedBills = bills.map((bill) => {
      const primaryAccount = bill.Line?.find(
        (line) => line.AccountBasedExpenseLineDetail,
      )?.AccountBasedExpenseLineDetail?.AccountRef;

      return {
        id: bill.Id,
        syncToken: bill.SyncToken,
        date: bill.TxnDate,
        amount: bill.TotalAmt,
        docNumber: bill.DocNumber ? bill.DocNumber : '',
        memo: bill.PrivateNote ? bill.PrivateNote : '',
        vendor: bill.VendorRef ? bill.VendorRef.name : 'Unknown',
        vendorId: bill.VendorRef ? bill.VendorRef.value : undefined,
        account: primaryAccount ? primaryAccount.name : 'Uncategorized',
        accountId: primaryAccount ? primaryAccount.value : undefined,
        lineItems: bill.Line
          ? bill.Line.map((line) => ({
              id: line.Id,
              amount: line.Amount,
              description: line.Description,
              account: line.AccountBasedExpenseLineDetail
                ? line.AccountBasedExpenseLineDetail.AccountRef.name
                : undefined,
              accountId: line.AccountBasedExpenseLineDetail
                ? line.AccountBasedExpenseLineDetail.AccountRef.value
                : undefined,
            }))
          : [],
        createdAt: bill.MetaData?.CreateTime,
        updatedAt: bill.MetaData?.LastUpdatedTime,
      };
    });

    return NextResponse.json({
      bills: transformedBills,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error) {
    logger.error('Failed to fetch bills', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch bills',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
