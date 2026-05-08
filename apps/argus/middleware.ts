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

const truthyValues = new Set(['1', 'true', 'yes', 'on'])
const loopbackHostnames = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

function isLoopbackHostname(rawHostname: string): boolean {
  const hostname = rawHostname.trim().toLowerCase().replace(/\.$/, '')
  if (hostname === '') {
    return false
  }

  if (loopbackHostnames.has(hostname)) {
    return true
  }

  return hostname.endsWith('.localhost')
}

function isLocalDevAuthBypassEnabled(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false
  }

  const allowSessionBypass = truthyValues.has(String(process.env.ALLOW_DEV_AUTH_SESSION_BYPASS ?? '').toLowerCase())
  const allowDefaults = truthyValues.has(String(process.env.ALLOW_DEV_AUTH_DEFAULTS ?? '').toLowerCase())
  if (!allowSessionBypass && !allowDefaults) {
    return false
  }

  return isLoopbackHostname(request.nextUrl.hostname)
}

export async function middleware(request: NextRequest) {
  const appBasePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.BASE_PATH ?? '/argus')
  const pathname = request.nextUrl.pathname

  if (appBasePath && pathname.startsWith(`${appBasePath}${appBasePath}`)) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.slice(appBasePath.length)
    return NextResponse.redirect(url)
  }

  const normalizedPath = appBasePath && pathname.startsWith(appBasePath)
    ? pathname.slice(appBasePath.length) || '/'
    : pathname

  const isPublic =
    normalizedPath === '/no-access' ||
    normalizedPath === '/api/health' ||
    normalizedPath === '/api/tracking/fetch' ||
    normalizedPath === '/api/alerts/preview' ||
    normalizedPath.startsWith('/brand/') ||
    normalizedPath.startsWith('/_next') ||
    normalizedPath === '/favicon.ico' ||
    normalizedPath === '/favicon.svg'

  if (isPublic) {
    return NextResponse.next()
  }

  if (isLocalDevAuthBypassEnabled(request)) {
    return NextResponse.next()
  }

  const decision = await requireAppEntry({
    request,
    appId: 'argus',
    lifecycle: 'active',
    entryPolicy: 'public',
    cookieNames: Array.from(new Set([
      ...getCandidateSessionCookieNames('targon'),
      ...getCandidateSessionCookieNames('argus'),
    ])),
  })

  if (!decision.allowed) {
    console.info('[authz][argus] denied', {
      path: normalizedPath,
      status: decision.status,
      reason: decision.reason,
    })

    if (normalizedPath.startsWith('/api/')) {
      const status = decision.status === 'unauthenticated' ? 401 : 403
      const error = decision.status === 'unauthenticated' ? 'Authentication required' : 'No access to Argus'
      return NextResponse.json({ error, reason: decision.reason }, { status })
    }

    if (decision.status === 'forbidden') {
      const url = request.nextUrl.clone()
      url.pathname = appBasePath ? `${appBasePath}/no-access` : '/no-access'
      url.search = ''
      return NextResponse.redirect(url)
    }

    const login = buildAppLoginRedirect({
      portalOrigin: resolvePortalAuthOrigin({ request }),
      appOrigin: resolveAppAuthOrigin({ request }),
      appBasePath,
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
      hash: request.nextUrl.hash,
    })
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
