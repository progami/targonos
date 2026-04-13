import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { Session } from 'next-auth'
import { auth } from '@/lib/auth'
import {
  TENANT_COOKIE_NAME,
  TENANT_COOKIE_MAX_AGE,
  DEFAULT_TENANT,
  isValidTenantCode,
  getTenantConfig,
  getAllTenants,
  TenantCode,
} from '@/lib/tenant/constants'
import { getPortalTenantMemberships } from '@/lib/tenant/access'

export const dynamic = 'force-dynamic'

export function resolveCurrentTenantSelection(
  session: Session,
  cookieTenantCode: TenantCode | null,
): { available: TenantCode[]; current: TenantCode } {
  const memberships = getPortalTenantMemberships(session as never)
  const rawActiveTenant = (session as any)?.activeTenant

  if (memberships.length === 0) {
    return {
      available: memberships,
      current: DEFAULT_TENANT,
    }
  }

  if (typeof rawActiveTenant === 'string') {
    const normalizedActiveTenant = rawActiveTenant.trim().toUpperCase()
    if (isValidTenantCode(normalizedActiveTenant)) {
      const tenantCode = normalizedActiveTenant as TenantCode
      if (memberships.includes(tenantCode)) {
        return {
          available: memberships,
          current: tenantCode,
        }
      }
    }
  }

  if (cookieTenantCode && memberships.includes(cookieTenantCode)) {
    return {
      available: memberships,
      current: cookieTenantCode,
    }
  }

  return {
    available: memberships,
    current: memberships[0],
  }
}

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
