import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';
import {
  fetchAccounts,
  fetchBills,
  fetchJournalEntries,
  fetchPurchases,
  QboAuthError,
  type QboAccount,
  type QboBill,
  type QboConnection,
  type QboJournalEntry,
  type QboPurchase,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

const logger = createLogger({ name: 'plutus-transactions' });

class RequestValidationError extends Error {}

type TransactionTypeParam = 'journalEntry' | 'bill' | 'purchase';

type TransactionLine = {
  id: string;
  amount: number;
  postingType?: 'Debit' | 'Credit';
  description: string | null;
  accountId: string | null;
  accountName: string | null;
  accountFullyQualifiedName: string | null;
  accountType: string | null;
};

type TransactionRow = {
  id: string;
  type: 'JournalEntry' | 'Bill' | 'Purchase';
  txnDate: string;
  docNumber: string;
  memo: string;
  entityName: string;
  totalAmount: number;
  lines: TransactionLine[];
  createdAt?: string;
  updatedAt?: string;
};

function requireTransactionType(raw: string | null): TransactionTypeParam {
  if (raw === 'journalEntry' || raw === 'bill' || raw === 'purchase') return raw;
  throw new RequestValidationError('Invalid transaction type');
}

function requirePositiveInt(raw: string | null, fallback: number, label: string): number {
  const value = raw === null ? fallback : Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new RequestValidationError(`Invalid ${label}`);
  }
  return value;
}

function buildAccountLookup(accounts: QboAccount[]): Map<string, QboAccount> {
  const map = new Map<string, QboAccount>();
  for (const account of accounts) {
    map.set(account.Id, account);
  }
  return map;
}

function mapBill(bill: QboBill, accountsById: Map<string, QboAccount>): TransactionRow {
  const lines: TransactionLine[] = (bill.Line ?? [])
    .filter((line) => line.AccountBasedExpenseLineDetail !== undefined)
    .map((line) => {
      const accountRef = line.AccountBasedExpenseLineDetail?.AccountRef;
      const accountId = accountRef?.value;
      const account = accountId ? accountsById.get(accountId) : undefined;

      return {
        id: line.Id,
        amount: line.Amount,
        description: line.Description ? line.Description : null,
        accountId: accountId ? accountId : null,
        accountName: accountRef?.name ? accountRef.name : account ? account.Name : null,
        accountFullyQualifiedName: account?.FullyQualifiedName ? account.FullyQualifiedName : null,
        accountType: account?.AccountType ? account.AccountType : null,
      };
    });

  return {
    id: bill.Id,
    type: 'Bill',
    txnDate: bill.TxnDate,
    docNumber: bill.DocNumber ? bill.DocNumber : '',
    memo: bill.PrivateNote ? bill.PrivateNote : '',
    entityName: bill.VendorRef?.name ? bill.VendorRef.name : '',
    totalAmount: bill.TotalAmt,
    lines,
    createdAt: bill.MetaData?.CreateTime,
    updatedAt: bill.MetaData?.LastUpdatedTime,
  };
}

function mapPurchase(purchase: QboPurchase, accountsById: Map<string, QboAccount>): TransactionRow {
  const lines: TransactionLine[] = (purchase.Line ?? [])
    .filter((line) => line.AccountBasedExpenseLineDetail !== undefined)
    .map((line) => {
      const accountRef = line.AccountBasedExpenseLineDetail?.AccountRef;
      const accountId = accountRef?.value;
      const account = accountId ? accountsById.get(accountId) : undefined;

      return {
        id: line.Id,
        amount: line.Amount,
        description: line.Description ? line.Description : null,
        accountId: accountId ? accountId : null,
        accountName: accountRef?.name ? accountRef.name : account ? account.Name : null,
        accountFullyQualifiedName: account?.FullyQualifiedName ? account.FullyQualifiedName : null,
        accountType: account?.AccountType ? account.AccountType : null,
      };
    });

  return {
    id: purchase.Id,
    type: 'Purchase',
    txnDate: purchase.TxnDate,
    docNumber: purchase.DocNumber ? purchase.DocNumber : '',
    memo: purchase.PrivateNote ? purchase.PrivateNote : '',
    entityName: purchase.EntityRef?.name ? purchase.EntityRef.name : '',
    totalAmount: purchase.TotalAmt,
    lines,
    createdAt: purchase.MetaData?.CreateTime,
    updatedAt: purchase.MetaData?.LastUpdatedTime,
  };
}

function mapJournalEntry(journalEntry: QboJournalEntry, accountsById: Map<string, QboAccount>): TransactionRow {
  const lines: TransactionLine[] = journalEntry.Line.map((line, idx) => {
    const amount = line.Amount === undefined ? 0 : line.Amount;
    const accountId = line.JournalEntryLineDetail.AccountRef.value;
    const account = accountsById.get(accountId);

    const lineId = line.Id ? line.Id : `${journalEntry.Id}-${idx}`;

    return {
      id: lineId,
      amount,
      postingType: line.JournalEntryLineDetail.PostingType,
      description: line.Description ? line.Description : null,
      accountId,
      accountName: line.JournalEntryLineDetail.AccountRef.name ? line.JournalEntryLineDetail.AccountRef.name : account ? account.Name : null,
      accountFullyQualifiedName: account?.FullyQualifiedName ? account.FullyQualifiedName : null,
      accountType: account?.AccountType ? account.AccountType : null,
    };
  });

  let debitTotal = 0;
  for (const line of lines) {
    if (line.postingType === 'Debit') {
      debitTotal += line.amount;
    }
  }

  return {
    id: journalEntry.Id,
    type: 'JournalEntry',
    txnDate: journalEntry.TxnDate,
    docNumber: journalEntry.DocNumber ? journalEntry.DocNumber : '',
    memo: journalEntry.PrivateNote ? journalEntry.PrivateNote : '',
    entityName: '',
    totalAmount: debitTotal,
    lines,
    createdAt: journalEntry.MetaData?.CreateTime,
    updatedAt: journalEntry.MetaData?.LastUpdatedTime,
  };
}

export async function GET(req: NextRequest) {
  try {
    const connection = await getQboConnection();

    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const type = requireTransactionType(searchParams.get('type'));

    const rawStartDate = searchParams.get('startDate');
    const rawEndDate = searchParams.get('endDate');
    const rawSearch = searchParams.get('search');
    const startDate = rawStartDate === null ? undefined : rawStartDate;
    const endDate = rawEndDate === null ? undefined : rawEndDate;
    const search = rawSearch === null ? undefined : rawSearch.trim();

    const rawPage = searchParams.get('page');
    const rawPageSize = searchParams.get('pageSize');
    const page = requirePositiveInt(rawPage, 1, 'page');
    const pageSize = requirePositiveInt(rawPageSize, 25, 'pageSize');
    if (pageSize > 500) {
      throw new RequestValidationError('Invalid pageSize (max 500)');
    }
    const startPosition = (page - 1) * pageSize + 1;

    let activeConnection = connection;

    const accountsResult = await fetchAccounts(activeConnection, { includeInactive: true });
    if (accountsResult.updatedConnection) {
      activeConnection = accountsResult.updatedConnection;
    }
    const accountsById = buildAccountLookup(accountsResult.accounts);

    let transactions: TransactionRow[];
    let totalCount: number;
    let updatedConnection: QboConnection | undefined;

    if (type === 'journalEntry') {
      const result = await fetchJournalEntries(activeConnection, {
        startDate,
        endDate,
        docNumberContains: search,
        maxResults: pageSize,
        startPosition,
      });
      updatedConnection = result.updatedConnection;
      totalCount = result.totalCount;
      transactions = result.journalEntries.map((je) => mapJournalEntry(je, accountsById));
    } else if (type === 'bill') {
      const result = await fetchBills(activeConnection, {
        startDate,
        endDate,
        docNumberContains: search,
        maxResults: pageSize,
        startPosition,
      });
      updatedConnection = result.updatedConnection;
      totalCount = result.totalCount;
      transactions = result.bills.map((bill) => mapBill(bill, accountsById));
    } else {
      const result = await fetchPurchases(activeConnection, {
        startDate,
        endDate,
        docNumberContains: search,
        maxResults: pageSize,
        startPosition,
      });
      updatedConnection = result.updatedConnection;
      totalCount = result.totalCount;
      transactions = result.purchases.map((purchase) => mapPurchase(purchase, accountsById));
    }

    const finalConnection = updatedConnection ? updatedConnection : activeConnection;
    if (finalConnection !== connection) {
      await saveServerQboConnection(finalConnection);
    }

    return NextResponse.json({
      transactions,
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

    if (error instanceof RequestValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logger.error('Failed to fetch transactions', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch transactions',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
