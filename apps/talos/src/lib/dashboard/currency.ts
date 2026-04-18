import { getTenantConfig, isValidTenantCode } from '@/lib/tenant/constants'

export function formatDashboardCurrency(
  amount: number,
  tenantCode: string | null | undefined
): string {
  if (!isValidTenantCode(tenantCode)) {
    throw new Error(`Invalid tenant code for dashboard currency: ${tenantCode}`)
  }

  const currency = getTenantConfig(tenantCode).currency

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
