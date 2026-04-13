import type { Session } from 'next-auth'

import { TENANT_CODES, isValidTenantCode, type TenantCode } from './constants'
import { getTenantPrismaClient } from './prisma-factory'

export async function getAccessibleTenantCodesForEmail(email: string): Promise<TenantCode[]> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    return []
  }

  const accessibleTenants: TenantCode[] = []

  for (const tenantCode of TENANT_CODES) {
    try {
      const prisma = await getTenantPrismaClient(tenantCode)
      const user = await prisma.user.findFirst({
        where: { email: normalizedEmail, isActive: true },
        select: { id: true },
      })

      if (user) {
        accessibleTenants.push(tenantCode)
      }
    } catch (error) {
      console.warn(`[tenant/access] Could not check tenant ${tenantCode}:`, error)
    }
  }

  return accessibleTenants
}

export async function getPrismaForTenant(tenantCode: TenantCode) {
  return getTenantPrismaClient(tenantCode)
}

export function getPortalTenantMemberships(session: Session): TenantCode[] {
  const rawMemberships = (session as any)?.authz?.apps?.talos?.tenantMemberships
  if (!Array.isArray(rawMemberships)) {
    return []
  }

  const seen = new Set<TenantCode>()
  const memberships: TenantCode[] = []

  for (const rawMembership of rawMemberships) {
    if (typeof rawMembership !== 'string') {
      continue
    }

    const normalizedMembership = rawMembership.trim().toUpperCase()
    if (!isValidTenantCode(normalizedMembership)) {
      continue
    }

    const tenantCode = normalizedMembership as TenantCode
    if (seen.has(tenantCode)) {
      continue
    }

    seen.add(tenantCode)
    memberships.push(tenantCode)
  }

  return memberships
}

export function isTenantAllowedForSession(session: Session, tenantCode: TenantCode): boolean {
  return getPortalTenantMemberships(session).includes(tenantCode)
}

export function resolveTenantStateFromPortalSession(session: Session): {
  available: TenantCode[]
  current: TenantCode | null
} {
  const available = getPortalTenantMemberships(session)
  const rawActiveTenant = (session as any)?.activeTenant

  if (typeof rawActiveTenant === 'string') {
    const normalizedActiveTenant = rawActiveTenant.trim().toUpperCase()
    if (isValidTenantCode(normalizedActiveTenant)) {
      const tenantCode = normalizedActiveTenant as TenantCode
      if (available.includes(tenantCode)) {
        return {
          available,
          current: tenantCode,
        }
      }
    }
  }

  if (available.length === 0) {
    return {
      available,
      current: null,
    }
  }

  return {
    available,
    current: available[0],
  }
}
