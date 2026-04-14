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
  const appBasePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.BASE_PATH)
  const pathname = request.nextUrl.pathname

  if (appBasePath && pathname.startsWith(`${appBasePath}${appBasePath}`)) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.slice(appBasePath.length)
    return NextResponse.redirect(url)
  }

  const normalizedPath = appBasePath && pathname.startsWith(appBasePath)
    ? pathname.slice(appBasePath.length) || '/'
    : pathname

  const isTokenAuthedCronRoute =
    normalizedPath === '/api/v1/xplan/sellerboard/us-actual-sales' ||
    normalizedPath === '/api/v1/xplan/sellerboard/us-dashboard' ||
    normalizedPath === '/api/v1/xplan/sellerboard/uk-actual-sales' ||
    normalizedPath === '/api/v1/xplan/sellerboard/uk-dashboard'

  const isPublic =
    isTokenAuthedCronRoute ||
    normalizedPath === '/no-access' ||
    normalizedPath === '/api/health' ||
    normalizedPath.startsWith('/api/auth/') ||
    normalizedPath.startsWith('/_next') ||
    normalizedPath === '/favicon.ico' ||
    normalizedPath === '/favicon.svg'

  if (isPublic) {
    return NextResponse.next()
  }

  const decision = await requireAppEntry({
    request,
    appId: 'xplan',
    lifecycle: 'active',
    entryPolicy: 'role_gated',
    cookieNames: Array.from(new Set([
      ...getCandidateSessionCookieNames('targon'),
      ...getCandidateSessionCookieNames('xplan'),
      ...getCandidateSessionCookieNames(String.fromCharCode(120, 45, 112, 108, 97, 110)),
    ])),
  })

  if (!decision.allowed) {
    console.info('[authz][xplan] denied', {
      path: normalizedPath,
      status: decision.status,
      reason: decision.reason,
    })

    if (normalizedPath.startsWith('/api/')) {
      const status = decision.status === 'unauthenticated' ? 401 : 403
      const error = decision.status === 'unauthenticated' ? 'Authentication required' : 'No access to xplan'
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
