import { formatTruncatedDecimal } from '@/lib/number-precision'

export type DimensionTriplet = {
  side1Cm: number
  side2Cm: number
  side3Cm: number
}

function formatNumber(value: number, decimals: number): string {
  return formatTruncatedDecimal(value, decimals)
}

export function parseDimensionTriplet(value: string | null | undefined): DimensionTriplet | null {
  if (!value) return null
  const normalized = value.replace(/[×]/g, 'x')
  const matches = normalized.match(/(\d+(?:\.\d+)?)/g)
  if (!matches || matches.length < 3) return null

  const parsed = matches.slice(0, 3).map(match => Number(match))
  if (parsed.some(num => !Number.isFinite(num) || num <= 0)) return null

  const [side1Cm, side2Cm, side3Cm] = parsed
  return { side1Cm, side2Cm, side3Cm }
}

export function formatDimensionTripletCm(value: DimensionTriplet, decimals: number = 2): string {
  return `${formatNumber(value.side1Cm, decimals)}x${formatNumber(value.side2Cm, decimals)}x${formatNumber(
    value.side3Cm,
    decimals
  )}`
}

export function sortDimensionTripletCm(value: DimensionTriplet): DimensionTriplet {
  const sorted = [value.side1Cm, value.side2Cm, value.side3Cm].sort((a, b) => a - b)
  const side1Cm = sorted[0]
  const side2Cm = sorted[1]
  const side3Cm = sorted[2]
  return { side1Cm, side2Cm, side3Cm }
}

export function coerceFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  const fallback = Number((value as { toString?: () => string })?.toString?.() ?? NaN)
  return Number.isFinite(fallback) ? fallback : null
}

export function resolveDimensionTripletCm(options: {
  side1Cm?: unknown
  side2Cm?: unknown
  side3Cm?: unknown
  legacy?: string | null | undefined
}): DimensionTriplet | null {
  const side1Cm = coerceFiniteNumber(options.side1Cm)
  const side2Cm = coerceFiniteNumber(options.side2Cm)
  const side3Cm = coerceFiniteNumber(options.side3Cm)

  const anyNumeric = [side1Cm, side2Cm, side3Cm].some(value => value !== null)
  if (anyNumeric) {
    if (side1Cm === null || side2Cm === null || side3Cm === null) {
      return null
    }
    if (side1Cm <= 0 || side2Cm <= 0 || side3Cm <= 0) {
      return null
    }
    return { side1Cm, side2Cm, side3Cm }
  }

  return parseDimensionTriplet(options.legacy)
}
