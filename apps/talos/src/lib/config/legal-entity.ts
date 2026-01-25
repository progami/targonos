import type { TenantCode } from '@/lib/tenant/constants'

export const BUYER_LEGAL_ENTITY = {
  name: 'Targon LLC',
  address: '1960 Kimball Ave, Suite 316, Manhattan, Kansas, 66502',
  phone: '+1 785-370-3532',
} as const

const VAT_BY_TENANT: Partial<Record<TenantCode, string>> = {
  UK: 'GB501300960',
}

export function getBuyerVatNumber(tenantCode: TenantCode): string | null {
  return VAT_BY_TENANT[tenantCode] ?? null
}
