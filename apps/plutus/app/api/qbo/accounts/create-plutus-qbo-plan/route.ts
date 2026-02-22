import { NextResponse, type NextRequest } from 'next/server';
import { createLogger } from '@targon/logger';
import { randomUUID } from 'crypto';

import { QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { invalidateCache } from '@/lib/qbo/cache';
import { ensurePlutusQboPlanAccounts, type AccountMappings } from '@/lib/qbo/plutus-qbo-plan';
import { getCurrentUser } from '@/lib/current-user';
import { logAudit } from '@/lib/plutus/audit-log';

const logger = createLogger({ name: 'qbo-create-plutus-plan-accounts' });

export async function POST(request: NextRequest) {
  const requestId = randomUUID();

  try {
    const connection = await getQboConnection();
    if (!connection) {
      logger.info('Missing qbo_connection', { requestId });
      return NextResponse.json({ error: 'Not connected to QBO', requestId }, { status: 401 });
    }

    logger.info('Ensuring Plutus plan accounts', {
      requestId,
      realmId: connection.realmId,
      expiresAt: connection.expiresAt,
    });

    const body = (await request.json()) as {
      brandNames: string[];
      accountMappings: AccountMappings;
    };

    const result = await ensurePlutusQboPlanAccounts(connection, {
      brandNames: body.brandNames,
      accountMappings: body.accountMappings,
    });

    if (result.updatedConnection) {
      logger.info('QBO access token refreshed during account creation', {
        requestId,
        realmId: result.updatedConnection.realmId,
        expiresAt: result.updatedConnection.expiresAt,
      });
      await saveServerQboConnection(result.updatedConnection);
    }

    logger.info('Plutus plan accounts ensured', {
      requestId,
      created: result.created.length,
      skipped: result.skipped.length,
    });

    // Accounts are cached for 30 minutes; invalidate so follow-up pages see newly created sub-accounts immediately.
    invalidateCache(`accounts:${connection.realmId}:`);

    const user = await getCurrentUser();
    await logAudit({
      userId: user?.id ?? 'system',
      userName: user?.name ?? user?.email ?? 'system',
      action: 'ACCOUNTS_CREATED',
      entityType: 'QboAccount',
      details: {
        createdCount: result.created.length,
        skippedCount: result.skipped.length,
        brandNames: body.brandNames,
      },
    });

    return NextResponse.json({
      created: result.created.map((a) => ({
        id: a.Id,
        name: a.Name,
        fullyQualifiedName: a.FullyQualifiedName,
        accountType: a.AccountType,
        accountSubType: a.AccountSubType,
      })),
      skipped: result.skipped,
      requestId,
    });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message, requestId }, { status: 401 });
    }

    logger.error('Failed to create Plutus plan accounts', { requestId, error });
    return NextResponse.json(
      {
        error: 'Failed to create accounts',
        details: error instanceof Error ? error.message : String(error),
        requestId,
      },
      { status: 500 },
    );
  }
}

