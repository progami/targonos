import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthorizationUrl } from '@/lib/qbo/client';
import { createLogger } from '@targon/logger';

const logger = createLogger({ name: 'qbo-connect' });

export async function GET() {
  try {
    // Generate CSRF state token
    const state = crypto.randomUUID();

    // Store state in cookie for verification on callback
    const cookieStore = await cookies();
    cookieStore.set('qbo_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    // Get authorization URL
    const authUrl = getAuthorizationUrl(state);

    logger.info('Redirecting to QBO authorization');
    return NextResponse.redirect(authUrl);
  } catch (error) {
    logger.error('Failed to initiate QBO connection', error);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
    if (basePath === undefined) {
      throw new Error('NEXT_PUBLIC_BASE_PATH is required');
    }

    const baseUrl = process.env.BASE_URL;
    if (baseUrl === undefined) {
      throw new Error('BASE_URL is required');
    }

    return NextResponse.redirect(new URL(`${basePath}?error=connect_failed`, baseUrl));
  }
}
