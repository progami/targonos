import { NextRequest, NextResponse } from 'next/server';
import { fetchBills, QboAuthError } from '@/lib/qbo/api';
import { createLogger } from '@targon/logger';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

const logger = createLogger({ name: 'qbo-bills' });

export async function GET(req: NextRequest) {
  try {
    const connection = await getQboConnection();

    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

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
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

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
