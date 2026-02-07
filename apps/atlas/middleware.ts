import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCandidateSessionCookieNames, requireAppEntry } from '@targon/auth'

import { portalUrl } from '@/lib/portal'
import { resolveAppOrigin } from '@/lib/request-origin'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const normalizeBasePath = (value?: string | null) => {
    if (!value) return ''
    const trimmed = value.trim()
    if (!trimmed || trimmed === '/') return ''
    const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
    return withLeading.length > 1 && withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading
  }

  const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH || process.env.BASE_PATH || '/atlas')
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

  if (!isPublic) {
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

      const login = portalUrl('/login', request)
      const callbackOrigin = resolveAppOrigin(request)
      const callbackPathname = (() => {
        if (!basePath) return request.nextUrl.pathname
        if (request.nextUrl.pathname.startsWith(basePath)) return request.nextUrl.pathname
        return request.nextUrl.pathname === '/' ? basePath : `${basePath}${request.nextUrl.pathname}`
      })()
      const callbackUrl = new URL(
        callbackPathname + request.nextUrl.search + request.nextUrl.hash,
        callbackOrigin,
      )
      login.searchParams.set('callbackUrl', callbackUrl.toString())
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
