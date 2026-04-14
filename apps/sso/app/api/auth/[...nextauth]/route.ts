import { handlers } from '@/lib/auth'
import { requireAuthEnv } from '@/lib/required-auth-env'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const COOKIE_DOMAIN = requireAuthEnv('COOKIE_DOMAIN')

async function clearAuthCookies() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  // Clear all auth-related cookies
  const authCookiePatterns = [
    'authjs',
    'next-auth',
    '__Secure-authjs',
    '__Host-authjs',
    'targon',
  ]

  for (const cookie of allCookies) {
    if (authCookiePatterns.some(pattern => cookie.name.includes(pattern))) {
      cookieStore.delete({
        name: cookie.name,
        domain: COOKIE_DOMAIN,
        path: '/',
      })
      // Also try without domain for localhost
      cookieStore.delete({
        name: cookie.name,
        path: '/',
      })
    }
  }
}

async function handleWithErrorRecovery(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<Response>
): Promise<Response> {
  try {
    return await handler(request)
  } catch (error: any) {
    const errorMessage = error?.message || ''
    const errorName = error?.name || ''

    // Check if this is an auth-related error that needs cookie clearing
    const isAuthError =
      errorMessage.includes('decrypt') ||
      errorMessage.includes('CSRF') ||
      errorMessage.includes('JWT') ||
      errorName.includes('JWTSessionError') ||
      errorName.includes('MissingCSRF')

    if (isAuthError) {
      console.warn('[auth] Clearing invalid cookies due to error:', errorMessage)
      await clearAuthCookies()

      // Redirect to login with clean state
      const loginUrl = new URL('/login', request.url)
      return NextResponse.redirect(loginUrl)
    }

    throw error
  }
}

export async function GET(request: NextRequest) {
  return handleWithErrorRecovery(request, handlers.GET)
}

export async function POST(request: NextRequest) {
  return handleWithErrorRecovery(request, handlers.POST)
}
