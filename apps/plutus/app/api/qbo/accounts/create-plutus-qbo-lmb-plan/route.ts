import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createLogger } from '@targon/logger';
import { QboAuthError, type QboConnection } from '@/lib/qbo/api';
import { ensurePlutusQboLmbPlanAccounts, type AccountMappings } from '@/lib/qbo/plutus-qbo-lmb-plan';
import { ensureServerQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { randomUUID } from 'crypto';

const logger = createLogger({ name: 'qbo-create-plutus-lmb-accounts' });

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

export async function POST(request: NextRequest) {
  const requestId = randomUUID();

  try {
    const cookieStore = await cookies();
    const connectionCookie = cookieStore.get('qbo_connection')?.value;

    if (!connectionCookie) {
      logger.info('Missing qbo_connection cookie', { requestId });
      return NextResponse.json({ error: 'Not connected to QBO', requestId }, { status: 401 });
    }

    const connection: QboConnection = JSON.parse(connectionCookie);
    logger.info('Ensuring Plutus LMB plan accounts', {
      requestId,
      realmId: connection.realmId,
      expiresAt: connection.expiresAt,
    });
    await ensureServerQboConnection(connection);

    const body = (await request.json()) as {
      brandNames: string[];
      accountMappings: AccountMappings;
    };

    const result = await ensurePlutusQboLmbPlanAccounts(connection, {
      brandNames: body.brandNames,
      accountMappings: body.accountMappings,
    });

    if (result.updatedConnection) {
      logger.info('QBO access token refreshed during account creation', {
        requestId,
        realmId: result.updatedConnection.realmId,
        expiresAt: result.updatedConnection.expiresAt,
      });
      cookieStore.set('qbo_connection', JSON.stringify(result.updatedConnection), {
        httpOnly: true,
        secure: shouldUseSecureCookies(request),
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 100,
        path: '/',
      });
      await saveServerQboConnection(result.updatedConnection);
    }

    logger.info('Plutus LMB plan accounts ensured', {
      requestId,
      created: result.created.length,
      skipped: result.skipped.length,
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

    logger.error('Failed to create Plutus LMB plan accounts', { requestId, error });
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
