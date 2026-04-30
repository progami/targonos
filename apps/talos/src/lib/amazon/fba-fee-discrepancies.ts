import { LB_PER_KG } from '@/lib/measurements'
import {
  formatDimensionTripletCm,
  resolveDimensionTripletCm,
  sortDimensionTripletCm,
} from '@/lib/sku-dimensions'
import type { TenantCode } from '@/lib/tenant/constants'

export type AlertStatus =
  | 'UNKNOWN'
  | 'MATCH'
  | 'MISMATCH'
  | 'NO_ASIN'
  | 'MISSING_REFERENCE'
  | 'MISSING_AMAZON'

type DecimalLike = { toString(): string }
type ApiNumberValue = number | string | DecimalLike | null

export type ApiSkuRow = {
  id: string
  skuCode: string
  description: string
  asin: string | null
  category?: string | null
  sizeTier: string | null
  amazonSizeTier: string | null
  referenceItemPackageDimensionsCm: string | null
  referenceItemPackageSide1Cm: ApiNumberValue
  referenceItemPackageSide2Cm: ApiNumberValue
  referenceItemPackageSide3Cm: ApiNumberValue
  referenceItemPackageWeightKg: ApiNumberValue
  amazonItemPackageDimensionsCm: string | null
  amazonItemPackageSide1Cm: ApiNumberValue
  amazonItemPackageSide2Cm: ApiNumberValue
  amazonItemPackageSide3Cm: ApiNumberValue
  amazonItemPackageWeightKg: ApiNumberValue
  itemDimensionsCm: string | null
  itemSide1Cm: ApiNumberValue
  itemSide2Cm: ApiNumberValue
  itemSide3Cm: ApiNumberValue
  itemWeightKg: ApiNumberValue
}

export type ComparisonSkuSourceRow = {
  id: string
  skuCode: string
  description: string
  asin: string | null
  category?: string | null
  sizeTier: string | null
  amazonSizeTier: string | null
  unitDimensionsCm: string | null
  unitSide1Cm: ApiNumberValue
  unitSide2Cm: ApiNumberValue
  unitSide3Cm: ApiNumberValue
  unitWeightKg: ApiNumberValue
  itemDimensionsCm: string | null
  itemSide1Cm: ApiNumberValue
  itemSide2Cm: ApiNumberValue
  itemSide3Cm: ApiNumberValue
  itemWeightKg: ApiNumberValue
  amazonItemPackageDimensionsCm: string | null
  amazonItemPackageSide1Cm: ApiNumberValue
  amazonItemPackageSide2Cm: ApiNumberValue
  amazonItemPackageSide3Cm: ApiNumberValue
  amazonReferenceWeightKg: ApiNumberValue
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
    missingFields: string[]
  }
  amazon: {
    triplet: DimensionTriplet | null
    shipping: ShippingWeights
    sizeTier: string | null
    missingFields: string[]
  }
  hasSizeTierMismatch: boolean
}

export type ComparisonSummaryCounts = {
  mismatch: number
  match: number
  warning: number
  pending: number
}

export type ComparisonSummaryItem = {
  key: string
  count: number
  label: string
}

export const COMPARISON_WARNING_STATUSES = new Set<AlertStatus>([
  'NO_ASIN',
  'MISSING_REFERENCE',
  'MISSING_AMAZON',
])

export type AmazonCatalogPackageData = {
  packageTriplet: DimensionTriplet | null
  packageWeightKg: number | null
  sizeTier: string | null
}

export function buildComparisonSkuRow(row: ComparisonSkuSourceRow): ApiSkuRow {
  return {
    ...row,
    referenceItemPackageDimensionsCm: row.unitDimensionsCm,
    referenceItemPackageSide1Cm: row.unitSide1Cm,
    referenceItemPackageSide2Cm: row.unitSide2Cm,
    referenceItemPackageSide3Cm: row.unitSide3Cm,
    referenceItemPackageWeightKg: row.unitWeightKg,
    amazonItemPackageDimensionsCm: row.amazonItemPackageDimensionsCm,
    amazonItemPackageSide1Cm: row.amazonItemPackageSide1Cm,
    amazonItemPackageSide2Cm: row.amazonItemPackageSide2Cm,
    amazonItemPackageSide3Cm: row.amazonItemPackageSide3Cm,
    amazonItemPackageWeightKg: row.amazonReferenceWeightKg,
  }
}

export function mergeAmazonCatalogPackageData(
  row: ApiSkuRow,
  catalogData: AmazonCatalogPackageData
): ApiSkuRow {
  const next: ApiSkuRow = { ...row }

  if (catalogData.packageTriplet !== null) {
    const packageTriplet = sortDimensionTripletCm(catalogData.packageTriplet)
    next.amazonItemPackageDimensionsCm = formatDimensionTripletCm(packageTriplet)
    next.amazonItemPackageSide1Cm = packageTriplet.side1Cm
    next.amazonItemPackageSide2Cm = packageTriplet.side2Cm
    next.amazonItemPackageSide3Cm = packageTriplet.side3Cm
  }

  if (catalogData.packageWeightKg !== null) {
    next.amazonItemPackageWeightKg = catalogData.packageWeightKg
  }

  if (catalogData.sizeTier !== null) {
    next.amazonSizeTier = catalogData.sizeTier
  }

  return next
}

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
    triplet === null
      ? null
      : computeDimensionalWeightLbWithMinWidthHeight(triplet, usesMinWidthHeight(sizeTier))

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

function resolveReferenceData(row: ApiSkuRow): {
  referenceTriplet: DimensionTriplet | null
  referenceWeightKg: number | null
  referenceSizeTier: string | null
} {
  const rawReferenceTriplet = resolveDimensionTripletCm({
    side1Cm: row.referenceItemPackageSide1Cm,
    side2Cm: row.referenceItemPackageSide2Cm,
    side3Cm: row.referenceItemPackageSide3Cm,
    legacy: row.referenceItemPackageDimensionsCm,
  })
  const referenceTriplet = rawReferenceTriplet ? sortDimensionTripletCm(rawReferenceTriplet) : null
  const referenceWeightKg = parseDecimalNumber(row.referenceItemPackageWeightKg)
  const assignedReferenceTier = typeof row.sizeTier === 'string' ? row.sizeTier.trim() : ''
  const referenceSizeTier = assignedReferenceTier ? assignedReferenceTier : null

  return {
    referenceTriplet,
    referenceWeightKg,
    referenceSizeTier,
  }
}

export function computeComparison(row: ApiSkuRow, tenantCode: TenantCode): Comparison {
  const { referenceTriplet, referenceWeightKg, referenceSizeTier } = resolveReferenceData(row)
  const referenceShipping = computeShippingWeights(
    referenceTriplet,
    referenceWeightKg,
    referenceSizeTier,
    tenantCode
  )

  const rawAmazonTriplet = resolveDimensionTripletCm({
    side1Cm: row.amazonItemPackageSide1Cm,
    side2Cm: row.amazonItemPackageSide2Cm,
    side3Cm: row.amazonItemPackageSide3Cm,
    legacy: row.amazonItemPackageDimensionsCm,
  })
  const amazonTriplet = rawAmazonTriplet ? sortDimensionTripletCm(rawAmazonTriplet) : null
  const amazonWeightKg = parseDecimalNumber(row.amazonItemPackageWeightKg)
  let amazonSizeTier: string | null = null
  if (typeof row.amazonSizeTier === 'string') {
    const trimmed = row.amazonSizeTier.trim()
    if (trimmed) amazonSizeTier = trimmed
  }
  const amazonShipping = computeShippingWeights(
    amazonTriplet,
    amazonWeightKg,
    amazonSizeTier,
    tenantCode
  )

  const referenceMissingFields: string[] = []
  if (referenceSizeTier === null) referenceMissingFields.push('Reference size tier')

  const amazonMissingFields: string[] = []
  if (amazonSizeTier === null) amazonMissingFields.push('Amazon size tier')

  const hasSizeTierMismatch =
    referenceSizeTier !== null && amazonSizeTier !== null && referenceSizeTier !== amazonSizeTier

  let status: AlertStatus = 'UNKNOWN'
  if (!row.asin) {
    status = 'NO_ASIN'
  } else if (referenceMissingFields.length > 0) {
    status = 'MISSING_REFERENCE'
  } else if (amazonMissingFields.length > 0) {
    status = 'MISSING_AMAZON'
  } else {
    if (hasSizeTierMismatch) {
      status = 'MISMATCH'
    } else {
      status = 'MATCH'
    }
  }

  return {
    status,
    reference: {
      triplet: referenceTriplet,
      shipping: referenceShipping,
      sizeTier: referenceSizeTier,
      missingFields: referenceMissingFields,
    },
    amazon: {
      triplet: amazonTriplet,
      shipping: amazonShipping,
      sizeTier: amazonSizeTier,
      missingFields: amazonMissingFields,
    },
    hasSizeTierMismatch,
  }
}

export function getComparisonStatusLabel(comparison: Comparison): string {
  if (comparison.status === 'MATCH') return 'Size tier match'
  if (comparison.status === 'MISMATCH') {
    return 'Size tier mismatch'
  }
  if (comparison.status === 'MISSING_REFERENCE') return 'No reference tier'
  if (comparison.status === 'NO_ASIN') return 'No ASIN'
  if (comparison.status === 'MISSING_AMAZON') return 'No Amazon tier'
  return 'Pending'
}

export function summarizeComparisonStatuses(
  rows: readonly { comparison: { status: AlertStatus } }[]
): ComparisonSummaryCounts {
  const counts: ComparisonSummaryCounts = { mismatch: 0, match: 0, warning: 0, pending: 0 }
  for (const row of rows) {
    const status = row.comparison.status
    if (status === 'MISMATCH') counts.mismatch += 1
    else if (status === 'MATCH') counts.match += 1
    else if (COMPARISON_WARNING_STATUSES.has(status)) counts.warning += 1
    else counts.pending += 1
  }
  return counts
}

export function buildComparisonSummaryItems(
  summary: ComparisonSummaryCounts
): ComparisonSummaryItem[] {
  const items: ComparisonSummaryItem[] = []
  if (summary.mismatch > 0) {
    items.push({
      key: 'mismatch',
      count: summary.mismatch,
      label: summary.mismatch === 1 ? 'mismatch' : 'mismatches',
    })
  }
  if (summary.match > 0) {
    items.push({
      key: 'match',
      count: summary.match,
      label: summary.match === 1 ? 'match' : 'matches',
    })
  }
  if (summary.warning > 0) {
    items.push({
      key: 'warning',
      count: summary.warning,
      label: summary.warning === 1 ? 'warning' : 'warnings',
    })
  }
  if (summary.pending > 0) {
    items.push({
      key: 'pending',
      count: summary.pending,
      label: 'pending',
    })
  }
  return items
}
