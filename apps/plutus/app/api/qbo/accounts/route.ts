import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { fetchAccounts, type QboConnection } from '@/lib/qbo/api';
import { createLogger } from '@targon/logger';
import { ensureServerQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { getAccountSource } from '@/lib/lmb/default-accounts';
import { randomUUID } from 'crypto';

const logger = createLogger({ name: 'qbo-accounts' });

function shouldUseSecureCookies(request: NextRequest): boolean {
  let isHttps = request.nextUrl.protocol === 'https:';
  if (!isHttps) {
    const forwardedProto = request.headers.get('x-forwarded-proto');
    if (forwardedProto === 'https') {
      isHttps = true;
    }
  }
  return isHttps;
}

// QBO Account Type order (matches QuickBooks Online Chart of Accounts view)
const ACCOUNT_TYPE_ORDER: Record<string, number> = {
  Bank: 1,
  'Accounts Receivable': 2,
  'Other Current Asset': 3,
  'Fixed Asset': 4,
  'Other Asset': 5,
  'Accounts Payable': 6,
  'Credit Card': 7,
  'Other Current Liability': 8,
  'Long Term Liability': 9,
  Equity: 10,
  Income: 11,
  'Other Income': 12,
  'Cost of Goods Sold': 13,
  Expense: 14,
  'Other Expense': 15,
};

export async function GET(request: NextRequest) {
  const requestId = randomUUID();

  try {
    const cookieStore = await cookies();
    const connectionCookie = cookieStore.get('qbo_connection')?.value;

    if (!connectionCookie) {
      logger.info('Missing qbo_connection cookie', { requestId });
      return NextResponse.json({ error: 'Not connected to QBO', requestId }, { status: 401 });
    }

    const connection: QboConnection = JSON.parse(connectionCookie);
    logger.info('Fetching QBO accounts', { requestId, realmId: connection.realmId, expiresAt: connection.expiresAt });
    await ensureServerQboConnection(connection);

    const { accounts, updatedConnection } = await fetchAccounts(connection, {
      includeInactive: true,
    });

    // Update cookie if token was refreshed
    if (updatedConnection) {
      logger.info('QBO access token refreshed', {
        requestId,
        realmId: updatedConnection.realmId,
        expiresAt: updatedConnection.expiresAt,
      });
      cookieStore.set('qbo_connection', JSON.stringify(updatedConnection), {
        httpOnly: true,
        secure: shouldUseSecureCookies(request),
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 100,
        path: '/',
      });
      await saveServerQboConnection(updatedConnection);
    }

    // Transform all accounts for frontend (matching QBO's Chart of Accounts view)
    const allAccounts = accounts
      .map((a) => {
        const fullyQualifiedName = a.FullyQualifiedName ? a.FullyQualifiedName : a.Name;
        const pathParts = fullyQualifiedName.split(':');
        const depth = pathParts.length - 1;
        const parentName = pathParts.length > 1 ? pathParts.slice(0, -1).join(':') : null;
        const balance = a.CurrentBalance === undefined ? 0 : a.CurrentBalance;

        return {
          id: a.Id,
          name: a.Name,
          active: a.Active,
          type: a.AccountType,
          subType: a.AccountSubType,
          fullyQualifiedName,
          acctNum: a.AcctNum,
          balance,
          currency: a.CurrencyRef ? a.CurrencyRef.value : 'USD',
          classification: a.Classification,
          isSubAccount: a.SubAccount === true,
          parentName,
          depth,
          source: getAccountSource(a.Name),
        };
      })
      // Sort by Account Type (QBO order), then by FullyQualifiedName within each type
      .sort((a, b) => {
        const rawOrderA = ACCOUNT_TYPE_ORDER[a.type];
        const rawOrderB = ACCOUNT_TYPE_ORDER[b.type];
        const typeOrderA = rawOrderA === undefined ? 99 : rawOrderA;
        const typeOrderB = rawOrderB === undefined ? 99 : rawOrderB;
        if (typeOrderA !== typeOrderB) {
          return typeOrderA - typeOrderB;
        }
        return a.fullyQualifiedName.localeCompare(b.fullyQualifiedName);
      });

    logger.info('Fetched QBO accounts', { requestId, total: allAccounts.length });
    return NextResponse.json({ accounts: allAccounts, total: allAccounts.length, requestId });
  } catch (error) {
    logger.error('Failed to fetch accounts', { requestId, error });
    return NextResponse.json(
      {
        error: 'Failed to fetch accounts',
        details: error instanceof Error ? error.message : String(error),
        requestId,
      },
      { status: 500 }
    );
  }
}
