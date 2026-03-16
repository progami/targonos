export const PO_COST_CURRENCIES = ['USD', 'GBP'] as const

export type PoCostCurrency = (typeof PO_COST_CURRENCIES)[number]
export const PURCHASE_ORDER_BASE_CURRENCY: PoCostCurrency = 'USD'

export function normalizePoCostCurrency(value: unknown): PoCostCurrency | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim().toUpperCase()
  if (normalized === 'USD') return 'USD'
  if (normalized === 'GBP') return 'GBP'

  return null
}
