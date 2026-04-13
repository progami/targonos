import type { Session } from 'next-auth'

import { DEFAULT_TENANT, TENANT_CODES, isValidTenantCode, type TenantCode } from './constants'

function normalizeTenantCode(value: unknown): TenantCode | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim().toUpperCase()
  if (!isValidTenantCode(normalizedValue)) {
    return null
  }

  return normalizedValue as TenantCode
}

export function getSessionActiveTenant(session: unknown): TenantCode | null {
  if (!session || typeof session !== 'object') {
    return null
  }

  return normalizeTenantCode((session as { activeTenant?: unknown }).activeTenant)
}

export function getPortalTenantMemberships(session: Session): TenantCode[] {
  const rawMemberships = (session as { authz?: { apps?: { talos?: { tenantMemberships?: unknown } } } })?.authz?.apps?.talos?.tenantMemberships
  if (!Array.isArray(rawMemberships)) {
    return []
  }

  const seen = new Set<TenantCode>()
  const memberships: TenantCode[] = []

  for (const rawMembership of rawMemberships) {
    const tenantCode = normalizeTenantCode(rawMembership)
    if (!tenantCode) {
      continue
    }

    if (seen.has(tenantCode)) {
      continue
    }

    seen.add(tenantCode)
    memberships.push(tenantCode)
  }

  return memberships
}

export function getPortalGlobalRoles(session: unknown): string[] {
  if (!session || typeof session !== 'object') {
    return []
  }

  const rawGlobalRoles = (() => {
    const topLevelRoles = (session as { globalRoles?: unknown }).globalRoles
    if (Array.isArray(topLevelRoles)) {
      return topLevelRoles
    }

    const authzRoles = (session as { authz?: { globalRoles?: unknown } }).authz?.globalRoles
    if (Array.isArray(authzRoles)) {
      return authzRoles
    }

    return []
  })()

  if (!Array.isArray(rawGlobalRoles)) {
    return []
  }

  const seen = new Set<string>()
  const roles: string[] = []

  for (const rawRole of rawGlobalRoles) {
    if (typeof rawRole !== 'string') {
      continue
    }

    const normalizedRole = rawRole.trim().toLowerCase()
    if (!normalizedRole) {
      continue
    }

    if (seen.has(normalizedRole)) {
      continue
    }

    seen.add(normalizedRole)
    roles.push(normalizedRole)
  }

  return roles
}

export function isPortalPlatformAdmin(session: unknown): boolean {
  return getPortalGlobalRoles(session).includes('platform_admin')
}

export function getAuthorizedTenantCodesForSession(session: Session): TenantCode[] {
  if (isPortalPlatformAdmin(session)) {
    return TENANT_CODES
  }

  return getPortalTenantMemberships(session)
}

export function isTenantAllowedForSession(session: Session, tenantCode: TenantCode): boolean {
  return getAuthorizedTenantCodesForSession(session).includes(tenantCode)
}

export function resolveTenantStateFromPortalSession(session: Session): {
  available: TenantCode[]
  current: TenantCode | null
} {
  const available = getAuthorizedTenantCodesForSession(session)
  const activeTenant = getSessionActiveTenant(session)
  if (activeTenant && available.includes(activeTenant)) {
    return {
      available,
      current: activeTenant,
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

export function resolveTenantCodeFromState(params: {
  headerTenant: string | null
  sessionActiveTenant: unknown
  cookieTenant: string | null
}): TenantCode {
  const headerTenant = normalizeTenantCode(params.headerTenant)
  if (headerTenant) {
    return headerTenant
  }

  const sessionActiveTenant = normalizeTenantCode(params.sessionActiveTenant)
  if (sessionActiveTenant) {
    return sessionActiveTenant
  }

  const cookieTenant = normalizeTenantCode(params.cookieTenant)
  if (cookieTenant) {
    return cookieTenant
  }

  return DEFAULT_TENANT
}
