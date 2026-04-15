import { appendExpiredAuthCookieHeaders } from '@/lib/auth-cookie-clear'
import { requireAuthEnv } from '@/lib/required-auth-env'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const cookieDomain = requireAuthEnv('COOKIE_DOMAIN')
const baseUrl = requireAuthEnv('NEXTAUTH_URL')

export async function GET(request: NextRequest) {
  // Get provider and callbackUrl for direct signin flow
  const provider = request.nextUrl.searchParams.get('provider')
  const callbackUrl = request.nextUrl.searchParams.get('callbackUrl') ?? '/'

  // Clear cookies first, then start the OAuth flow in a clean request.
  const redirectUrl = new URL(provider === 'google' ? '/login/google' : '/login', baseUrl)
  redirectUrl.searchParams.set('callbackUrl', callbackUrl)

  const response = NextResponse.redirect(redirectUrl)

  appendExpiredAuthCookieHeaders(response, {
    cookieDomain,
    requestCookieNames: request.cookies.getAll().map((cookie) => cookie.name),
  })

  return response
}
