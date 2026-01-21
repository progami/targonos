/**
 * Amazon UK FBA Fee Tables and Calculations (2026)
 * Based on Amazon UK rate cards effective 2026.
 * All dimensions in cm, weight in grams/kg, fees in GBP.
 */

// =============================================================================
// Types
// =============================================================================

export type UKSizeTier =
  | 'Light Envelope'
  | 'Standard Envelope'
  | 'Large Envelope'
  | 'Extra-large Envelope'
  | 'Small Parcel'
  | 'Standard Parcel'
  | 'Small Oversize'
  | 'Standard Oversize Light'
  | 'Standard Oversize Heavy'
  | 'Standard Oversize Large'
  | 'Bulky Oversize'
  | 'Heavy Oversize'

type UKFbaFeeEntry = {
  sizeTier: UKSizeTier
  maxWeightG: number
  fee: number
}

type UKOversizeFeeEntry = {
  sizeTier: UKSizeTier
  baseWeightG: number
  baseFee: number
  perKgOverage: number
}

// =============================================================================
// Size Tier Definitions (UK - metric)
// =============================================================================

export const UK_SIZE_TIER_DEFINITIONS_2026 = [
  { tier: 'Light Envelope' as const, maxLengthCm: 33, maxWidthCm: 23, maxHeightCm: 2.5, maxWeightG: 100, description: 'Unit weight ≤ 100g' },
  { tier: 'Standard Envelope' as const, maxLengthCm: 33, maxWidthCm: 23, maxHeightCm: 2.5, maxWeightG: 460, description: 'Unit weight > 100g' },
  { tier: 'Large Envelope' as const, maxLengthCm: 33, maxWidthCm: 23, maxHeightCm: 4, maxWeightG: 960, description: '≤ 960g' },
  { tier: 'Extra-large Envelope' as const, maxLengthCm: 33, maxWidthCm: 23, maxHeightCm: 6, maxWeightG: 960, description: '≤ 960g' },
  { tier: 'Small Parcel' as const, maxLengthCm: 35, maxWidthCm: 25, maxHeightCm: 12, maxWeightKg: 3.9, description: 'Unit or dim weight ≤ 3.9 kg' },
  { tier: 'Standard Parcel' as const, maxLengthCm: 45, maxWidthCm: 34, maxHeightCm: 26, maxWeightKg: 11.9, description: 'Unit or dim weight ≤ 11.9 kg' },
  { tier: 'Small Oversize' as const, maxLengthCm: 61, maxWidthCm: 46, maxHeightCm: 46, maxUnitWeightKg: 1.76, maxDimWeightKg: 25.82, description: 'Unit ≤ 1.76 kg, dim ≤ 25.82 kg' },
  { tier: 'Standard Oversize Light' as const, maxLengthCm: 101, maxWidthCm: 60, maxHeightCm: 60, maxUnitWeightKg: 15, maxDimWeightKg: 72.72, description: 'Unit ≤ 15 kg, dim ≤ 72.72 kg' },
  { tier: 'Standard Oversize Heavy' as const, maxLengthCm: 101, maxWidthCm: 60, maxHeightCm: 60, minUnitWeightKg: 15, maxUnitWeightKg: 23, maxDimWeightKg: 72.72, description: 'Unit > 15 kg ≤ 23 kg' },
  { tier: 'Standard Oversize Large' as const, maxLengthCm: 120, maxWidthCm: 60, maxHeightCm: 60, maxUnitWeightKg: 23, maxDimWeightKg: 86.4, description: 'Unit ≤ 23 kg, dim ≤ 86.4 kg' },
  { tier: 'Bulky Oversize' as const, minLengthCm: 120, maxUnitWeightKg: 23, maxDimWeightKg: 126, description: '> 120cm, unit ≤ 23 kg' },
  { tier: 'Heavy Oversize' as const, minUnitWeightKg: 23, maxUnitWeightKg: 31.5, maxDimWeightKg: 126, description: 'Unit > 23 kg ≤ 31.5 kg' },
] as const

// =============================================================================
// Low-Price FBA Fee Table (2026)
// Products priced ≤ £10 (or ≤ £20 for most categories)
// =============================================================================

export const UK_LOW_PRICE_FBA_TABLE_2026: UKFbaFeeEntry[] = [
  // Light Envelope (≤ 33 x 23 x 2.5 cm, unit weight ≤ 100g)
  { sizeTier: 'Light Envelope', maxWeightG: 20, fee: 1.46 },
  { sizeTier: 'Light Envelope', maxWeightG: 40, fee: 1.50 },
  { sizeTier: 'Light Envelope', maxWeightG: 60, fee: 1.52 },
  { sizeTier: 'Light Envelope', maxWeightG: 80, fee: 1.67 },
  { sizeTier: 'Light Envelope', maxWeightG: 100, fee: 1.70 },
  // Standard Envelope (≤ 33 x 23 x 2.5 cm, unit weight > 100g)
  { sizeTier: 'Standard Envelope', maxWeightG: 210, fee: 1.73 },
  { sizeTier: 'Standard Envelope', maxWeightG: 460, fee: 1.87 },
  // Large Envelope (≤ 33 x 23 x 4 cm)
  { sizeTier: 'Large Envelope', maxWeightG: 960, fee: 2.42 },
  // Extra-large Envelope (≤ 33 x 23 x 6 cm)
  { sizeTier: 'Extra-large Envelope', maxWeightG: 960, fee: 2.65 },
  // Small Parcel (≤ 35 x 25 x 12 cm)
  { sizeTier: 'Small Parcel', maxWeightG: 150, fee: 2.67 },
  { sizeTier: 'Small Parcel', maxWeightG: 400, fee: 2.70 },
]

// =============================================================================
// Standard FBA Fee Table - Envelope and Parcel Tiers (2026)
// =============================================================================

export const UK_STANDARD_FBA_TABLE_2026: UKFbaFeeEntry[] = [
  // Light Envelope (≤ 33 x 23 x 2.5 cm, unit weight ≤ 100g)
  { sizeTier: 'Light Envelope', maxWeightG: 20, fee: 1.83 },
  { sizeTier: 'Light Envelope', maxWeightG: 40, fee: 1.87 },
  { sizeTier: 'Light Envelope', maxWeightG: 60, fee: 1.89 },
  { sizeTier: 'Light Envelope', maxWeightG: 80, fee: 2.07 },
  { sizeTier: 'Light Envelope', maxWeightG: 100, fee: 2.08 },
  // Standard Envelope (≤ 33 x 23 x 2.5 cm, unit weight > 100g)
  { sizeTier: 'Standard Envelope', maxWeightG: 210, fee: 2.10 },
  { sizeTier: 'Standard Envelope', maxWeightG: 460, fee: 2.16 },
  // Large Envelope (≤ 33 x 23 x 4 cm)
  { sizeTier: 'Large Envelope', maxWeightG: 960, fee: 2.72 },
  // Extra-large Envelope (≤ 33 x 23 x 6 cm)
  { sizeTier: 'Extra-large Envelope', maxWeightG: 960, fee: 2.94 },
  // Small Parcel (≤ 35 x 25 x 12 cm, unit/dim weight ≤ 3.9 kg)
  { sizeTier: 'Small Parcel', maxWeightG: 150, fee: 2.91 },
  { sizeTier: 'Small Parcel', maxWeightG: 400, fee: 3.00 },
  { sizeTier: 'Small Parcel', maxWeightG: 900, fee: 3.04 },
  { sizeTier: 'Small Parcel', maxWeightG: 1400, fee: 3.05 },
  { sizeTier: 'Small Parcel', maxWeightG: 1900, fee: 3.25 },
  { sizeTier: 'Small Parcel', maxWeightG: 3900, fee: 3.27 },
  // Standard Parcel (≤ 45 x 34 x 26 cm, unit/dim weight ≤ 11.9 kg)
  { sizeTier: 'Standard Parcel', maxWeightG: 150, fee: 2.94 },
  { sizeTier: 'Standard Parcel', maxWeightG: 400, fee: 3.01 },
  { sizeTier: 'Standard Parcel', maxWeightG: 900, fee: 3.06 },
  { sizeTier: 'Standard Parcel', maxWeightG: 1400, fee: 3.26 },
  { sizeTier: 'Standard Parcel', maxWeightG: 1900, fee: 3.48 },
  { sizeTier: 'Standard Parcel', maxWeightG: 2900, fee: 3.49 },
  { sizeTier: 'Standard Parcel', maxWeightG: 3900, fee: 3.54 },
  { sizeTier: 'Standard Parcel', maxWeightG: 5900, fee: 3.56 },
  { sizeTier: 'Standard Parcel', maxWeightG: 8900, fee: 3.57 },
  { sizeTier: 'Standard Parcel', maxWeightG: 11900, fee: 3.58 },
]

// =============================================================================
// Standard FBA Fee Table - Oversize Tiers (2026)
// Base fee + per-kg overage above base weight
// =============================================================================

export const UK_STANDARD_FBA_OVERSIZE_TABLE_2026: UKOversizeFeeEntry[] = [
  { sizeTier: 'Small Oversize', baseWeightG: 760, baseFee: 3.49, perKgOverage: 0.22 },
  { sizeTier: 'Standard Oversize Light', baseWeightG: 760, baseFee: 4.35, perKgOverage: 0.15 },
  { sizeTier: 'Standard Oversize Heavy', baseWeightG: 15760, baseFee: 6.58, perKgOverage: 0.08 },
  { sizeTier: 'Standard Oversize Large', baseWeightG: 760, baseFee: 5.67, perKgOverage: 0.07 },
  { sizeTier: 'Bulky Oversize', baseWeightG: 760, baseFee: 10.20, perKgOverage: 0.24 },
  { sizeTier: 'Heavy Oversize', baseWeightG: 31500, baseFee: 13.04, perKgOverage: 0.09 },
]

// =============================================================================
// Low-Price FBA Eligibility
// =============================================================================

export const UK_LOW_PRICE_THRESHOLD = 10 // £10 base threshold
export const UK_LOW_PRICE_THRESHOLD_EXTENDED = 20 // £20 for most categories

// Categories excluded from extended £20 threshold (must use £10)
// Source: https://sell.amazon.co.uk/low-price-fba-rates
// "products priced at and upto £20 (UK)... in all categories except Beauty, Health & Personal Care;
// Business, Industrial and Scientific Supplies; Office Products; Grocery and Gourmet; Books;
// Amazon Device Accessories; Kitchen."
export const UK_LOW_PRICE_EXCLUDED_CATEGORIES = [
  'Beauty, Health & Personal Care',
  'Beauty, Health and Personal Care',
  'Business, Industrial and Scientific Supplies',
  'Business, Industrial and Scientific',
  'Office Products',
  'Grocery and Gourmet',
  'Books',
  'Amazon Device Accessories',
  'Kitchen',
]

/**
 * Check if a product is eligible for Low-Price FBA rates.
 * - £10 threshold: ALL categories
 * - £20 threshold: All categories EXCEPT those in UK_LOW_PRICE_EXCLUDED_CATEGORIES
 * Source: https://sell.amazon.co.uk/low-price-fba-rates
 */
export function isUKLowPriceEligible(listingPrice: number, category?: string): boolean {
  if (!Number.isFinite(listingPrice) || listingPrice <= 0) return false

  // Base threshold applies to all
  if (listingPrice <= UK_LOW_PRICE_THRESHOLD) return true

  // Extended threshold for most categories
  if (category && UK_LOW_PRICE_EXCLUDED_CATEGORIES.some(c => category.toLowerCase().includes(c.toLowerCase()))) {
    return false
  }

  return listingPrice <= UK_LOW_PRICE_THRESHOLD_EXTENDED
}

// =============================================================================
// UK Referral Fee Categories (2026)
// =============================================================================

const UK_REFERRAL_CATEGORY_ALIASES = new Map<string, string>([
  ['Home Improvement', 'Tools and Home Improvement'],
  ['Tools & Home Improvement', 'Tools and Home Improvement'],
  ['Home & Kitchen', 'Home and Kitchen'],
  ['Sports & Outdoors', 'Sports and Outdoors'],
  ['Health & Personal Care', 'Beauty, Health, Personal Care'],
  ['Beauty', 'Beauty, Health, Personal Care'],
  ['Personal Care', 'Beauty, Health, Personal Care'],
])

function normalizeUKReferralCategory(category: string): string {
  const trimmed = category.trim()
  if (!trimmed) return ''
  const mapped = UK_REFERRAL_CATEGORY_ALIASES.get(trimmed)
  if (mapped) return mapped
  return trimmed
}

/**
 * Get UK referral fee percentage for a category and listing price.
 * Based on Amazon UK referral fee schedule 2026.
 */
export function getUKReferralFeePercent2026(category: string, listingPrice: number): number | null {
  const price = Number(listingPrice)
  if (!Number.isFinite(price) || price < 0) return null
  const normalized = normalizeUKReferralCategory(category)
  if (!normalized) return null

  switch (normalized) {
    case 'Amazon Device Accessories':
      return 45
    case 'Automotive and Powersports':
      return price <= 45 ? 15 : 9
    case 'Baby Products':
      return price <= 10 ? 8 : 15
    case 'Rucksacks and Handbags':
    case 'Backpacks, Handbags, Luggage':
      return 15
    case 'Beauty, Health, Personal Care':
      return price <= 10 ? 8 : 15
    case 'Beer, Wine, and Spirits':
      return 10
    case 'Books':
      return 15
    case 'Business, Industrial, Scientific':
      return 15
    case 'Compact Appliances':
      return 15
    case 'Clothing and Accessories':
      if (price <= 15) return 5
      if (price <= 20) return 10
      if (price <= 40) return 15
      return 7 // > £40 for FBA/SFP: 15% up to £40, 7% above
    case 'Commercial Electrical and Energy Supplies':
      return 12
    case 'Computers':
      return 7
    case 'Consumer Electronics':
      return 7
    case 'Cycling Accessories':
      return 8
    case 'Electronic Accessories':
      return price <= 100 ? 15 : 8
    case 'Eyewear':
      return 15
    case 'Footwear':
      return 15
    case 'Full-Size Appliances':
      return 7
    case 'Furniture':
      return price <= 175 ? 15 : 10
    case 'Grocery and Gourmet':
      return price <= 10 ? 5 : 15
    case 'Handmade':
      return 12
    case 'Home Products':
      return price <= 20 ? 8 : 15
    case 'Home and Kitchen':
    case 'Kitchen':
      return 15
    case 'Jewellery':
    case 'Jewelry':
      return price <= 225 ? 20 : 5
    case 'Lawn and Garden':
      return 15
    case 'Luggage':
      return 15
    case 'Mattresses':
      return 15
    case 'Music, Video and DVD':
    case 'Music':
    case 'Video':
    case 'DVD':
      return 15
    case 'Musical Instruments and AV Production':
    case 'Musical Instruments & AV':
      return 12
    case 'Office Products':
      return 15
    case 'Pet Supplies':
      return 15
    case 'Pet Clothing and Food':
      return price <= 10 ? 5 : 15
    case 'Software':
      return 15
    case 'Sports and Outdoors':
      return 15
    case 'Tyres':
    case 'Tires':
      return 7
    case 'Tools and Home Improvement':
      return 13
    case 'Toys and Games':
      return 15
    case 'Video Games and Gaming Accessories':
    case 'Video Games & Gaming Accessories':
      return 15
    case 'Video Game Consoles':
      return 8
    case 'Vitamins, Minerals & Supplements':
      return price <= 10 ? 5 : 15
    case 'Watches':
      return price <= 225 ? 15 : 5
    case 'Everything Else':
    default:
      return 15
  }
}

// =============================================================================
// Size Tier Calculation
// =============================================================================

/**
 * Calculate UK FBA size tier from dimensions and weight.
 * Dimensions in cm, weight in kg.
 */
export function calculateUKSizeTier(
  side1Cm: number | null,
  side2Cm: number | null,
  side3Cm: number | null,
  weightKg: number | null
): UKSizeTier | null {
  if (side1Cm === null || side2Cm === null || side3Cm === null || weightKg === null) return null

  // Sort dimensions: longest, median, shortest
  const dims = [side1Cm, side2Cm, side3Cm].sort((a, b) => b - a)
  const longestCm = dims[0]
  const medianCm = dims[1]
  const shortestCm = dims[2]
  const weightG = weightKg * 1000

  // Calculate dimensional weight (L x W x H / 5000 in cm for kg)
  const dimWeightKg = (longestCm * medianCm * shortestCm) / 5000

  // Light Envelope: ≤ 33 x 23 x 2.5 cm, unit weight ≤ 100g
  if (longestCm <= 33 && medianCm <= 23 && shortestCm <= 2.5 && weightG <= 100) {
    return 'Light Envelope'
  }

  // Standard Envelope: ≤ 33 x 23 x 2.5 cm, unit weight > 100g ≤ 460g
  if (longestCm <= 33 && medianCm <= 23 && shortestCm <= 2.5 && weightG <= 460) {
    return 'Standard Envelope'
  }

  // Large Envelope: ≤ 33 x 23 x 4 cm, ≤ 960g
  if (longestCm <= 33 && medianCm <= 23 && shortestCm <= 4 && weightG <= 960) {
    return 'Large Envelope'
  }

  // Extra-large Envelope: ≤ 33 x 23 x 6 cm, ≤ 960g
  if (longestCm <= 33 && medianCm <= 23 && shortestCm <= 6 && weightG <= 960) {
    return 'Extra-large Envelope'
  }

  // Small Parcel: ≤ 35 x 25 x 12 cm, unit/dim weight ≤ 3.9 kg
  const chargeableSmallParcel = Math.max(weightKg, dimWeightKg)
  if (longestCm <= 35 && medianCm <= 25 && shortestCm <= 12 && chargeableSmallParcel <= 3.9) {
    return 'Small Parcel'
  }

  // Standard Parcel: ≤ 45 x 34 x 26 cm, unit/dim weight ≤ 11.9 kg
  const chargeableStdParcel = Math.max(weightKg, dimWeightKg)
  if (longestCm <= 45 && medianCm <= 34 && shortestCm <= 26 && chargeableStdParcel <= 11.9) {
    return 'Standard Parcel'
  }

  // Small Oversize: ≤ 61 x 46 x 46 cm, unit weight ≤ 1.76 kg, dim weight ≤ 25.82 kg
  if (longestCm <= 61 && medianCm <= 46 && shortestCm <= 46 && weightKg <= 1.76 && dimWeightKg <= 25.82) {
    return 'Small Oversize'
  }

  // Standard Oversize Heavy: ≤ 101 x 60 x 60 cm, unit weight > 15 kg ≤ 23 kg
  if (longestCm <= 101 && medianCm <= 60 && shortestCm <= 60 && weightKg > 15 && weightKg <= 23 && dimWeightKg <= 72.72) {
    return 'Standard Oversize Heavy'
  }

  // Standard Oversize Light: ≤ 101 x 60 x 60 cm, unit weight ≤ 15 kg, dim weight ≤ 72.72 kg
  if (longestCm <= 101 && medianCm <= 60 && shortestCm <= 60 && weightKg <= 15 && dimWeightKg <= 72.72) {
    return 'Standard Oversize Light'
  }

  // Standard Oversize Large: ≤ 120 x 60 x 60 cm, unit weight ≤ 23 kg, dim weight ≤ 86.4 kg
  if (longestCm <= 120 && medianCm <= 60 && shortestCm <= 60 && weightKg <= 23 && dimWeightKg <= 86.4) {
    return 'Standard Oversize Large'
  }

  // Heavy Oversize: unit weight > 23 kg ≤ 31.5 kg or dim weight ≤ 126 kg
  if (weightKg > 23 && weightKg <= 31.5) {
    return 'Heavy Oversize'
  }

  // Bulky Oversize: > 120 x 60 x 60 cm, unit weight ≤ 23 kg, dim weight ≤ 126 kg
  if (weightKg <= 23 && dimWeightKg <= 126) {
    return 'Bulky Oversize'
  }

  return null
}

// =============================================================================
// FBA Fee Calculation
// =============================================================================

/**
 * Calculate UK FBA fulfillment fee.
 * Automatically selects Low-Price or Standard rates based on listing price and category.
 */
export function calculateUKFbaFulfillmentFee(input: {
  side1Cm: number
  side2Cm: number
  side3Cm: number
  unitWeightKg: number
  listingPrice: number
  sizeTier: string
  category?: string
}): number | null {
  const { side1Cm, side2Cm, side3Cm, unitWeightKg, listingPrice, sizeTier, category } = input

  if (!Number.isFinite(unitWeightKg) || unitWeightKg <= 0) return null

  const weightG = unitWeightKg * 1000
  const dims = [side1Cm, side2Cm, side3Cm].sort((a, b) => b - a)
  const longestCm = dims[0]
  const medianCm = dims[1]
  const shortestCm = dims[2]
  const dimWeightKg = (longestCm * medianCm * shortestCm) / 5000

  // Check if eligible for Low-Price rates
  const useLowPrice = isUKLowPriceEligible(listingPrice, category)

  // For envelope and parcel tiers, use flat fee tables
  const isEnvelopeOrParcel = [
    'Light Envelope',
    'Standard Envelope',
    'Large Envelope',
    'Extra-large Envelope',
    'Small Parcel',
    'Standard Parcel',
  ].includes(sizeTier)

  if (isEnvelopeOrParcel) {
    const table = useLowPrice ? UK_LOW_PRICE_FBA_TABLE_2026 : UK_STANDARD_FBA_TABLE_2026

    // For Small Parcel and Standard Parcel, use chargeable weight (max of unit and dim)
    let lookupWeightG = weightG
    if (sizeTier === 'Small Parcel' || sizeTier === 'Standard Parcel') {
      lookupWeightG = Math.max(weightG, dimWeightKg * 1000)
    }

    // Find the matching fee entry
    const matchingEntries = table.filter(entry => entry.sizeTier === sizeTier)
    const entry = matchingEntries.find(e => lookupWeightG <= e.maxWeightG)

    if (entry) {
      return entry.fee
    }

    // If weight exceeds all entries for this tier, return the highest fee
    if (matchingEntries.length > 0) {
      return matchingEntries[matchingEntries.length - 1].fee
    }

    return null
  }

  // For oversize tiers, use base fee + per-kg overage (Standard rates only, no Low-Price for oversize)
  const oversizeEntry = UK_STANDARD_FBA_OVERSIZE_TABLE_2026.find(e => e.sizeTier === sizeTier)
  if (oversizeEntry) {
    // Use chargeable weight (max of unit and dimensional)
    const chargeableWeightKg = Math.max(unitWeightKg, dimWeightKg)
    const chargeableWeightG = chargeableWeightKg * 1000

    if (chargeableWeightG <= oversizeEntry.baseWeightG) {
      return oversizeEntry.baseFee
    }

    // Calculate overage
    const overageKg = Math.ceil((chargeableWeightG - oversizeEntry.baseWeightG) / 1000)
    const overageFee = overageKg * oversizeEntry.perKgOverage
    return Number((oversizeEntry.baseFee + overageFee).toFixed(2))
  }

  return null
}
