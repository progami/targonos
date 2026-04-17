import type { Session } from 'next-auth'
import {
  DEFAULT_TENANT,
  type TenantCode,
} from '@/lib/tenant/constants'
import {
  getAuthorizedTenantCodesForSession,
  getSessionActiveTenant,
} from '@/lib/tenant/session'

export function resolveCurrentTenantSelection(
  session: Session,
  cookieTenantCode: TenantCode | null,
): { available: TenantCode[]; current: TenantCode } {
  const memberships = getAuthorizedTenantCodesForSession(session)
  const activeTenant = getSessionActiveTenant(session)

  if (memberships.length === 0) {
    return {
      available: memberships,
      current: DEFAULT_TENANT,
    }
  }

  if (activeTenant && memberships.includes(activeTenant)) {
    return {
      available: memberships,
      current: activeTenant,
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
