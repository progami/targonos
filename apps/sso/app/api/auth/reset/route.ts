import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const AUTH_COOKIE_PATTERNS = ['authjs', 'next-auth', '__Secure-', '__Host-', 'csrf', 'pkce', 'callback', 'targon', 'session']

export async function GET(request: NextRequest) {
  const cookieDomain = process.env.COOKIE_DOMAIN || '.targonglobal.com'
  const baseUrl = process.env.NEXTAUTH_URL || 'https://os.targonglobal.com'

  // Get provider and callbackUrl for direct signin flow
  const provider = request.nextUrl.searchParams.get('provider')
  const callbackUrl = request.nextUrl.searchParams.get('callbackUrl') || '/'

  // Clear cookies first, then start the OAuth flow in a clean request.
  const redirectUrl = new URL(provider === 'google' ? '/login/google' : '/login', baseUrl)
  redirectUrl.searchParams.set('callbackUrl', callbackUrl)

  const response = NextResponse.redirect(redirectUrl)

  // Clear ALL auth-related cookies
  const cookies = request.cookies.getAll()

  // Known cookie names that NextAuth uses
  const knownCookies = [
    '__Secure-next-auth.session-token',
    '__Secure-next-auth.callback-url',
    '__Secure-next-auth.csrf-token',
    '__Host-next-auth.csrf-token',
    'next-auth.session-token',
    'next-auth.callback-url',
    'next-auth.csrf-token',
    'targon.next-auth.session-token',
    'targon.next-auth.callback-url',
    'targon.next-auth.csrf-token',
    '__Secure-authjs.session-token',
    '__Secure-authjs.callback-url',
    '__Secure-authjs.csrf-token',
    'authjs.session-token',
    'authjs.callback-url',
    'authjs.csrf-token',
  ]

  // Clear all known cookies explicitly
  for (const name of knownCookies) {
    // With domain and secure
    response.cookies.set({
      name,
      value: '',
      domain: cookieDomain,
      path: '/',
      maxAge: 0,
      expires: new Date(0),
      secure: true,
    })
    // Without domain (for host-only cookies)
    response.cookies.set({
      name,
      value: '',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
      secure: true,
    })
  }

  // Also clear any cookies from the request that match patterns
  for (const cookie of cookies) {
    const nameLower = cookie.name.toLowerCase()
    if (AUTH_COOKIE_PATTERNS.some(p => nameLower.includes(p.toLowerCase()))) {
      response.cookies.set({
        name: cookie.name,
        value: '',
        domain: cookieDomain,
        path: '/',
        maxAge: 0,
        expires: new Date(0),
        secure: true,
      })
      response.cookies.set({
        name: cookie.name,
        value: '',
        path: '/',
        maxAge: 0,
        expires: new Date(0),
      })
    }
  }

  return response
}
