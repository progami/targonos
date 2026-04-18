import { calculateSizeTierForTenant } from '@/lib/amazon/fees'
import { LB_PER_KG } from '@/lib/measurements'
import { resolveDimensionTripletCm } from '@/lib/sku-dimensions'
import type { TenantCode } from '@/lib/tenant/constants'

export type AlertStatus =
  | 'UNKNOWN'
  | 'MATCH'
  | 'MISMATCH'
  | 'NO_ASIN'
  | 'MISSING_REFERENCE'
  | 'ERROR'

export type ApiSkuRow = {
  id: string
  skuCode: string
  description: string
  asin: string | null
  fbaFulfillmentFee: number | string | null
  amazonFbaFulfillmentFee: number | string | null
  amazonListingPrice: number | string | null
  amazonSizeTier: string | null
  referenceItemPackageDimensionsCm: string | null
  referenceItemPackageSide1Cm: number | string | null
  referenceItemPackageSide2Cm: number | string | null
  referenceItemPackageSide3Cm: number | string | null
  referenceItemPackageWeightKg: number | string | null
  amazonItemPackageDimensionsCm: string | null
  amazonItemPackageSide1Cm: number | string | null
  amazonItemPackageSide2Cm: number | string | null
  amazonItemPackageSide3Cm: number | string | null
  amazonItemPackageWeightKg: number | string | null
  itemDimensionsCm: string | null
  itemSide1Cm: number | string | null
  itemSide2Cm: number | string | null
  itemSide3Cm: number | string | null
  itemWeightKg: number | string | null
}

export type DimensionTriplet = { side1Cm: number; side2Cm: number; side3Cm: number }

export type ShippingWeights = {
  unitWeightKg: number | null
  dimensionalWeightKg: number | null
  shippingWeightKg: number | null
}

export type Comparison = {
  status: AlertStatus
  reference: {
    triplet: DimensionTriplet | null
    shipping: ShippingWeights
    sizeTier: string | null
    expectedFee: number | null
    missingFields: string[]
  }
  amazon: {
    triplet: DimensionTriplet | null
    shipping: ShippingWeights
    sizeTier: string | null
    fee: number | null
    missingFields: string[]
  }
  feeDifference: number | null
  hasPhysicalMismatch: boolean
}

const DIMENSION_TOLERANCE_CM = 0.05
const WEIGHT_TOLERANCE_KG = 0.005

export function parseDecimalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    const parsed = Number.parseFloat(String(value))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function usesMinWidthHeight(sizeTier: string | null): boolean {
  if (!sizeTier) return false
  if (sizeTier === 'Small Bulky') return true
  if (sizeTier === 'Large Bulky') return true
  if (sizeTier === 'Overmax 0 to 150 lb') return true
  if (sizeTier.startsWith('Extra-Large')) return true
  return false
}

function computeDimensionalWeightLbWithMinWidthHeight(
  triplet: DimensionTriplet,
  applyMinWidthHeightIn: boolean
): number {
  const dimsIn = [triplet.side1Cm / 2.54, triplet.side2Cm / 2.54, triplet.side3Cm / 2.54].sort(
    (a, b) => b - a
  )
  const longestIn = dimsIn[0]
  let medianIn = dimsIn[1]
  let shortestIn = dimsIn[2]

  if (applyMinWidthHeightIn) {
    medianIn = Math.max(medianIn, 2)
    shortestIn = Math.max(shortestIn, 2)
  }

  const volumeIn3 = longestIn * medianIn * shortestIn
  return volumeIn3 / 139
}

export function computeShippingWeights(
  triplet: DimensionTriplet | null,
  unitWeightKg: number | null,
  sizeTier: string | null,
  tenantCode: TenantCode
): ShippingWeights {
  if (tenantCode === 'UK') {
    const dimensionalWeightKg =
      triplet === null
        ? null
        : (() => {
            const dimsCm = [triplet.side1Cm, triplet.side2Cm, triplet.side3Cm].sort((a, b) => b - a)
            const longestCm = dimsCm[0]
            const medianCm = dimsCm[1]
            const shortestCm = dimsCm[2]
            return (longestCm * medianCm * shortestCm) / 5000
          })()

    const shippingWeightKg =
      unitWeightKg !== null && dimensionalWeightKg !== null
        ? Math.max(unitWeightKg, dimensionalWeightKg)
        : unitWeightKg !== null
          ? unitWeightKg
          : dimensionalWeightKg

    return { unitWeightKg, dimensionalWeightKg, shippingWeightKg }
  }

  const unitWeightLb = unitWeightKg === null ? null : unitWeightKg * LB_PER_KG
  const dimensionalWeightLb =
    triplet === null ? null : computeDimensionalWeightLbWithMinWidthHeight(triplet, usesMinWidthHeight(sizeTier))

  let chargeableWeightLb: number | null = null
  let usesUnitOnly = false
  if (sizeTier === 'Small Standard-Size') usesUnitOnly = true
  if (sizeTier === 'Extra-Large 150+ lb') usesUnitOnly = true

  if (usesUnitOnly) {
    if (unitWeightLb !== null) chargeableWeightLb = unitWeightLb
  } else if (unitWeightLb !== null && dimensionalWeightLb !== null) {
    chargeableWeightLb = Math.max(unitWeightLb, dimensionalWeightLb)
  } else if (unitWeightLb !== null) {
    chargeableWeightLb = unitWeightLb
  } else if (dimensionalWeightLb !== null) {
    chargeableWeightLb = dimensionalWeightLb
  }

  if (chargeableWeightLb === null) {
    return { unitWeightKg, dimensionalWeightKg: null, shippingWeightKg: null }
  }

  let roundedWeightLb = chargeableWeightLb
  if (chargeableWeightLb < 1) {
    const ounces = chargeableWeightLb * 16
    const roundedOunces = Math.ceil(ounces)
    roundedWeightLb = roundedOunces / 16
  } else {
    let roundToWholePounds = false
    if (sizeTier === 'Small Bulky') roundToWholePounds = true
    if (sizeTier === 'Large Bulky') roundToWholePounds = true
    if (sizeTier === 'Extra-Large 150+ lb') roundToWholePounds = true
    if (sizeTier === 'Overmax 0 to 150 lb') roundToWholePounds = true
    if (sizeTier && sizeTier.startsWith('Extra-Large')) roundToWholePounds = true

    if (roundToWholePounds) {
      roundedWeightLb = Math.ceil(chargeableWeightLb)
    } else {
      const quarterPounds = 0.25
      const roundedSteps = Math.ceil(chargeableWeightLb / quarterPounds)
      roundedWeightLb = roundedSteps * quarterPounds
    }
  }

  const dimensionalWeightKg = dimensionalWeightLb === null ? null : dimensionalWeightLb / LB_PER_KG
  const shippingWeightKg = roundedWeightLb / LB_PER_KG

  return { unitWeightKg, dimensionalWeightKg, shippingWeightKg }
}

function dimensionsMatch(reference: DimensionTriplet | null, amazon: DimensionTriplet | null): boolean {
  if (reference === null || amazon === null) return true
  const referenceSides = [reference.side1Cm, reference.side2Cm, reference.side3Cm].sort((a, b) => a - b)
  const amazonSides = [amazon.side1Cm, amazon.side2Cm, amazon.side3Cm].sort((a, b) => a - b)
  return referenceSides.every((referenceSide, index) => {
    const amazonSide = amazonSides[index]
    return Math.abs(referenceSide - amazonSide) <= DIMENSION_TOLERANCE_CM
  })
}

function weightsMatch(reference: number | null, amazon: number | null): boolean {
  if (reference === null || amazon === null) return true
  return Math.abs(reference - amazon) <= WEIGHT_TOLERANCE_KG
}

function physicalMeasurementsMatch(params: {
  referenceTriplet: DimensionTriplet | null
  amazonTriplet: DimensionTriplet | null
  referenceShipping: ShippingWeights
  amazonShipping: ShippingWeights
  referenceSizeTier: string | null
  amazonSizeTier: string | null
}): boolean {
  if (!dimensionsMatch(params.referenceTriplet, params.amazonTriplet)) return false
  if (!weightsMatch(params.referenceShipping.unitWeightKg, params.amazonShipping.unitWeightKg)) return false
  if (!weightsMatch(params.referenceShipping.shippingWeightKg, params.amazonShipping.shippingWeightKg)) return false
  if (params.referenceSizeTier !== params.amazonSizeTier) return false
  return true
}

export function computeComparison(row: ApiSkuRow, tenantCode: TenantCode): Comparison {
  const referenceTriplet = resolveDimensionTripletCm({
    side1Cm: row.referenceItemPackageSide1Cm,
    side2Cm: row.referenceItemPackageSide2Cm,
    side3Cm: row.referenceItemPackageSide3Cm,
    legacy: row.referenceItemPackageDimensionsCm,
  })
  const referenceWeightKg = parseDecimalNumber(row.referenceItemPackageWeightKg)
  const referenceSizeTier =
    referenceTriplet && referenceWeightKg !== null
      ? calculateSizeTierForTenant(
          tenantCode,
          referenceTriplet.side1Cm,
          referenceTriplet.side2Cm,
          referenceTriplet.side3Cm,
          referenceWeightKg
        )
      : null
  const referenceShipping = computeShippingWeights(referenceTriplet, referenceWeightKg, referenceSizeTier, tenantCode)

  const amazonTriplet = resolveDimensionTripletCm({
    side1Cm: row.amazonItemPackageSide1Cm,
    side2Cm: row.amazonItemPackageSide2Cm,
    side3Cm: row.amazonItemPackageSide3Cm,
    legacy: row.amazonItemPackageDimensionsCm,
  })
  const amazonWeightKg = parseDecimalNumber(row.amazonItemPackageWeightKg)
  let amazonSizeTier: string | null = null
  if (typeof row.amazonSizeTier === 'string') {
    const trimmed = row.amazonSizeTier.trim()
    if (trimmed) amazonSizeTier = trimmed
  }
  const amazonShipping = computeShippingWeights(amazonTriplet, amazonWeightKg, amazonSizeTier, tenantCode)

  const expectedFee = parseDecimalNumber(row.fbaFulfillmentFee)
  const amazonFee = parseDecimalNumber(row.amazonFbaFulfillmentFee)
  const feeDifference = expectedFee === null || amazonFee === null ? null : amazonFee - expectedFee

  const referenceMissingFields: string[] = []
  if (expectedFee === null) referenceMissingFields.push('Reference FBA fulfillment fee')
  if (referenceTriplet === null) referenceMissingFields.push('Item package dimensions')
  if (referenceWeightKg === null) referenceMissingFields.push('Item package weight')

  const amazonMissingFields: string[] = []
  if (amazonFee === null) amazonMissingFields.push('Amazon FBA fulfillment fee')
  if (amazonSizeTier === null) amazonMissingFields.push('Amazon size tier')
  if (amazonTriplet === null) amazonMissingFields.push('Amazon item package dimensions')
  if (amazonWeightKg === null) amazonMissingFields.push('Amazon item package weight')

  const hasPhysicalMismatch = physicalMeasurementsMatch({
    referenceTriplet,
    amazonTriplet,
    referenceShipping,
    amazonShipping,
    referenceSizeTier,
    amazonSizeTier,
  }) === false

  let status: AlertStatus = 'UNKNOWN'
  if (!row.asin) {
    status = 'NO_ASIN'
  } else if (referenceMissingFields.length > 0) {
    status = 'MISSING_REFERENCE'
  } else if (amazonMissingFields.length > 0) {
    status = 'ERROR'
  } else {
    const expectedRounded = expectedFee === null ? null : Number(expectedFee.toFixed(2))
    const amazonRounded = amazonFee === null ? null : Number(amazonFee.toFixed(2))

    if (hasPhysicalMismatch) {
      status = 'MISMATCH'
    } else if (expectedRounded !== null && amazonRounded !== null && expectedRounded === amazonRounded) {
      status = 'MATCH'
    } else if (expectedRounded !== null && amazonRounded !== null) {
      status = 'MISMATCH'
    }
  }

  return {
    status,
    reference: {
      triplet: referenceTriplet,
      shipping: referenceShipping,
      sizeTier: referenceSizeTier,
      expectedFee,
      missingFields: referenceMissingFields,
    },
    amazon: {
      triplet: amazonTriplet,
      shipping: amazonShipping,
      sizeTier: amazonSizeTier,
      fee: amazonFee,
      missingFields: amazonMissingFields,
    },
    feeDifference,
    hasPhysicalMismatch,
  }
}

export function getComparisonStatusLabel(comparison: Comparison): string {
  if (comparison.status === 'MATCH') return 'Correct'
  if (comparison.status === 'MISMATCH') {
    if (comparison.hasPhysicalMismatch) return 'Physical mismatch'
    if (comparison.feeDifference !== null && comparison.feeDifference > 0) return 'Overcharge'
    if (comparison.feeDifference !== null && comparison.feeDifference < 0) return 'Undercharge'
    throw new Error('MISMATCH comparison is missing a physical mismatch or fee delta')
  }
  if (comparison.status === 'MISSING_REFERENCE') return 'No ref'
  if (comparison.status === 'NO_ASIN') return 'No ASIN'
  if (comparison.status === 'ERROR') return 'Error'
  return 'Pending'
}
