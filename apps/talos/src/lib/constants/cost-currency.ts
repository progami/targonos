export const INBOUND_COST_CURRENCIES = ['USD', 'GBP'] as const

export type InboundCostCurrency = (typeof INBOUND_COST_CURRENCIES)[number]
export const INBOUND_BASE_CURRENCY: InboundCostCurrency = 'USD'

export function normalizeInboundCostCurrency(value: unknown): InboundCostCurrency | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim().toUpperCase()
  if (normalized === 'USD') return 'USD'
  if (normalized === 'GBP') return 'GBP'

  return null
}
