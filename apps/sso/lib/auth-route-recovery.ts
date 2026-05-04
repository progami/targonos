import { appendExpiredAuthCookieHeaders } from './auth-cookie-clear'
import { NextResponse } from 'next/server'

type RecoverableAuthResponseInput = {
  pathname: string
  requestUrl: string
  cookieDomain: string
  requestCookieNames: string[]
}

export function isRecoverableAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const errorMessage = error.message
  const errorName = error.name ?? ''

  return (
    errorMessage.includes('decrypt') ||
    errorMessage.includes('CSRF') ||
    errorMessage.includes('JWT') ||
    errorName.includes('JWTSessionError') ||
    errorName.includes('MissingCSRF')
  )
}

function isSessionEndpoint(pathname: string): boolean {
  return pathname === '/api/auth/session' || pathname.endsWith('/api/auth/session')
}

export function buildRecoverableAuthResponse(
  input: RecoverableAuthResponseInput,
): NextResponse {
  const response = isSessionEndpoint(input.pathname)
    ? NextResponse.json(null)
    : NextResponse.redirect(new URL('/login', input.requestUrl))

  appendExpiredAuthCookieHeaders(response, {
    cookieDomain: input.cookieDomain,
    requestCookieNames: input.requestCookieNames,
  })

  return response
}
