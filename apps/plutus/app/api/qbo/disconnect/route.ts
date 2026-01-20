import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createLogger } from '@targon/logger';
import { deleteServerQboConnection } from '@/lib/qbo/connection-store';

const logger = createLogger({ name: 'qbo-disconnect' });

export async function POST() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('qbo_connection');
    await deleteServerQboConnection();

    logger.info('QBO connection disconnected');
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to disconnect QBO', error);
    return NextResponse.json({ success: false, error: 'Failed to disconnect' }, { status: 500 });
  }
}
