import { isValidTenantCode } from './constants'

export function isCrossTenantOverride(params: {
  tenantOverrideHeader: string | null
  effectiveTenant: string | null
  cookieTenant: string | null
}): boolean {
  if (params.tenantOverrideHeader !== '1') {
    return false
  }

  if (isValidTenantCode(params.cookieTenant) && isValidTenantCode(params.effectiveTenant)) {
    return params.cookieTenant !== params.effectiveTenant
  }

  return true
}
