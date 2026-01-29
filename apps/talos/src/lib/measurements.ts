import type { DimensionTriplet } from '@/lib/sku-dimensions'
import type { TenantCode } from '@/lib/tenant/constants'

export type UnitSystem = 'metric' | 'imperial'

export const CM_PER_INCH = 2.54
export const LB_PER_KG = 2.2046226218

export function getDefaultUnitSystem(tenantCode: TenantCode): UnitSystem {
  if (tenantCode === 'UK') return 'metric'
  return 'imperial'
}

export function getLengthUnitLabel(unitSystem: UnitSystem): 'cm' | 'in' {
  if (unitSystem === 'imperial') return 'in'
  return 'cm'
}

export function getWeightUnitLabel(unitSystem: UnitSystem): 'kg' | 'lb' {
  if (unitSystem === 'imperial') return 'lb'
  return 'kg'
}

function stripTrailingZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value
}

function formatNumber(value: number, decimals: number): string {
  return stripTrailingZeros(value.toFixed(decimals))
}

export function convertLengthFromCm(valueCm: number, unitSystem: UnitSystem): number {
  if (unitSystem === 'imperial') return valueCm / CM_PER_INCH
  return valueCm
}

export function convertLengthToCm(value: number, unitSystem: UnitSystem): number {
  if (unitSystem === 'imperial') return value * CM_PER_INCH
  return value
}

export function convertWeightFromKg(valueKg: number, unitSystem: UnitSystem): number {
  if (unitSystem === 'imperial') return valueKg * LB_PER_KG
  return valueKg
}

export function convertWeightToKg(value: number, unitSystem: UnitSystem): number {
  if (unitSystem === 'imperial') return value / LB_PER_KG
  return value
}

export function formatDimensionTripletFromCm(
  triplet: DimensionTriplet,
  unitSystem: UnitSystem,
  decimals: number = 2
): string {
  const side1 = convertLengthFromCm(triplet.side1Cm, unitSystem)
  const side2 = convertLengthFromCm(triplet.side2Cm, unitSystem)
  const side3 = convertLengthFromCm(triplet.side3Cm, unitSystem)

  return `${formatNumber(side1, decimals)}×${formatNumber(side2, decimals)}×${formatNumber(side3, decimals)}`
}

export function formatLengthFromCm(valueCm: number, unitSystem: UnitSystem, decimals: number = 2): string {
  return formatNumber(convertLengthFromCm(valueCm, unitSystem), decimals)
}

export function formatWeightFromKg(valueKg: number, unitSystem: UnitSystem, decimals: number = 3): string {
  return formatNumber(convertWeightFromKg(valueKg, unitSystem), decimals)
}

export function formatWeightDisplayFromKg(valueKg: number | null, unitSystem: UnitSystem, decimals: number): string {
  if (valueKg === null) return '—'

  if (unitSystem === 'imperial') {
    const weightLb = convertWeightFromKg(valueKg, unitSystem)
    if (weightLb < 1) {
      const ounces = weightLb * 16
      return `${formatNumber(ounces, decimals)} oz`
    }

    return `${formatNumber(weightLb, decimals)} lb`
  }

  return `${formatNumber(valueKg, decimals)} kg`
}

export function formatDimensionTripletDisplayFromCm(triplet: DimensionTriplet | null, unitSystem: UnitSystem): string {
  if (!triplet) return '—'
  const unit = getLengthUnitLabel(unitSystem)
  return `${formatDimensionTripletFromCm(triplet, unitSystem, 2)} ${unit}`
}
