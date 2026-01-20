import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeCodeForTokens } from '@/lib/qbo/client';
import { createLogger } from '@targon/logger';
import { z } from 'zod';
import { saveServerQboConnection } from '@/lib/qbo/connection-store';
import type { QboConnection } from '@/lib/qbo/api';

const logger = createLogger({ name: 'qbo-callback' });

const CallbackSchema = z.object({
  code: z.string().min(1),
  realmId: z.string().min(1),
  state: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const baseUrl = process.env.BASE_URL ?? req.nextUrl.origin;

  try {
    const cookieStore = await cookies();
    const storedState = cookieStore.get('qbo_oauth_state')?.value;

    // Parse and validate query params
    const parsed = CallbackSchema.safeParse({
      code: req.nextUrl.searchParams.get('code'),
      realmId: req.nextUrl.searchParams.get('realmId'),
      state: req.nextUrl.searchParams.get('state'),
    });

    if (!parsed.success) {
      logger.error('Invalid callback params', { errors: parsed.error.issues });
      return NextResponse.redirect(new URL(`${basePath}?error=invalid_params`, baseUrl));
    }

    const { code, realmId, state } = parsed.data;

    // Verify CSRF state
    if (state !== storedState) {
      logger.error('State mismatch - possible CSRF attack');
      return NextResponse.redirect(new URL(`${basePath}?error=invalid_state`, baseUrl));
    }

    // Clear state cookie
    cookieStore.delete('qbo_oauth_state');

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, realmId);

    logger.info('Successfully obtained QBO tokens', { realmId });

    const connection: QboConnection = {
      realmId: tokens.realmId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    };

    cookieStore.set('qbo_connection', JSON.stringify(connection), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 100, // 100 days (refresh token lifetime)
      path: '/',
    });

    await saveServerQboConnection(connection);

    return NextResponse.redirect(new URL(`${basePath}?connected=true`, baseUrl));
  } catch (error) {
    logger.error('QBO callback failed', error);
    return NextResponse.redirect(new URL(`${basePath}?error=token_exchange_failed`, baseUrl));
  }
}
