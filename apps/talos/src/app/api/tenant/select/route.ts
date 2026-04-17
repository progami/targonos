import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import {
  type TenantCode,
  isValidTenantCode,
  TENANT_COOKIE_NAME,
  TENANT_COOKIE_MAX_AGE,
  getTenantConfig,
} from '@/lib/tenant/constants'
import { isTenantAllowedForSession } from '@/lib/tenant/session'
import { buildPortalActiveTenantRequest } from './portal-request'

export const dynamic = 'force-dynamic'

/**
 * POST /api/tenant/select
 * Set the current tenant for the user session
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { tenant } = body as { tenant: string }

    // Validate tenant code
    if (!isValidTenantCode(tenant)) {
      return NextResponse.json(
        { error: `Invalid tenant code: ${tenant}` },
        { status: 400 }
      )
    }

    const tenantCode = tenant as TenantCode

    if (!isTenantAllowedForSession(session as never, tenantCode)) {
      return NextResponse.json(
        { error: `Access denied: Your account is not authorized for the ${tenantCode} region` },
        { status: 403 }
      )
    }

    const portalRequest = buildPortalActiveTenantRequest(request, tenantCode)
    const portalResponse = await fetch(portalRequest.url, portalRequest.init)
    if (!portalResponse.ok) {
      return NextResponse.json({ error: 'Failed to persist active tenant' }, { status: 502 })
    }

    const cookieStore = await cookies()
    cookieStore.set(TENANT_COOKIE_NAME, tenantCode, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: TENANT_COOKIE_MAX_AGE,
      path: '/',
    })

    const config = getTenantConfig(tenantCode)

    const response = NextResponse.json({
      success: true,
      tenant: {
        code: config.code,
        name: config.name,
        displayName: config.displayName,
      },
    })

    for (const setCookieHeader of portalResponse.headers.getSetCookie()) {
      response.headers.append('set-cookie', setCookieHeader)
    }

    return response
  } catch (error) {
    console.error('[tenant/select] Error:', error)
    return NextResponse.json(
      { error: 'Failed to select tenant' },
      { status: 500 }
    )
  }
}
