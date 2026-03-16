export const PURCHASE_ORDER_TOTAL_COST_DECIMALS = 2
export const PURCHASE_ORDER_UNIT_COST_DECIMALS = 4

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof value === 'object') {
    const maybe = value as { toNumber?: () => number; toString?: () => string }
    if (typeof maybe.toNumber === 'function') {
      const parsed = maybe.toNumber()
      return Number.isFinite(parsed) ? parsed : null
    }
    if (typeof maybe.toString === 'function') {
      const parsed = Number(maybe.toString())
      return Number.isFinite(parsed) ? parsed : null
    }
  }
  return null
}

export function normalizePurchaseOrderTotalCost(value: number): number {
  return Number(Math.abs(value).toFixed(PURCHASE_ORDER_TOTAL_COST_DECIMALS))
}

export function normalizePurchaseOrderUnitCost(value: number): number {
  return Number(Math.abs(value).toFixed(PURCHASE_ORDER_UNIT_COST_DECIMALS))
}

export function derivePurchaseOrderUnitCost(
  totalCost: number | null,
  unitsOrdered: number
): number | null {
  if (totalCost === null) return null
  if (!Number.isFinite(totalCost)) return null
  if (!Number.isInteger(unitsOrdered) || unitsOrdered <= 0) return null
  return normalizePurchaseOrderUnitCost(totalCost / unitsOrdered)
}

export function resolvePurchaseOrderUnitCost(input: {
  unitCost: unknown
  totalCost: unknown
  unitsOrdered: number
}): number | null {
  const totalCost = toFiniteNumber(input.totalCost)
  if (totalCost !== null && Number.isInteger(input.unitsOrdered) && input.unitsOrdered > 0) {
    return derivePurchaseOrderUnitCost(normalizePurchaseOrderTotalCost(totalCost), input.unitsOrdered)
  }
  return toPurchaseOrderUnitCostNumberOrNull(input.unitCost)
}

export function toPurchaseOrderTotalCostNumberOrNull(value: unknown): number | null {
  const parsed = toFiniteNumber(value)
  if (parsed === null) return null
  return normalizePurchaseOrderTotalCost(parsed)
}

export function toPurchaseOrderUnitCostNumberOrNull(value: unknown): number | null {
  const parsed = toFiniteNumber(value)
  if (parsed === null) return null
  return normalizePurchaseOrderUnitCost(parsed)
}

export function formatPurchaseOrderUnitCost(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: PURCHASE_ORDER_UNIT_COST_DECIMALS,
  })
}
