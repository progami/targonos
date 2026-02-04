import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthorizationUrl } from '@/lib/qbo/client';
import { createLogger } from '@targon/logger';

const logger = createLogger({ name: 'qbo-connect' });

export async function GET(req: NextRequest) {
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
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
    if (basePath === undefined) {
      logger.error('Failed to initiate QBO connection (missing NEXT_PUBLIC_BASE_PATH)');
      return NextResponse.json({ error: 'Misconfigured environment: missing NEXT_PUBLIC_BASE_PATH' }, { status: 500 });
    }

    const baseUrlFromEnv = process.env.BASE_URL;
    const baseUrl = baseUrlFromEnv === undefined ? req.nextUrl.origin : baseUrlFromEnv;

    logger.error('Failed to initiate QBO connection', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.redirect(new URL(`${basePath}?error=connect_failed`, baseUrl));
  }
}
