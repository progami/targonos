import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createLogger } from '@targon/logger';
import { deleteServerQboConnection } from '@/lib/qbo/connection-store';
import { decodePlutusPortalSession, isPlatformAdminPortalSession } from '@/lib/portal-session';

const logger = createLogger({ name: 'qbo-disconnect' });

export async function POST(request: Request) {
  const session = await decodePlutusPortalSession(request.headers.get('cookie'));
  if (!isPlatformAdminPortalSession(session)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

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
