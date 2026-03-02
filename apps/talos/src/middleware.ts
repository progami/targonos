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

function resolveAppOrigin(request: NextRequest): string {
  const candidates: Array<string | undefined> = []

  const forwardedHostRaw = request.headers.get('x-forwarded-host')
  const forwardedHost = forwardedHostRaw ? forwardedHostRaw.split(',')[0].trim() : ''
  const forwardedProtoRaw = request.headers.get('x-forwarded-proto')
  const forwardedProto = forwardedProtoRaw ? forwardedProtoRaw.split(',')[0].trim() : 'https'

  if (forwardedHost) {
    candidates.push(`${forwardedProto}://${forwardedHost}`)
  }

  candidates.push(request.nextUrl.origin)
  candidates.push(request.url)
  candidates.push(process.env.NEXT_PUBLIC_APP_URL)
  candidates.push(process.env.BASE_URL)
  candidates.push(process.env.NEXTAUTH_URL)

  for (const candidate of candidates) {
    if (!candidate) continue
    const trimmed = candidate.trim()
    if (!trimmed) continue
    try {
      return new URL(trimmed).origin
    } catch {
      continue
    }
  }

  throw new Error('Unable to resolve application origin. Set NEXT_PUBLIC_APP_URL, BASE_URL, or NEXTAUTH_URL.')
}

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

  const cookieNames = Array.from(new Set([
    ...getCandidateSessionCookieNames('targon'),
    ...getCandidateSessionCookieNames('talos'),
  ]))

  if (!allowDevAuthBypass) {
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

      const origin = resolveAppOrigin(request)

      const rawBasePath = (process.env.BASE_PATH ?? '').trim()
      const normalizedBasePath = rawBasePath && rawBasePath !== '/'
        ? (rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`)
        : ''
      const appBasePath = normalizedBasePath.endsWith('/')
        ? normalizedBasePath.slice(0, -1)
        : normalizedBasePath
      const callbackPath = appBasePath && !pathname.startsWith(appBasePath)
        ? `${appBasePath}${pathname}`
        : pathname
      const callbackUrl = new URL(callbackPath + request.nextUrl.search, origin).toString()

      const redirect = portalUrl('/login', request)
      redirect.searchParams.set('callbackUrl', callbackUrl)
      return NextResponse.redirect(redirect)
    }
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
  const requestHeaders = new Headers(request.headers)
  if (isValidTenantCode(effectiveTenant)) {
    requestHeaders.set('x-tenant', effectiveTenant)
  } else {
    requestHeaders.delete('x-tenant')
  }
  if (isValidTenantCode(requestTenantOverride)) {
    requestHeaders.set('x-tenant-override', '1')
  } else {
    requestHeaders.delete('x-tenant-override')
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
