import { handlers } from '@/lib/auth'
import { buildRecoverableAuthResponse, isRecoverableAuthError } from '@/lib/auth-route-recovery'
import { requireAuthEnv } from '@/lib/required-auth-env'
import { NextRequest } from 'next/server'

const COOKIE_DOMAIN = requireAuthEnv('COOKIE_DOMAIN')

async function handleWithErrorRecovery(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<Response>
): Promise<Response> {
  try {
    return await handler(request)
  } catch (error) {
    if (isRecoverableAuthError(error)) {
      const recoverableError = error as Error
      console.warn('[auth] Clearing invalid cookies due to error:', recoverableError.message)
      return buildRecoverableAuthResponse({
        pathname: request.nextUrl.pathname,
        requestUrl: request.url,
        cookieDomain: COOKIE_DOMAIN,
        requestCookieNames: request.cookies.getAll().map((cookie) => cookie.name),
      })
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
