import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createLogger } from '@targon/logger';
import { fetchAccounts, type QboConnection, updateAccountActive } from '@/lib/qbo/api';
import { ensureServerQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

const logger = createLogger({ name: 'qbo-deactivate-duplicate-accounts' });

const AMAZON_DUPLICATE_ACCOUNTS = [
  'Amazon Sales',
  'Amazon Refunds',
  'Amazon Reimbursement',
  'Amazon Reimbursements',
  'Amazon Shipping',
  'Amazon Advertising',
  'Amazon FBA Fees',
  'Amazon Seller Fees',
  'Amazon Storage Fees',
  'Amazon FBA Inventory Reimbursement',
  'Amazon Carried Balances',
  'Amazon Pending Balances',
  'Amazon Deferred Balances',
  'Amazon Reserved Balances',
  'Amazon Split Month Rollovers',
  'Amazon Loans',
  'Amazon Sales Tax',
  'Amazon Sales Tax Collected',
] as const;

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const connectionCookie = cookieStore.get('qbo_connection')?.value;

    if (!connectionCookie) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const connection: QboConnection = JSON.parse(connectionCookie);
    await ensureServerQboConnection(connection);

    const body = (await request.json()) as {
      accountNames?: string[];
      dryRun?: boolean;
    };

    const dryRun = body.dryRun === true;
    const accountNames = Array.isArray(body.accountNames) ? body.accountNames : [...AMAZON_DUPLICATE_ACCOUNTS];

    const { accounts, updatedConnection } = await fetchAccounts(connection, {
      includeInactive: true,
    });

    let currentConnection = updatedConnection ? updatedConnection : connection;
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

    const targets = new Set(accountNames.map((name) => name.toLowerCase()));
    const matches = accounts.filter((account) => targets.has(account.Name.toLowerCase()));

    const matchedNames = new Set(matches.map((account) => account.Name.toLowerCase()));
    const missing = accountNames.filter((name) => !matchedNames.has(name.toLowerCase()));

    logger.info('Duplicate account scan', {
      totalTargets: accountNames.length,
      matched: matches.length,
      missing: missing.length,
      dryRun,
    });

    const results: Array<{ name: string; id: string; active: boolean; status: 'deactivated' | 'skipped' }> = [];

    if (!dryRun) {
      for (const account of matches) {
        if (account.Active === false) {
          results.push({ name: account.Name, id: account.Id, active: false, status: 'skipped' });
          continue;
        }

        const { account: updated, updatedConnection: refreshed } = await updateAccountActive(
          currentConnection,
          account.Id,
          account.SyncToken,
          account.Name,
          false,
        );

        results.push({
          name: updated.Name,
          id: updated.Id,
          active: updated.Active === true,
          status: 'deactivated',
        });

        if (refreshed) {
          currentConnection = refreshed;
          cookieStore.set('qbo_connection', JSON.stringify(refreshed), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 100,
            path: '/',
          });
          await saveServerQboConnection(refreshed);
        }
      }
    }

    return NextResponse.json({
      dryRun,
      totalTargets: accountNames.length,
      matched: matches.map((a) => ({ id: a.Id, name: a.Name, active: a.Active })),
      missing,
      results,
    });
  } catch (error) {
    logger.error('Failed to deactivate duplicate accounts', error);
    return NextResponse.json(
      {
        error: 'Failed to deactivate duplicate accounts',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
