import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';
import {
  createPurchase,
  fetchAccounts,
  fetchVendors,
  QboAuthError,
  type QboAccount,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

const logger = createLogger({ name: 'plutus-purchases-create' });

type CreatePurchaseLineInput = {
  accountId: string;
  amount: number;
  description?: string;
};

function isPaymentAccount(account: QboAccount): boolean {
  return account.AccountType === 'Bank' || account.AccountType === 'Credit Card';
}

function mapPaymentType(account: QboAccount): 'Cash' | 'CreditCard' {
  if (account.AccountType === 'Credit Card') {
    return 'CreditCard';
  }
  return 'Cash';
}

export async function GET() {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    let activeConnection = connection;
    const [vendorsResult, accountsResult] = await Promise.all([
      fetchVendors(activeConnection),
      fetchAccounts(activeConnection, { includeInactive: false }),
    ]);

    if (vendorsResult.updatedConnection) {
      activeConnection = vendorsResult.updatedConnection;
    }
    if (accountsResult.updatedConnection) {
      activeConnection = accountsResult.updatedConnection;
    }
    if (activeConnection !== connection) {
      await saveServerQboConnection(activeConnection);
    }

    const vendors = vendorsResult.vendors
      .map((vendor) => ({
        id: vendor.Id,
        name: vendor.DisplayName,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    const paymentAccounts = accountsResult.accounts
      .filter((account) => account.Active !== false)
      .filter((account) => isPaymentAccount(account))
      .map((account) => ({
        id: account.Id,
        name: account.Name,
        fullyQualifiedName: account.FullyQualifiedName ? account.FullyQualifiedName : account.Name,
        type: account.AccountType,
        subType: account.AccountSubType ? account.AccountSubType : null,
      }))
      .sort((left, right) => left.fullyQualifiedName.localeCompare(right.fullyQualifiedName));

    const lineAccounts = accountsResult.accounts
      .filter((account) => account.Active !== false)
      .filter((account) => !isPaymentAccount(account))
      .map((account) => ({
        id: account.Id,
        name: account.Name,
        fullyQualifiedName: account.FullyQualifiedName ? account.FullyQualifiedName : account.Name,
        type: account.AccountType,
        subType: account.AccountSubType ? account.AccountSubType : null,
      }))
      .sort((left, right) => left.fullyQualifiedName.localeCompare(right.fullyQualifiedName));

    return NextResponse.json({
      vendors,
      paymentAccounts,
      lineAccounts,
    });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to load purchase creation context', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to load purchase creation context', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const body = await req.json();
    const { txnDate, paymentAccountId, vendorId, memo, lines } = body;

    if (typeof txnDate !== 'string' || txnDate.trim() === '') {
      return NextResponse.json({ error: 'txnDate is required' }, { status: 400 });
    }
    if (typeof paymentAccountId !== 'string' || paymentAccountId.trim() === '') {
      return NextResponse.json({ error: 'paymentAccountId is required' }, { status: 400 });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'At least one line is required' }, { status: 400 });
    }

    let activeConnection = connection;
    const accountsResult = await fetchAccounts(activeConnection, { includeInactive: true });
    if (accountsResult.updatedConnection) {
      activeConnection = accountsResult.updatedConnection;
    }

    const accountById = new Map(accountsResult.accounts.map((account) => [account.Id, account]));

    const paymentAccount = accountById.get(paymentAccountId);
    if (!paymentAccount || paymentAccount.Active === false || !isPaymentAccount(paymentAccount)) {
      return NextResponse.json({ error: 'Invalid paymentAccountId' }, { status: 400 });
    }

    const parsedLines: Array<{ amount: number; accountId: string; description: string }> = [];
    for (const rawLine of lines as unknown[]) {
      const line = rawLine as Partial<CreatePurchaseLineInput>;
      if (typeof line.accountId !== 'string' || line.accountId.trim() === '') {
        return NextResponse.json({ error: 'Each line must include accountId' }, { status: 400 });
      }
      if (typeof line.amount !== 'number' || !Number.isFinite(line.amount) || line.amount <= 0) {
        return NextResponse.json({ error: 'Each line must include a positive amount' }, { status: 400 });
      }

      const lineAccount = accountById.get(line.accountId);
      if (!lineAccount || lineAccount.Active === false || isPaymentAccount(lineAccount)) {
        return NextResponse.json({ error: `Invalid expense account: ${line.accountId}` }, { status: 400 });
      }

      const description = typeof line.description === 'string' && line.description.trim() !== ''
        ? line.description.trim()
        : lineAccount.FullyQualifiedName ? lineAccount.FullyQualifiedName : lineAccount.Name;

      parsedLines.push({
        amount: line.amount,
        accountId: line.accountId,
        description,
      });
    }

    const normalizedVendorId = typeof vendorId === 'string' && vendorId.trim() !== '' ? vendorId.trim() : undefined;
    const normalizedMemo = typeof memo === 'string' && memo.trim() !== '' ? memo.trim() : undefined;

    const createResult = await createPurchase(activeConnection, {
      txnDate: txnDate.trim(),
      paymentType: mapPaymentType(paymentAccount),
      paymentAccountId: paymentAccount.Id,
      vendorId: normalizedVendorId,
      privateNote: normalizedMemo,
      lines: parsedLines,
    });

    const finalConnection = createResult.updatedConnection ? createResult.updatedConnection : activeConnection;
    if (finalConnection !== connection) {
      await saveServerQboConnection(finalConnection);
    }

    return NextResponse.json({ purchase: createResult.purchase });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to create purchase', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to create purchase', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
