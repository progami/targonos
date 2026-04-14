import { signIn } from '@/lib/auth'
import { requireAuthEnv } from '@/lib/required-auth-env'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE_DOMAIN = requireAuthEnv('COOKIE_DOMAIN')

const AUTH_COOKIE_PATTERNS = ['authjs', 'next-auth', '__Secure-', '__Host-', 'csrf', 'pkce', 'callback', 'targon', 'session']
const KNOWN_COOKIES = [
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

async function clearAuthCookies() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  const expire = {
    value: '',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  } as const

  const clearCookie = (name: string) => {
    cookieStore.set({
      name,
      ...expire,
      domain: COOKIE_DOMAIN,
      secure: true,
    })
    cookieStore.set({
      name,
      ...expire,
      secure: true,
    })
    cookieStore.set({
      name,
      ...expire,
      domain: COOKIE_DOMAIN,
    })
    cookieStore.set({
      name,
      ...expire,
    })
  }

  for (const name of KNOWN_COOKIES) {
    clearCookie(name)
  }

  for (const cookie of allCookies) {
    const nameLower = cookie.name.toLowerCase()
    if (AUTH_COOKIE_PATTERNS.some(pattern => nameLower.includes(pattern.toLowerCase()))) {
      clearCookie(cookie.name)
    }
  }
}

export async function GET(request: NextRequest) {
  const callbackUrl = request.nextUrl.searchParams.get('callbackUrl') || '/'
  const hasRetried = request.nextUrl.searchParams.get('retry') === '1'

  try {
    const redirectUrl = await signIn('google', { redirect: false, redirectTo: callbackUrl })
    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    if (!hasRetried && isRecoverableAuthError(error)) {
      console.warn('[login/google] Recovering from auth error by clearing cookies:', error)
      await clearAuthCookies()
      const retryUrl = new URL(request.nextUrl)
      retryUrl.searchParams.set('retry', '1')
      return NextResponse.redirect(retryUrl)
    }

    console.error('[login/google] Sign-in failed:', error)
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', callbackUrl)
    loginUrl.searchParams.set('error', 'OAuthCallback')
    return NextResponse.redirect(loginUrl)
  }
}
