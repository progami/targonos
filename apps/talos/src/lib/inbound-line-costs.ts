export const INBOUND_TOTAL_COST_DECIMALS = 2
export const INBOUND_UNIT_COST_DECIMALS = 4

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

export function normalizeInboundOrderTotalCost(value: number): number {
  return Number(Math.abs(value).toFixed(INBOUND_TOTAL_COST_DECIMALS))
}

export function normalizeInboundOrderUnitCost(value: number): number {
  return Number(Math.abs(value).toFixed(INBOUND_UNIT_COST_DECIMALS))
}

export function deriveInboundOrderUnitCost(
  totalCost: number | null,
  unitsOrdered: number
): number | null {
  if (totalCost === null) return null
  if (!Number.isFinite(totalCost)) return null
  if (!Number.isInteger(unitsOrdered) || unitsOrdered <= 0) return null
  return normalizeInboundOrderUnitCost(totalCost / unitsOrdered)
}

export function resolveInboundOrderUnitCost(input: {
  unitCost: unknown
  totalCost: unknown
  unitsOrdered: number
}): number | null {
  const totalCost = toFiniteNumber(input.totalCost)
  if (totalCost !== null && Number.isInteger(input.unitsOrdered) && input.unitsOrdered > 0) {
    return deriveInboundOrderUnitCost(normalizeInboundOrderTotalCost(totalCost), input.unitsOrdered)
  }
  return toInboundOrderUnitCostNumberOrNull(input.unitCost)
}

export function toInboundOrderTotalCostNumberOrNull(value: unknown): number | null {
  const parsed = toFiniteNumber(value)
  if (parsed === null) return null
  return normalizeInboundOrderTotalCost(parsed)
}

export function toInboundOrderUnitCostNumberOrNull(value: unknown): number | null {
  const parsed = toFiniteNumber(value)
  if (parsed === null) return null
  return normalizeInboundOrderUnitCost(parsed)
}

export function formatInboundOrderUnitCost(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: INBOUND_UNIT_COST_DECIMALS,
  })
}
