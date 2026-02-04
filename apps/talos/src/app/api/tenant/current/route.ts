import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import {
  TENANT_COOKIE_NAME,
  TENANT_COOKIE_MAX_AGE,
  DEFAULT_TENANT,
  isValidTenantCode,
  getTenantConfig,
  getAllTenants,
  TENANT_CODES,
  TenantCode,
} from '@/lib/tenant/constants'
import { getTenantPrismaClient } from '@/lib/tenant/prisma-factory'

export const dynamic = 'force-dynamic'

/**
 * Check which tenants a user has access to by email
 * Queries each tenant database to see if user exists there
 */
async function getUserAccessibleTenants(email: string): Promise<TenantCode[]> {
  const accessibleTenants: TenantCode[] = []

  for (const tenantCode of TENANT_CODES) {
    try {
      const prisma = await getTenantPrismaClient(tenantCode)
      const user = await prisma.user.findFirst({
        where: { email, isActive: true },
        select: { id: true },
      })
      if (user) {
        accessibleTenants.push(tenantCode)
      }
    } catch (error) {
      // Database not configured or connection error - skip this tenant
      console.warn(`[tenant/current] Could not check tenant ${tenantCode}:`, error)
    }
  }

  return accessibleTenants
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

    // Get user's email from session to check which tenants they can access
    const userEmail = session.user?.email
    let accessibleCodes: TenantCode[] = []

    if (userEmail) {
      // Query all tenant databases to find where this user exists
      accessibleCodes = await getUserAccessibleTenants(userEmail)
    }

    const cookieTenantCode = isValidTenantCode(tenantCookie) ? tenantCookie : null
    const defaultTenant = DEFAULT_TENANT
    const resolvedTenantCode = (() => {
      if (accessibleCodes.length === 0) {
        return cookieTenantCode ?? defaultTenant
      }

      if (cookieTenantCode && accessibleCodes.includes(cookieTenantCode)) {
        return cookieTenantCode
      }

      if (accessibleCodes.includes(defaultTenant)) {
        return defaultTenant
      }

      return accessibleCodes[0]
    })()

    const current = getTenantConfig(resolvedTenantCode)

    // Map accessible tenants to response format
    const available = getAllTenants()
      .filter((t) => accessibleCodes.includes(t.code))
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
