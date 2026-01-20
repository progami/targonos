import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { fetchPurchaseById, updatePurchase, type QboConnection } from '@/lib/qbo/api';
import { createLogger } from '@targon/logger';
import { ensureServerQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

const logger = createLogger({ name: 'qbo-purchase-update' });

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const cookieStore = await cookies();
    const connectionCookie = cookieStore.get('qbo_connection')?.value;

    if (!connectionCookie) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const connection: QboConnection = JSON.parse(connectionCookie);
    await ensureServerQboConnection(connection);
    const { purchase, updatedConnection } = await fetchPurchaseById(connection, id);

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

    return NextResponse.json({ purchase });
  } catch (error) {
    logger.error('Failed to fetch purchase', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const cookieStore = await cookies();
    const connectionCookie = cookieStore.get('qbo_connection')?.value;

    if (!connectionCookie) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const connection: QboConnection = JSON.parse(connectionCookie);
    await ensureServerQboConnection(connection);
    const body = await req.json();

    const { syncToken, paymentType, reference, memo } = body;

    if (!syncToken || !paymentType) {
      return NextResponse.json(
        { error: 'syncToken and paymentType are required' },
        { status: 400 }
      );
    }

    const { purchase, updatedConnection } = await updatePurchase(
      connection,
      id,
      syncToken,
      paymentType,
      {
        docNumber: reference,
        privateNote: memo,
      }
    );

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

    logger.info('Purchase updated successfully', { id, reference, memo });

    return NextResponse.json({
      success: true,
      purchase: {
        id: purchase.Id,
        syncToken: purchase.SyncToken,
        reference: purchase.DocNumber,
        memo: purchase.PrivateNote,
      },
    });
  } catch (error) {
    logger.error('Failed to update purchase', error);
    return NextResponse.json(
      { error: 'Failed to update purchase', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
