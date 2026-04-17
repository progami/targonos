import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import {
  TENANT_COOKIE_NAME,
  TENANT_COOKIE_MAX_AGE,
  isValidTenantCode,
  getTenantConfig,
  getAllTenants,
} from '@/lib/tenant/constants'
import { resolveCurrentTenantSelection } from './selection'

export const dynamic = 'force-dynamic'

/**
 * GET /api/tenant/current
 * Get the current tenant and available tenants for the user
 */
export async function GET() {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get tenant from cookie
    const cookieStore = await cookies()
    const tenantCookie = cookieStore.get(TENANT_COOKIE_NAME)?.value
    const cookieTenantCode = isValidTenantCode(tenantCookie) ? tenantCookie : null
    const tenantSelection = resolveCurrentTenantSelection(session, cookieTenantCode)
    const resolvedTenantCode = tenantSelection.current

    const current = getTenantConfig(resolvedTenantCode)

    // Map accessible tenants to response format
    const available = getAllTenants()
      .filter((t) => tenantSelection.available.includes(t.code))
      .map((t) => ({
        code: t.code,
        name: t.name,
        displayName: t.displayName,
        flag: t.flag,
      }))

    const response = NextResponse.json({
      current: {
        code: current.code,
        name: current.name,
        displayName: current.displayName,
        flag: current.flag,
        timezone: current.timezone,
        currency: current.currency,
      },
      available,
    })

    if (resolvedTenantCode !== cookieTenantCode) {
      response.cookies.set(TENANT_COOKIE_NAME, resolvedTenantCode, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: TENANT_COOKIE_MAX_AGE,
        path: '/',
      })
    }

    return response
  } catch (error) {
    console.error('[tenant/current] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get current tenant' },
      { status: 500 }
    )
  }
}
