import type { TenantCode } from '@/lib/tenant/constants'
import { isWorktreeDevAuthEnabled } from '@targon/auth'
import { portalUrl } from '@/lib/portal'

export function shouldPersistPortalActiveTenant(): boolean {
  return !isWorktreeDevAuthEnabled()
}

export function buildPortalActiveTenantRequest(
  request: Request,
  tenantCode: TenantCode,
): {
  url: URL
  init: RequestInit
} {
  return {
    url: portalUrl('/api/v1/session/active-tenant', request),
    init: {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: request.headers.get('cookie') ?? '',
      },
      body: JSON.stringify({ appId: 'talos', tenantCode }),
    },
  }
}
