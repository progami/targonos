import { Session } from 'next-auth'
import { headers } from 'next/headers'
import { getCurrentTenantCode } from './server'
import { TenantCode } from './constants'

/**
 * Error thrown when user's region doesn't match the current tenant
 */
export class TenantAccessError extends Error {
  constructor(
    public readonly userRegion: TenantCode | undefined,
    public readonly currentTenant: TenantCode
  ) {
    super(
      `Access denied: User region ${userRegion ?? 'undefined'} does not match tenant ${currentTenant}`
    )
    this.name = 'TenantAccessError'
  }
}

/**
 * Validate that the user's region matches the current tenant.
 * Throws TenantAccessError if there's a mismatch.
 *
 * When the client explicitly sends an x-tenant header (e.g. for cross-region
 * purchase orders), the middleware sets x-tenant-override=1. In that case
 * the region check is skipped — the user intentionally chose the tenant.
 */
export async function requireTenantAccess(session: Session): Promise<void> {
  const headersList = await headers()
  if (headersList.get('x-tenant-override') === '1') {
    return
  }

  const currentTenant = await getCurrentTenantCode()
  const userRegion = session.user?.region

  if (userRegion !== currentTenant) {
    throw new TenantAccessError(userRegion, currentTenant)
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
