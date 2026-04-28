import { Session } from 'next-auth'
import { headers } from 'next/headers'
import { getCurrentTenantCode } from './server'
import { TenantCode } from './constants'
import { getAuthorizedTenantCodesForSession } from './session'

/**
 * Error thrown when the current tenant is outside the portal-authorized tenant set.
 */
export class TenantAccessError extends Error {
  constructor(
    public readonly allowedTenants: TenantCode[],
    public readonly currentTenant: TenantCode
  ) {
    super(
      `Access denied: Tenant ${currentTenant} is not included in portal tenant access ${allowedTenants.join(', ')}`
    )
    this.name = 'TenantAccessError'
  }
}

export function hasTenantAccessForCode(session: Session, currentTenant: TenantCode): boolean {
  return getAuthorizedTenantCodesForSession(session).includes(currentTenant)
}

/**
 * Validate that the current tenant is included in the portal-authorized tenant set.
 * Throws TenantAccessError if there's a mismatch.
 *
 * When the client explicitly sends an x-tenant header (e.g. for cross-region
 * inbound), the middleware sets x-tenant-override=1. In that case
 * the tenant-membership check is skipped because the request already carries
 * an explicit tenant override.
 */
export async function requireTenantAccess(session: Session): Promise<void> {
  const headersList = await headers()
  if (headersList.get('x-tenant-override') === '1') {
    return
  }

  const currentTenant = await getCurrentTenantCode(session)
  if (!hasTenantAccessForCode(session, currentTenant)) {
    throw new TenantAccessError(getAuthorizedTenantCodesForSession(session), currentTenant)
  }
}

/**
 * Check if user has access to the current tenant (non-throwing version)
 */
export async function hasTenantAccess(session: Session): Promise<boolean> {
  try {
    await requireTenantAccess(session)
    return true
  } catch {
    return false
  }
}

/**
 * Higher-order function that wraps a handler with tenant access validation
 */
export async function withTenantGuard<T>(
  session: Session,
  handler: () => Promise<T>
): Promise<T> {
  await requireTenantAccess(session)
  return handler()
}
