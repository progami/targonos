import type { TenantCode } from '@/lib/tenant/constants'

type AmazonMoney = {
  Amount?: unknown
  CurrencyCode?: unknown
}

export type AmazonProductFeesParseResult = {
  currencyCode: string | null
  totalFees: number | null
  fbaFees: number | null
  referralFee: number | null
  sizeTier: string | null
  feeBreakdown: Array<{ feeType: string; amount: number | null; currencyCode: string | null }>
}

export function getMarketplaceCurrencyCode(tenantCode?: TenantCode): string {
  if (tenantCode === 'UK') return 'GBP'
  return 'USD'
}

const REFERRAL_CATEGORY_ALIASES_2026 = new Map<string, string>([
  ['Home Improvement', 'Tools and Home Improvement'],
  ['Tools & Home Improvement', 'Tools and Home Improvement'],
  ['Home & Kitchen', 'Home and Kitchen'],
  ['Sports & Outdoors', 'Sports and Outdoors'],
])

export function normalizeReferralCategory2026(category: string): string {
  const trimmed = category.trim()
  if (!trimmed) return ''
  const mapped = REFERRAL_CATEGORY_ALIASES_2026.get(trimmed)
  if (mapped) return mapped
  return trimmed
}

/**
 * Calculate Amazon FBA size tier from dimensions and weight.
 * Based on Amazon US product size tier definitions (starting Jan 15, 2026).
 * Dimensions in cm, weight in kg.
 */
export function calculateSizeTier(
  side1Cm: number | null,
  side2Cm: number | null,
  side3Cm: number | null,
  weightKg: number | null
): string | null {
  if (side1Cm === null || side2Cm === null || side3Cm === null || weightKg === null) return null

  const dimsIn = [side1Cm, side2Cm, side3Cm].map(d => d / 2.54).sort((a, b) => b - a)
  const longestIn = dimsIn[0]
  const medianIn = dimsIn[1]
  const shortestIn = dimsIn[2]
  const unitWeightLb = weightKg * 2.20462

  const girthIn = 2 * (medianIn + shortestIn)
  const lengthPlusGirthIn = longestIn + girthIn

  // Small standard-size: unit weight ≤ 16 oz, and ≤ 15" x 12" x 0.75"
  if (unitWeightLb <= 1 && longestIn <= 15 && medianIn <= 12 && shortestIn <= 0.75) {
    return 'Small Standard-Size'
  }

  // Large standard-size: not small standard-size, chargeable weight ≤ 20 lb, and ≤ 18" x 14" x 8"
  const dimensionalWeightStandardLb = (longestIn * medianIn * shortestIn) / 139
  const chargeableStandardLb = Math.max(unitWeightLb, dimensionalWeightStandardLb)
  if (chargeableStandardLb <= 20 && longestIn <= 18 && medianIn <= 14 && shortestIn <= 8) {
    return 'Large Standard-Size'
  }

  // Small/Large Bulky and Extra-Large use chargeable weight (max of unit and dimensional weight).
  // Dimensional weight assumes minimum width and height of 2" for these tiers.
  const bulkyMedianIn = Math.max(medianIn, 2)
  const bulkyShortestIn = Math.max(shortestIn, 2)
  const dimensionalWeightBulkyLb = (longestIn * bulkyMedianIn * bulkyShortestIn) / 139
  const chargeableBulkyLb = Math.max(unitWeightLb, dimensionalWeightBulkyLb)

  // Small Bulky: not standard-size, chargeable ≤ 50 lb, ≤ 37" x 28" x 20", and length+girth ≤ 130"
  if (
    chargeableBulkyLb <= 50 &&
    longestIn <= 37 &&
    medianIn <= 28 &&
    shortestIn <= 20 &&
    lengthPlusGirthIn <= 130
  ) {
    return 'Small Bulky'
  }

  // Large Bulky: not standard-size/small bulky, chargeable ≤ 50 lb, ≤ 59" x 33" x 33", and length+girth ≤ 130"
  if (
    chargeableBulkyLb <= 50 &&
    longestIn <= 59 &&
    medianIn <= 33 &&
    shortestIn <= 33 &&
    lengthPlusGirthIn <= 130
  ) {
    return 'Large Bulky'
  }

  // Extra-Large: everything else, split by chargeable weight.
  if (chargeableBulkyLb > 150) {
    return 'Extra-Large 150+ lb'
  }

  let isOvermax = false
  if (longestIn > 96) isOvermax = true
  if (lengthPlusGirthIn > 130) isOvermax = true
  if (isOvermax) return 'Overmax 0 to 150 lb'

  if (chargeableBulkyLb <= 50) {
    return 'Extra-Large 0 to 50 lb'
  }
  if (chargeableBulkyLb <= 70) {
    return 'Extra-Large 50+ to 70 lb'
  }

  return 'Extra-Large 70+ to 150 lb'
}

type AmazonPriceBand2026 = 'UNDER_10' | 'TEN_TO_FIFTY' | 'OVER_50'

function getPriceBand2026(listingPrice: number): AmazonPriceBand2026 | null {
  if (!Number.isFinite(listingPrice)) return null
  if (listingPrice < 10) return 'UNDER_10'
  if (listingPrice <= 50) return 'TEN_TO_FIFTY'
  return 'OVER_50'
}

function pickFeeByBand(value: { under10: number; tenToFifty: number; over50: number }, band: AmazonPriceBand2026): number {
  if (band === 'UNDER_10') return value.under10
  if (band === 'TEN_TO_FIFTY') return value.tenToFifty
  return value.over50
}

export function getReferralFeePercent2026(category: string, listingPrice: number): number | null {
  const price = Number(listingPrice)
  if (!Number.isFinite(price) || price < 0) return null
  const normalized = normalizeReferralCategory2026(category)
  if (!normalized) return null

  switch (normalized) {
    case 'Amazon Device Accessories':
      return 45
    case 'Appliances - Compact':
      return price > 300 ? 8 : 15
    case 'Appliances - Full-size':
      return 8
    case 'Automotive and Powersports':
      return 12
    case 'Baby Products':
      return price <= 10 ? 8 : 15
    case 'Backpacks, Handbags, Luggage':
      return 15
    case 'Base Equipment Power Tools':
      return 12
    case 'Beauty, Health, Personal Care':
      return price <= 10 ? 8 : 15
    case 'Books':
      return 15
    case 'Business, Industrial, Scientific':
      return 12
    case 'Clothing and Accessories':
      if (price <= 15) return 5
      if (price <= 20) return 10
      return 17
    case 'Computers':
      return 8
    case 'Consumer Electronics':
      return 8
    case 'DVD':
      return 15
    case 'Electronics Accessories':
      return price > 100 ? 8 : 15
    case 'Everything Else':
      return 15
    case 'Eyewear':
      return 15
    case 'Fine Art':
      if (price <= 100) return 20
      if (price <= 1000) return 15
      if (price <= 5000) return 10
      return 5
    case 'Footwear':
      return 15
    case 'Furniture':
      return price > 200 ? 10 : 15
    case 'Gift Cards':
      return 20
    case 'Grocery and Gourmet':
      return price <= 15 ? 8 : 15
    case 'Home and Kitchen':
      return 15
    case 'Jewelry':
      return price > 250 ? 5 : 20
    case 'Lawn and Garden':
      return 15
    case 'Lawn Mowers & Snow Throwers':
      return price > 500 ? 8 : 15
    case 'Mattresses':
      return 15
    case 'Merchant Fulfilled Services':
      return 20
    case 'Music':
      return 15
    case 'Musical Instruments & AV':
      return 15
    case 'Office Products':
      return 15
    case 'Pet Supplies':
      return 15
    case 'Software':
      return 15
    case 'Sports and Outdoors':
      return 15
    case 'Tires':
      return 10
    case 'Tools and Home Improvement':
      return 15
    case 'Toys and Games':
      return 15
    case 'Video':
      return 15
    case 'Video Game Consoles':
      return 8
    case 'Video Games & Gaming Accessories':
      return 15
    case 'Watches':
      return price > 1500 ? 3 : 16
    default:
      return null
  }
}

type FeeBand = { under10: number; tenToFifty: number; over50: number }

const SMALL_STANDARD_TABLE_2026: Array<{ maxOz: number; fee: FeeBand }> = [
  { maxOz: 2, fee: { under10: 2.43, tenToFifty: 3.32, over50: 3.58 } },
  { maxOz: 4, fee: { under10: 2.49, tenToFifty: 3.42, over50: 3.68 } },
  { maxOz: 6, fee: { under10: 2.56, tenToFifty: 3.45, over50: 3.71 } },
  { maxOz: 8, fee: { under10: 2.66, tenToFifty: 3.54, over50: 3.8 } },
  { maxOz: 10, fee: { under10: 2.77, tenToFifty: 3.68, over50: 3.94 } },
  { maxOz: 12, fee: { under10: 2.82, tenToFifty: 3.78, over50: 4.04 } },
  { maxOz: 14, fee: { under10: 2.92, tenToFifty: 3.91, over50: 4.17 } },
  { maxOz: 16, fee: { under10: 2.95, tenToFifty: 3.96, over50: 4.22 } },
]

const LARGE_STANDARD_OZ_TABLE_2026: Array<{ maxOz: number; fee: FeeBand }> = [
  { maxOz: 4, fee: { under10: 2.91, tenToFifty: 3.73, over50: 3.99 } },
  { maxOz: 8, fee: { under10: 3.13, tenToFifty: 3.95, over50: 4.21 } },
  { maxOz: 12, fee: { under10: 3.38, tenToFifty: 4.2, over50: 4.46 } },
  { maxOz: 16, fee: { under10: 3.78, tenToFifty: 4.6, over50: 4.86 } },
]

const LARGE_STANDARD_LB_TABLE_2026: Array<{ maxLb: number; fee: FeeBand }> = [
  { maxLb: 1.25, fee: { under10: 4.22, tenToFifty: 5.04, over50: 5.3 } },
  { maxLb: 1.5, fee: { under10: 4.6, tenToFifty: 5.42, over50: 5.68 } },
  { maxLb: 1.75, fee: { under10: 4.75, tenToFifty: 5.57, over50: 5.83 } },
  { maxLb: 2, fee: { under10: 5, tenToFifty: 5.82, over50: 6.08 } },
  { maxLb: 2.25, fee: { under10: 5.1, tenToFifty: 5.92, over50: 6.18 } },
  { maxLb: 2.5, fee: { under10: 5.28, tenToFifty: 6.1, over50: 6.36 } },
  { maxLb: 2.75, fee: { under10: 5.44, tenToFifty: 6.26, over50: 6.52 } },
  { maxLb: 3, fee: { under10: 5.85, tenToFifty: 6.67, over50: 6.93 } },
]

function roundUpToOunces(weightLb: number): number {
  return Math.ceil(weightLb * 16) / 16
}

function roundUpToQuarterPounds(weightLb: number): number {
  const quarter = 0.25
  return Math.ceil(weightLb / quarter) * quarter
}

function resolveSortedDimsIn(side1Cm: number, side2Cm: number, side3Cm: number): [number, number, number] {
  const dimsIn = [side1Cm / 2.54, side2Cm / 2.54, side3Cm / 2.54].sort((a, b) => b - a)
  return [dimsIn[0], dimsIn[1], dimsIn[2]]
}

function computeDimensionalWeightStandardLb(longestIn: number, medianIn: number, shortestIn: number): number {
  return (longestIn * medianIn * shortestIn) / 139
}

function computeDimensionalWeightBulkyLb(longestIn: number, medianIn: number, shortestIn: number): number {
  const bulkyMedianIn = Math.max(medianIn, 2)
  const bulkyShortestIn = Math.max(shortestIn, 2)
  return (longestIn * bulkyMedianIn * bulkyShortestIn) / 139
}

export function calculateFbaFulfillmentFee2026NonPeakExcludingApparel(input: {
  side1Cm: number
  side2Cm: number
  side3Cm: number
  unitWeightKg: number
  listingPrice: number
  sizeTier: string
}): number | null {
  const band = getPriceBand2026(input.listingPrice)
  if (band === null) return null

  const unitWeightLb = input.unitWeightKg * 2.20462
  if (!Number.isFinite(unitWeightLb) || unitWeightLb <= 0) return null

  const [longestIn, medianIn, shortestIn] = resolveSortedDimsIn(input.side1Cm, input.side2Cm, input.side3Cm)

  if (input.sizeTier === 'Small Standard-Size') {
    const shippingWeightLb = roundUpToOunces(unitWeightLb)
    const shippingWeightOz = Math.round(shippingWeightLb * 16)
    const row = SMALL_STANDARD_TABLE_2026.find(entry => shippingWeightOz <= entry.maxOz)
    if (!row) return null
    return pickFeeByBand(row.fee, band)
  }

  if (input.sizeTier === 'Large Standard-Size') {
    const dimWeightLb = computeDimensionalWeightStandardLb(longestIn, medianIn, shortestIn)
    const chargeableLb = Math.max(unitWeightLb, dimWeightLb)

    if (chargeableLb < 1) {
      const shippingWeightLb = roundUpToOunces(chargeableLb)
      const shippingWeightOz = Math.round(shippingWeightLb * 16)
      const row = LARGE_STANDARD_OZ_TABLE_2026.find(entry => shippingWeightOz <= entry.maxOz)
      if (!row) return null
      return pickFeeByBand(row.fee, band)
    }

    const shippingWeightLb = roundUpToQuarterPounds(chargeableLb)

    const row = LARGE_STANDARD_LB_TABLE_2026.find(entry => shippingWeightLb <= entry.maxLb)
    if (row) return pickFeeByBand(row.fee, band)

    if (shippingWeightLb > 20) return null

    const base = pickFeeByBand({ under10: 6.15, tenToFifty: 6.97, over50: 7.23 }, band)
    const overageSteps = Math.ceil((shippingWeightLb - 3) / 0.25)
    const overageFee = overageSteps > 0 ? overageSteps * 0.08 : 0
    return Number((base + overageFee).toFixed(2))
  }

  if (input.sizeTier === 'Small Bulky') {
    const dimWeightLb = computeDimensionalWeightBulkyLb(longestIn, medianIn, shortestIn)
    const chargeableLb = Math.max(unitWeightLb, dimWeightLb)
    const shippingWeightLb = Math.ceil(chargeableLb)
    const base = pickFeeByBand({ under10: 6.78, tenToFifty: 7.55, over50: 7.55 }, band)
    const overageFee = shippingWeightLb > 1 ? (shippingWeightLb - 1) * 0.38 : 0
    return Number((base + overageFee).toFixed(2))
  }

  if (input.sizeTier === 'Large Bulky') {
    const dimWeightLb = computeDimensionalWeightBulkyLb(longestIn, medianIn, shortestIn)
    const chargeableLb = Math.max(unitWeightLb, dimWeightLb)
    const shippingWeightLb = Math.ceil(chargeableLb)
    const base = pickFeeByBand({ under10: 8.58, tenToFifty: 9.35, over50: 9.35 }, band)
    const overageFee = shippingWeightLb > 1 ? (shippingWeightLb - 1) * 0.38 : 0
    return Number((base + overageFee).toFixed(2))
  }

  if (input.sizeTier === 'Extra-Large 0 to 50 lb') {
    const dimWeightLb = computeDimensionalWeightBulkyLb(longestIn, medianIn, shortestIn)
    const chargeableLb = Math.max(unitWeightLb, dimWeightLb)
    const shippingWeightLb = Math.ceil(chargeableLb)
    const base = pickFeeByBand({ under10: 25.56, tenToFifty: 26.33, over50: 26.33 }, band)
    const overageFee = shippingWeightLb > 1 ? (shippingWeightLb - 1) * 0.38 : 0
    return Number((base + overageFee).toFixed(2))
  }

  if (input.sizeTier === 'Extra-Large 50+ to 70 lb') {
    const dimWeightLb = computeDimensionalWeightBulkyLb(longestIn, medianIn, shortestIn)
    const chargeableLb = Math.max(unitWeightLb, dimWeightLb)
    const shippingWeightLb = Math.ceil(chargeableLb)
    const base = pickFeeByBand({ under10: 36.55, tenToFifty: 37.32, over50: 37.32 }, band)
    const overageFee = shippingWeightLb > 51 ? (shippingWeightLb - 51) * 0.75 : 0
    return Number((base + overageFee).toFixed(2))
  }

  if (input.sizeTier === 'Extra-Large 70+ to 150 lb') {
    const dimWeightLb = computeDimensionalWeightBulkyLb(longestIn, medianIn, shortestIn)
    const chargeableLb = Math.max(unitWeightLb, dimWeightLb)
    const shippingWeightLb = Math.ceil(chargeableLb)
    const base = pickFeeByBand({ under10: 50.55, tenToFifty: 51.32, over50: 51.32 }, band)
    const overageFee = shippingWeightLb > 71 ? (shippingWeightLb - 71) * 0.75 : 0
    return Number((base + overageFee).toFixed(2))
  }

  if (input.sizeTier === 'Extra-Large 150+ lb') {
    const shippingWeightLb = Math.ceil(unitWeightLb)
    const base = pickFeeByBand({ under10: 194.18, tenToFifty: 194.95, over50: 194.95 }, band)
    const overageFee = shippingWeightLb > 151 ? (shippingWeightLb - 151) * 0.19 : 0
    return Number((base + overageFee).toFixed(2))
  }

  return null
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function coerceString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseMoney(value: unknown): { amount: number | null; currencyCode: string | null } {
  if (!value || typeof value !== 'object') return { amount: null, currencyCode: null }
  const candidate = value as AmazonMoney
  return {
    amount: coerceNumber(candidate.Amount),
    currencyCode: coerceString(candidate.CurrencyCode),
  }
}

function resolveFeesEstimateRoot(response: unknown): Record<string, unknown> | null {
  if (!response || typeof response !== 'object') return null
  const root = response as Record<string, unknown>
  const payload = typeof root.payload === 'object' && root.payload !== null ? (root.payload as Record<string, unknown>) : null
  return payload ?? root
}

export function parseAmazonProductFees(response: unknown): AmazonProductFeesParseResult {
  const root = resolveFeesEstimateRoot(response)
  const estimateResult =
    root && typeof root.FeesEstimateResult === 'object' && root.FeesEstimateResult !== null
      ? (root.FeesEstimateResult as Record<string, unknown>)
      : null

  const estimate =
    estimateResult && typeof estimateResult.FeesEstimate === 'object' && estimateResult.FeesEstimate !== null
      ? (estimateResult.FeesEstimate as Record<string, unknown>)
      : root && typeof root.FeesEstimate === 'object' && root.FeesEstimate !== null
        ? (root.FeesEstimate as Record<string, unknown>)
        : null

  const totalFeesMoney =
    estimate && typeof estimate.TotalFeesEstimate === 'object' && estimate.TotalFeesEstimate !== null
      ? parseMoney(estimate.TotalFeesEstimate)
      : { amount: null, currencyCode: null }

  const feeDetailListValue = estimate ? (estimate['FeeDetailList'] as unknown) : null
  const feeDetailListRaw = Array.isArray(feeDetailListValue) ? feeDetailListValue : []

  const feeBreakdown = feeDetailListRaw
    .map(detail => {
      if (!detail || typeof detail !== 'object') return null
      const record = detail as Record<string, unknown>
      const feeType = coerceString(record.FeeType) ?? 'Unknown'
      const finalFeeRecord =
        typeof record.FinalFee === 'object' && record.FinalFee !== null
          ? (record.FinalFee as Record<string, unknown>)
          : null
      const money = record.FeeAmount ?? record.FinalFee ?? finalFeeRecord?.['FeeAmount'] ?? null
      const parsed = parseMoney(money)
      return { feeType, amount: parsed.amount, currencyCode: parsed.currencyCode }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  const fbaExact = feeBreakdown.find(row => row.feeType.toUpperCase() === 'FBAFEES')
  const fbaCandidates = feeBreakdown.filter(row => row.feeType.toUpperCase().includes('FBA'))
  const fbaFees = fbaExact?.amount ?? (fbaCandidates.length ? fbaCandidates.map(row => row.amount ?? 0).reduce((a, b) => a + b, 0) : null)
  const currencyCode = fbaExact?.currencyCode ?? fbaCandidates.find(row => row.currencyCode)?.currencyCode ?? totalFeesMoney.currencyCode

  // Extract referral fee
  const referralFeeRow = feeBreakdown.find(row => {
    const normalized = row.feeType.toUpperCase().replace(/[^A-Z]/g, '')
    return normalized === 'REFERRALFEE'
  })
  const referralFee = referralFeeRow?.amount ?? null

  // Extract size tier from FBA fee types (e.g., "FBAPickAndPackFee-Standard-Size" or "FBAFulfillmentFee")
  // Amazon returns size tier info in the FeesEstimateIdentifier or in the fee breakdown
  let sizeTier: string | null = null

  // Check FeesEstimateIdentifier for size tier
  const feesIdentifier =
    estimateResult && typeof estimateResult.FeesEstimateIdentifier === 'object' && estimateResult.FeesEstimateIdentifier !== null
      ? (estimateResult.FeesEstimateIdentifier as Record<string, unknown>)
      : null
  if (feesIdentifier) {
    const program = coerceString(feesIdentifier.OptionalFulfillmentProgram)
    if (program) sizeTier = program
  }

  // Try to infer size tier from FBA fee type names if not found
  if (!sizeTier) {
    for (const row of feeBreakdown) {
      const upperType = row.feeType.toUpperCase()
      if (upperType.includes('SMALL') && upperType.includes('LIGHT')) {
        sizeTier = 'Small and Light'
        break
      }
      if (upperType.includes('STANDARD')) {
        sizeTier = 'Standard-Size'
        break
      }
      if (upperType.includes('OVERSIZE') || upperType.includes('OVER-SIZE')) {
        if (upperType.includes('SMALL')) sizeTier = 'Small Oversize'
        else if (upperType.includes('MEDIUM')) sizeTier = 'Medium Oversize'
        else if (upperType.includes('LARGE')) sizeTier = 'Large Oversize'
        else if (upperType.includes('SPECIAL')) sizeTier = 'Special Oversize'
        else sizeTier = 'Oversize'
        break
      }
    }
  }

  return {
    currencyCode,
    totalFees: totalFeesMoney.amount,
    fbaFees,
    referralFee,
    sizeTier,
    feeBreakdown,
  }
}
