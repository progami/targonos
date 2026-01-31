import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCandidateSessionCookieNames, decodePortalSession, getAppEntitlement } from '@targon/auth'
import { portalUrl } from '@/lib/portal'
import { resolveAppOrigin } from '@/lib/request-origin'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  // Use same default as next.config.js for consistency
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

  // Public routes - only specific endpoints, NOT all /api/ routes
  // Security: Removed '/' and '/api/setup/departments' from public routes
  const PUBLIC_PREFIXES = ['/_next', '/favicon.ico']
  const PUBLIC_ROUTES = ['/health', '/api/health', '/no-access', '/api/access-requests']
  const isPublic =
    PUBLIC_ROUTES.includes(normalizedPath) ||
    PUBLIC_PREFIXES.some((p) => normalizedPath.startsWith(p))

  if (!isPublic) {
    const debug = process.env.NODE_ENV !== 'production'
    const legacyAtlasKey = String.fromCharCode(104, 114, 109, 115)
    const cookieNames = Array.from(new Set([
      ...getCandidateSessionCookieNames('targon'),
      ...getCandidateSessionCookieNames('atlas'),
      ...getCandidateSessionCookieNames(legacyAtlasKey),
    ]))
    const cookieHeader = request.headers.get('cookie')
    const sharedSecret = process.env.PORTAL_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET

    const decoded = await decodePortalSession({
      cookieHeader,
      cookieNames,
      secret: sharedSecret,
      debug,
    })

    const hasSession = !!decoded
    const atlasEntitlement = decoded
      ? getAppEntitlement(decoded.roles, 'atlas') ?? getAppEntitlement(decoded.roles, legacyAtlasKey)
      : undefined
    const hasAccess = hasSession && !!atlasEntitlement

    if (!hasAccess) {
      // For API routes, return 401/403 instead of redirect
      if (normalizedPath.startsWith('/api/')) {
        const errorMsg = hasSession ? 'No access to Atlas' : 'Authentication required'
        return NextResponse.json(
          { error: errorMsg },
          { status: hasSession ? 403 : 401 }
        )
      }

      // User has session but no Atlas access - redirect to no-access page
      if (hasSession && !atlasEntitlement) {
        const url = request.nextUrl.clone()
        url.pathname = basePath ? `${basePath}/no-access` : '/no-access'
        url.search = ''
        return NextResponse.redirect(url)
      }

      // No session at all
      const login = portalUrl('/login', request)
      if (debug) {
        console.log('[atlas middleware] missing session, redirecting to', login.toString())
      }
      const callbackOrigin = resolveAppOrigin(request)
      const callbackPathname = (() => {
        if (!basePath) return request.nextUrl.pathname
        if (request.nextUrl.pathname.startsWith(basePath)) return request.nextUrl.pathname
        return request.nextUrl.pathname === '/' ? basePath : `${basePath}${request.nextUrl.pathname}`
      })()
      const callbackUrl = new URL(
        callbackPathname + request.nextUrl.search + request.nextUrl.hash,
        callbackOrigin
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
