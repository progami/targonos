import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { applyDevAuthDefaults, decodePortalSession, getAppEntitlement, getCandidateSessionCookieNames, type PortalJwtPayload } from '@targon/auth'
import { withBasePath, withoutBasePath } from '@/lib/utils/base-path'
import { portalUrl } from '@/lib/portal'
import { TENANT_COOKIE_NAME, isValidTenantCode } from '@/lib/tenant/constants'

applyDevAuthDefaults({
  // Align with portal default secret in local dev when ALLOW_DEV_AUTH_DEFAULTS=true.
  appId: 'targon',
})

// Session cache to avoid repeated JWT decoding on every request
// Key: hash of session token, Value: { decoded payload, expiry timestamp }
const SESSION_CACHE_TTL_MS = 60_000 // 1 minute cache
const sessionCache = new Map<string, { payload: PortalJwtPayload | null; expiresAt: number }>()

function getSessionCacheKey(cookieHeader: string | null): string {
  if (!cookieHeader) return ''
  // Extract session token value to use as cache key (first 64 chars for safety)
  const sessionTokenMatch = cookieHeader.match(/(?:__Secure-)?(?:targon\.)?next-auth\.session-token=([^;]+)/)
  return sessionTokenMatch?.[1]?.slice(0, 64) ?? ''
}

async function getCachedSession(
  cookieHeader: string | null,
  cookieNames: string[],
  secret: string,
  debug: boolean
): Promise<PortalJwtPayload | null> {
  const cacheKey = getSessionCacheKey(cookieHeader)
  if (!cacheKey) {
    return decodePortalSession({ cookieHeader, cookieNames, secret, debug })
  }

  const cached = sessionCache.get(cacheKey)
  const now = Date.now()

  if (cached && cached.expiresAt > now) {
    return cached.payload
  }

  // Decode and cache
  const decoded = await decodePortalSession({ cookieHeader, cookieNames, secret, debug })
  sessionCache.set(cacheKey, { payload: decoded, expiresAt: now + SESSION_CACHE_TTL_MS })

  // Prune old entries periodically (keep cache size bounded)
  if (sessionCache.size > 1000) {
    for (const [key, value] of sessionCache) {
      if (value.expiresAt < now) {
        sessionCache.delete(key)
      }
    }
  }

  return decoded
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const normalizedPath = withoutBasePath(pathname)

  // Redirect /operations to /operations/inventory (base-path aware)
  if (normalizedPath === '/operations') {
    const url = request.nextUrl.clone()
    url.pathname = withBasePath('/operations/inventory')
    return NextResponse.redirect(url)
  }

  // Public routes that don't require authentication
  // Use exact matches or proper prefix matching to prevent auth bypass
  const publicRoutes = [
    '/',
    '/auth/login',
    '/auth/error',
    '/no-access',
    '/api/health',
    '/api/logs',
  ]

  // Routes that should be prefix-matched
  const publicPrefixes = [
    '/api/auth/', // NextAuth internal routes
    '/api/tenant/', // Tenant selection routes
  ]

  // Check if the route is public using exact match
  const isExactPublicRoute = publicRoutes.includes(normalizedPath)

  // Check if the route matches a public prefix
  const isPublicPrefix = publicPrefixes.some((prefix) => normalizedPath.startsWith(prefix))

  // Combine both checks
  const isPublicRoute = isExactPublicRoute || isPublicPrefix

  // Skip auth check for public routes and static assets
  if (
    isPublicRoute ||
    normalizedPath.startsWith('/_next') ||
    normalizedPath === '/favicon.ico' ||
    normalizedPath === '/favicon.svg'
  ) {
    return NextResponse.next()
  }

  // Check for session and app entitlement
  const cookieNames = Array.from(
    new Set([
      ...getCandidateSessionCookieNames('targon'),
      ...getCandidateSessionCookieNames('talos'),
    ])
  )
	  const sharedSecret = process.env.PORTAL_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
	  if (!sharedSecret) {
	    console.error('[talos middleware] Missing PORTAL_AUTH_SECRET/NEXTAUTH_SECRET')
	    return normalizedPath.startsWith('/api/')
	      ? NextResponse.json({ error: 'Authentication misconfigured' }, { status: 500 })
	      : new NextResponse('Authentication misconfigured', { status: 500 })
	  }

  const authDebugFlag =
    typeof process.env.NEXTAUTH_DEBUG === 'string' &&
    ['1', 'true', 'yes', 'on'].includes(process.env.NEXTAUTH_DEBUG.toLowerCase())

  const cookieHeader = request.headers.get('cookie')
  const decoded = await getCachedSession(cookieHeader, cookieNames, sharedSecret, authDebugFlag)

  const hasSession = !!decoded
  const talosEntitlement = decoded ? getAppEntitlement(decoded.roles, 'talos') : undefined
  const hasAccess = hasSession && !!talosEntitlement

  if (!hasAccess) {
    if (normalizedPath.startsWith('/api/')) {
      const errorMsg = hasSession ? 'No access to Talos' : 'Authentication required'
      return NextResponse.json({ error: errorMsg }, { status: hasSession ? 403 : 401 })
    }

    if (hasSession && !talosEntitlement) {
      const url = request.nextUrl.clone()
      url.pathname = withBasePath('/no-access')
      url.search = ''
      return NextResponse.redirect(url)
    }

    const forwardedProtoHeader = request.headers.get('x-forwarded-proto')
    const forwardedProto = ((forwardedProtoHeader || request.nextUrl.protocol || 'http')
      .split(',')[0]
      .trim()
      .replace(/:$/, '')) || 'http'

    const forwardedHostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host')
    const forwardedHost = (forwardedHostHeader ? forwardedHostHeader.split(',')[0]?.trim() : '') || request.nextUrl.host

    const rawBasePath = (process.env.BASE_PATH || '').trim()
    const normalizedBasePath = rawBasePath && rawBasePath !== '/'
      ? (rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`)
      : ''
    const basePath = normalizedBasePath.endsWith('/')
      ? normalizedBasePath.slice(0, -1)
      : normalizedBasePath
    const callbackPath = basePath && !pathname.startsWith(basePath)
      ? `${basePath}${pathname}`
      : pathname
    const callbackUrl = `${forwardedProto}://${forwardedHost}${callbackPath}${request.nextUrl.search}`

    const redirect = portalUrl('/login', request)
    redirect.searchParams.set('callbackUrl', callbackUrl)
    return NextResponse.redirect(redirect)
  }

  // Tenant handling for authenticated users
  const tenantCookie = request.cookies.get(TENANT_COOKIE_NAME)?.value
  const hasTenant = isValidTenantCode(tenantCookie)

  // If no tenant selected and not on world map, redirect to world map
  // Skip this for API routes - they should handle missing tenant themselves
  if (!hasTenant && !normalizedPath.startsWith('/api/')) {
    const url = request.nextUrl.clone()
    url.pathname = withBasePath('/')
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Inject tenant into headers for API routes
  const response = NextResponse.next()
  if (hasTenant) {
    response.headers.set('x-tenant', tenantCookie)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
