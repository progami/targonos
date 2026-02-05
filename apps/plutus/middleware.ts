import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildPortalUrl, getCandidateSessionCookieNames, requireAppEntry } from '@targon/auth'

function normalizeBasePath(value?: string | null) {
  if (!value || value === '/') return ''
  const trimmed = value.replace(/\/+$/g, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function callbackUrlForRequest(request: NextRequest, appBasePath: string): string {
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')

  const protocol = (forwardedProto?.split(',')[0]?.trim() || request.nextUrl.protocol.replace(':', '') || 'https')
  const host = forwardedHost?.split(',')[0]?.trim() || request.nextUrl.host

  const pathname = request.nextUrl.pathname.startsWith(appBasePath) || !appBasePath
    ? request.nextUrl.pathname
    : `${appBasePath}${request.nextUrl.pathname}`

  return `${protocol}://${host}${pathname}${request.nextUrl.search}`
}

export async function middleware(request: NextRequest) {
  const appBasePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH || process.env.BASE_PATH)
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
    normalizedPath.startsWith('/_next') ||
    normalizedPath === '/favicon.ico' ||
    normalizedPath === '/favicon.svg'

  if (isPublic) {
    return NextResponse.next()
  }

  const decision = await requireAppEntry({
    request,
    appId: 'plutus',
    lifecycle: 'active',
    entryPolicy: 'role_gated',
    cookieNames: Array.from(new Set([
      ...getCandidateSessionCookieNames('targon'),
      ...getCandidateSessionCookieNames('plutus'),
    ])),
  })

  if (!decision.allowed) {
    console.info('[authz][plutus] denied', {
      path: normalizedPath,
      status: decision.status,
      reason: decision.reason,
    })

    if (normalizedPath.startsWith('/api/')) {
      const status = decision.status === 'unauthenticated' ? 401 : 403
      const error = decision.status === 'unauthenticated' ? 'Authentication required' : 'No access to Plutus'
      return NextResponse.json({ error, reason: decision.reason }, { status })
    }

    if (decision.status === 'forbidden') {
      const url = request.nextUrl.clone()
      url.pathname = appBasePath ? `${appBasePath}/no-access` : '/no-access'
      url.search = ''
      return NextResponse.redirect(url)
    }

    const login = buildPortalUrl('/login', { request })
    login.searchParams.set('callbackUrl', callbackUrlForRequest(request, appBasePath))
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
