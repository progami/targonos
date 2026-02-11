import { cookies, headers } from 'next/headers'
import { TENANT_COOKIE_NAME } from './constants'
import { isCrossTenantOverride } from './cross-tenant-utils'

export async function isCrossTenantOverrideRequest(): Promise<boolean> {
  const headersList = await headers()
  const cookieStore = await cookies()
  return isCrossTenantOverride({
    tenantOverrideHeader: headersList.get('x-tenant-override'),
    effectiveTenant: headersList.get('x-tenant'),
    cookieTenant: cookieStore.get(TENANT_COOKIE_NAME)?.value ?? null,
  })
}
