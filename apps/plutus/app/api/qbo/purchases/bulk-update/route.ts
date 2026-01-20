import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { updatePurchase, type QboConnection } from '@/lib/qbo/api';
import { createLogger } from '@targon/logger';
import type { BulkUpdateRequest, BulkUpdateResponse } from '@/lib/sop/types';
import { ensureServerQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

const logger = createLogger({ name: 'qbo-bulk-update' });

// Rate limit: max 10 concurrent requests to QBO
const BATCH_SIZE = 10;
// Delay between batches (ms)
const BATCH_DELAY = 500;

/**
 * Bulk update Purchase transactions
 * QBO doesn't have a batch API, so we process sequentially with rate limiting
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const connectionCookie = cookieStore.get('qbo_connection')?.value;

    if (!connectionCookie) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    let connection: QboConnection;
    try {
      connection = JSON.parse(connectionCookie);
    } catch {
      logger.error('Failed to parse QBO connection cookie');
      return NextResponse.json({ error: 'Invalid connection' }, { status: 401 });
    }
    await ensureServerQboConnection(connection);

    const body: BulkUpdateRequest = await request.json();
    const { updates } = body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    logger.info('Starting bulk update', { count: updates.length });

    const results: BulkUpdateResponse['results'] = [];
    let successful = 0;
    let failed = 0;
    let currentConnection = connection;

    // Process in batches
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);

      // Process batch sequentially to avoid overwhelming QBO
      for (const update of batch) {
        try {
          const { purchase, updatedConnection } = await updatePurchase(
            currentConnection,
            update.purchaseId,
            update.syncToken,
            update.paymentType,
            {
              docNumber: update.reference,
              privateNote: update.memo,
            }
          );

          // Update connection if token was refreshed
          if (updatedConnection) {
            currentConnection = updatedConnection;
          }

          results.push({
            purchaseId: update.purchaseId,
            status: 'success',
          });
          successful++;

          logger.debug('Updated purchase', { purchaseId: update.purchaseId });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.push({
            purchaseId: update.purchaseId,
            status: 'error',
            error: errorMessage,
          });
          failed++;

          logger.error('Failed to update purchase', {
            purchaseId: update.purchaseId,
            error: errorMessage,
          });
        }
      }

      // Delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < updates.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
      }
    }

    // Update cookie if connection was refreshed
    if (currentConnection !== connection) {
      cookieStore.set('qbo_connection', JSON.stringify(currentConnection), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 100, // 100 days
        path: '/',
      });
      await saveServerQboConnection(currentConnection);
    }

    logger.info('Bulk update completed', {
      total: updates.length,
      successful,
      failed,
    });

    const response: BulkUpdateResponse = {
      total: updates.length,
      successful,
      failed,
      results,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Bulk update failed', error);
    return NextResponse.json(
      {
        error: 'Bulk update failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
