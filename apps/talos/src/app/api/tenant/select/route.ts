import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import {
  TenantCode,
  TENANT_CODES,
  isValidTenantCode,
  TENANT_COOKIE_NAME,
  TENANT_COOKIE_MAX_AGE,
  getTenantConfig,
} from '@/lib/tenant/constants'
import { getTenantPrismaClient } from '@/lib/tenant/prisma-factory'

export const dynamic = 'force-dynamic'

async function userExistsInOtherTenant(email: string, tenantCode: TenantCode): Promise<boolean> {
  for (const otherTenantCode of TENANT_CODES) {
    if (otherTenantCode === tenantCode) continue
    const prisma = await getTenantPrismaClient(otherTenantCode)
    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true },
    })
    if (user) {
      return true
    }
  }

  return false
}

/**
 * Ensure an active user exists in the specified tenant database.
 * - If the user record exists but is inactive, returns false.
 * - If the user record does not exist, provisions a default staff user (only if
 *   the email is not already provisioned in a different tenant).
 */
async function ensureActiveUserInTenant(email: string, fullName: string, tenantCode: TenantCode): Promise<boolean> {
  const prisma = await getTenantPrismaClient(tenantCode)

  const existing = await prisma.user.findFirst({
    where: { email },
    select: { id: true, isActive: true },
  })

  if (existing) {
    return existing.isActive
  }

  if (await userExistsInOtherTenant(email, tenantCode)) {
    return false
  }

  await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
      role: 'staff',
      region: tenantCode,
      isActive: true,
      isDemo: false,
    },
    select: { id: true },
  })

  return true
}

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

    // Validate user has access by checking if they exist in the target tenant's database
    const userEmail = session.user?.email
    if (!userEmail) {
      return NextResponse.json(
        { error: 'User email not found in session' },
        { status: 400 }
      )
    }

    const normalizedEmail = userEmail.trim().toLowerCase()
    if (!normalizedEmail) {
      return NextResponse.json(
        { error: 'User email not found in session' },
        { status: 400 }
      )
    }

    const rawName = session.user?.name
    const fullName = typeof rawName === 'string' && rawName.trim()
      ? rawName.trim()
      : normalizedEmail

    const hasAccess = await ensureActiveUserInTenant(normalizedEmail, fullName, tenantCode)
    if (!hasAccess) {
      return NextResponse.json(
        { error: `Access denied: Your account is not authorized for the ${tenantCode} region` },
        { status: 403 }
      )
    }

    // Set tenant cookie
    const cookieStore = await cookies()
    cookieStore.set(TENANT_COOKIE_NAME, tenantCode, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: TENANT_COOKIE_MAX_AGE,
      path: '/',
    })

    const config = getTenantConfig(tenantCode)

    return NextResponse.json({
      success: true,
      tenant: {
        code: config.code,
        name: config.name,
        displayName: config.displayName,
      },
    })
  } catch (error) {
    console.error('[tenant/select] Error:', error)
    return NextResponse.json(
      { error: 'Failed to select tenant' },
      { status: 500 }
    )
  }
}
