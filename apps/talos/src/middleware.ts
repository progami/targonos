import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { applyDevAuthDefaults, getCandidateSessionCookieNames, requireAppEntry } from '@targon/auth'

import { getBasePath, withoutBasePath } from '@/lib/utils/base-path'
import { portalUrl } from '@/lib/portal'
import { TENANT_COOKIE_NAME, isValidTenantCode } from '@/lib/tenant/constants'

applyDevAuthDefaults({
  // Align with portal default secret in local dev when ALLOW_DEV_AUTH_DEFAULTS=true.
  appId: 'targon',
})

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const basePath = getBasePath()
  if (basePath) {
    const doubleBasePrefix = `${basePath}${basePath}`
    const url = new URL(request.url)
    const rawPathname = url.pathname
    if (rawPathname === doubleBasePrefix || rawPathname.startsWith(`${doubleBasePrefix}/`)) {
      url.pathname = rawPathname.replace(doubleBasePrefix, basePath)
      return NextResponse.redirect(url)
    }
  }

  const normalizedPath = withoutBasePath(pathname)

  // Redirect /operations to /operations/inventory (base-path aware)
  if (normalizedPath === '/operations') {
    const url = request.nextUrl.clone()
    url.pathname = '/operations/inventory'
    return NextResponse.redirect(url)
  }

  const publicRoutes = [
    '/',
    '/auth/login',
    '/auth/error',
    '/no-access',
    '/api/health',
    '/api/logs',
  ]

  const publicPrefixes = [
    '/api/auth/',
    '/api/tenant/',
  ]

  const isPublicRoute =
    publicRoutes.includes(normalizedPath) ||
    publicPrefixes.some((prefix) => normalizedPath.startsWith(prefix))

  if (
    isPublicRoute ||
    normalizedPath.startsWith('/_next') ||
    normalizedPath === '/favicon.ico' ||
    normalizedPath === '/favicon.svg'
  ) {
    return NextResponse.next()
  }

  const cookieNames = Array.from(new Set([
    ...getCandidateSessionCookieNames('targon'),
    ...getCandidateSessionCookieNames('talos'),
  ]))

  const decision = await requireAppEntry({
    request,
    appId: 'talos',
    lifecycle: 'active',
    entryPolicy: 'role_gated',
    cookieNames,
  })

  if (!decision.allowed) {
    console.info('[authz][talos] denied', {
      path: normalizedPath,
      status: decision.status,
      reason: decision.reason,
    })

    if (normalizedPath.startsWith('/api/')) {
      const status = decision.status === 'unauthenticated' ? 401 : 403
      const errorMsg = decision.status === 'unauthenticated'
        ? 'Authentication required'
        : 'No access to Talos'

      return NextResponse.json({ error: errorMsg, reason: decision.reason }, { status })
    }

    if (decision.status === 'forbidden') {
      const url = request.nextUrl.clone()
      url.pathname = '/no-access'
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
    const appBasePath = normalizedBasePath.endsWith('/')
      ? normalizedBasePath.slice(0, -1)
      : normalizedBasePath
    const callbackPath = appBasePath && !pathname.startsWith(appBasePath)
      ? `${appBasePath}${pathname}`
      : pathname
    const callbackUrl = `${forwardedProto}://${forwardedHost}${callbackPath}${request.nextUrl.search}`

    const redirect = portalUrl('/login', request)
    redirect.searchParams.set('callbackUrl', callbackUrl)
    return NextResponse.redirect(redirect)
  }

  const tenantCookie = request.cookies.get(TENANT_COOKIE_NAME)?.value
  const hasTenant = isValidTenantCode(tenantCookie)

  if (!hasTenant && !normalizedPath.startsWith('/api/')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  const requestTenantOverride = request.headers.get('x-tenant')
  const effectiveTenant = isValidTenantCode(requestTenantOverride)
    ? requestTenantOverride
    : tenantCookie
  const response = NextResponse.next()
  if (isValidTenantCode(effectiveTenant)) {
    response.headers.set('x-tenant', effectiveTenant)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
