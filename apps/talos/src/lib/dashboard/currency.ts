import { getTenantConfig, isValidTenantCode } from '@/lib/tenant/constants'

export function formatCurrencyForCode(
  amount: number,
  currency: string,
  fractionDigits = 2
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount)
}

export function formatDashboardCurrency(
  amount: number,
  tenantCode: string | null | undefined
): string {
  if (!isValidTenantCode(tenantCode)) {
    throw new Error(`Invalid tenant code for dashboard currency: ${tenantCode}`)
  }

  const currency = getTenantConfig(tenantCode).currency

  return formatCurrencyForCode(amount, currency)
}
