import type { Session } from 'next-auth'

import { isSuperAdmin } from '@/lib/auth/super-admin'

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

export function getAuthorizedTenantCodesForSession(session: Session): TenantCode[] {
  const email = typeof session.user?.email === 'string'
    ? session.user.email.trim().toLowerCase()
    : ''

  if (!email) {
    return []
  }

  if (isSuperAdmin(email)) {
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
