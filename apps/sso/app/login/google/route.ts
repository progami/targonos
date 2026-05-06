import { signIn } from '@/lib/auth'
import { appendExpiredAuthCookieHeaders } from '@/lib/auth-cookie-clear'
import { requireAuthEnv } from '@/lib/required-auth-env'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE_DOMAIN = requireAuthEnv('COOKIE_DOMAIN')

function isRecoverableAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message ?? ''
  const name = error.name ?? ''
  return (
    message.includes('decrypt') ||
    message.includes('JWEDecryptionFailed') ||
    message.includes('CSRF') ||
    message.includes('JWT') ||
    name.includes('JWTSessionError') ||
    name.includes('MissingCSRF')
  )
}

export async function GET(request: NextRequest) {
  const callbackUrl = request.nextUrl.searchParams.get('callbackUrl') ?? '/'
  const hasRetried = request.nextUrl.searchParams.get('retry') === '1'

  try {
    const redirectUrl = await signIn('google', { redirect: false, redirectTo: callbackUrl })
    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    if (!hasRetried && isRecoverableAuthError(error)) {
      console.warn('[login/google] Recovering from auth error by clearing cookies:', error)
      const retryUrl = new URL(request.nextUrl)
      retryUrl.searchParams.set('retry', '1')
      const response = NextResponse.redirect(retryUrl)
      appendExpiredAuthCookieHeaders(response, {
        cookieDomain: COOKIE_DOMAIN,
        requestCookieNames: request.cookies.getAll().map((cookie) => cookie.name),
      })
      return response
    }

    console.error('[login/google] Sign-in failed:', error)
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', callbackUrl)
    loginUrl.searchParams.set('error', 'OAuthCallback')
    return NextResponse.redirect(loginUrl)
  }
}
