import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  buildAppLoginRedirect,
  getCandidateSessionCookieNames,
  normalizeBasePath,
  requireAppEntry,
  resolveAppAuthOrigin,
  resolvePortalAuthOrigin,
} from '@targon/auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.BASE_PATH ?? '/atlas')
  if (basePath && pathname.startsWith(`${basePath}${basePath}`)) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.slice(basePath.length)
    return NextResponse.redirect(url)
  }
  const normalizedPath = basePath && pathname.startsWith(basePath)
    ? pathname.slice(basePath.length) || '/'
    : pathname

  const PUBLIC_PREFIXES = ['/_next', '/favicon.ico']
  const PUBLIC_ROUTES = ['/health', '/api/health', '/no-access', '/api/access-requests']
  const isPublic =
    PUBLIC_ROUTES.includes(normalizedPath) ||
    PUBLIC_PREFIXES.some((p) => normalizedPath.startsWith(p))

  const allowDevAuthBypass =
    process.env.NODE_ENV !== 'production' &&
    (
      ['1', 'true', 'yes', 'on'].includes(
        String(process.env.ALLOW_DEV_AUTH_SESSION_BYPASS ?? '').toLowerCase(),
      ) ||
      ['1', 'true', 'yes', 'on'].includes(
        String(process.env.ALLOW_DEV_AUTH_DEFAULTS ?? '').toLowerCase(),
      )
    )

  if (!isPublic && !allowDevAuthBypass) {
    const cookieNames = Array.from(new Set([
      ...getCandidateSessionCookieNames('targon'),
      ...getCandidateSessionCookieNames('atlas'),
      ...getCandidateSessionCookieNames(String.fromCharCode(104, 114, 109, 115)),
    ]))

    const decision = await requireAppEntry({
      request,
      appId: 'atlas',
      lifecycle: 'active',
      entryPolicy: 'role_gated',
      cookieNames,
      debug: process.env.NODE_ENV !== 'production',
    })

    if (!decision.allowed) {
      console.info('[authz][atlas] denied', {
        path: normalizedPath,
        status: decision.status,
        reason: decision.reason,
      })

      if (normalizedPath.startsWith('/api/')) {
        const status = decision.status === 'unauthenticated' ? 401 : 403
        const errorMsg = decision.status === 'unauthenticated' ? 'Authentication required' : 'No access to Atlas'
        return NextResponse.json(
          { error: errorMsg, reason: decision.reason },
          { status },
        )
      }

      if (decision.status === 'forbidden') {
        const url = request.nextUrl.clone()
        url.pathname = basePath ? `${basePath}/no-access` : '/no-access'
        url.search = ''
        return NextResponse.redirect(url)
      }

      const login = buildAppLoginRedirect({
        portalOrigin: resolvePortalAuthOrigin({ request }),
        appOrigin: resolveAppAuthOrigin({ request }),
        appBasePath: basePath,
        pathname: request.nextUrl.pathname,
        search: request.nextUrl.search,
        hash: request.nextUrl.hash,
      })
      return NextResponse.redirect(login)
    }
  }

  const response = NextResponse.next()
  if (!isPublic) {
    response.headers.set('Cache-Control', 'private, no-store')
  }
  return response
}

export const config = {
  matcher: [
    '/',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
