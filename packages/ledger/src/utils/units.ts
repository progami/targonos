/**
 * Utility helpers shared across ledger calculations
 */

export function calculateUnits(
  cartons: number,
  transactionUnitsPerCarton?: number | null,
  skuUnitsPerCarton?: number | null
): number {
  const unitsPerCarton = transactionUnitsPerCarton ?? skuUnitsPerCarton ?? 1
  return cartons * unitsPerCarton
}

export function calculatePallets(cartons: number, cartonsPerPallet?: number | null): number {
  if (!cartonsPerPallet || cartonsPerPallet <= 0 || cartons <= 0) {
    return 0
  }
  return Math.ceil(cartons / cartonsPerPallet)
}

export function parseNumeric(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
