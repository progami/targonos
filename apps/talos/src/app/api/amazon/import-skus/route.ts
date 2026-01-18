import { ApiResponses, withRole, z } from '@/lib/api'
import {
  getCatalogItem,
  getCatalogListingTypesByAsin,
  getListingsItems,
  getListingPrice,
  getProductFees,
  testCompareApis,
  type AmazonCatalogListingType,
} from '@/lib/amazon/client'
import { SHIPMENT_PLANNING_CONFIG } from '@/lib/config/shipment-planning'
import { sanitizeForDisplay } from '@/lib/security/input-sanitization'
import {
  getReferralFeePercent2026,
  normalizeReferralCategory2026,
  parseAmazonProductFees,
  calculateSizeTier,
} from '@/lib/amazon/fees'
import { formatDimensionTripletCm, resolveDimensionTripletCm } from '@/lib/sku-dimensions'
import { SKU_FIELD_LIMITS } from '@/lib/sku-constants'
import { getCurrentTenantCode, getTenantPrisma } from '@/lib/tenant/server'
import { Prisma } from '@targon/prisma-talos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const previewQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(250).optional(),
})

const requestSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  skuCodes: z.array(z.string().trim().min(1).max(50)).max(100).optional(),
  mode: z.enum(['import', 'validate']).default('import'),
})

const DEFAULT_BATCH_CODE = 'BATCH 01'
const DEFAULT_PACK_SIZE = 1
const DEFAULT_UNITS_PER_CARTON = 1
const DEFAULT_CARTONS_PER_PALLET = SHIPMENT_PLANNING_CONFIG.DEFAULT_CARTONS_PER_PALLET
const DEFAULT_FEE_ESTIMATE_PRICE = 10

function normalizeSkuCode(value: string): string | null {
  const normalized = sanitizeForDisplay(value.trim().toUpperCase())
  if (!normalized) return null
  if (normalized.length > 50) return null
  return normalized
}

function normalizeAsin(value: string | null): string | null {
  if (!value) return null
  const normalized = sanitizeForDisplay(value.trim().toUpperCase())
  if (!normalized) return null
  if (normalized.length > 64) return null
  return normalized
}

function normalizeTitle(value: string | null): string | null {
  if (!value) return null
  const normalized = sanitizeForDisplay(value.trim())
  return normalized ? normalized : null
}

function parseCatalogItemPackageDimensions(attributes: {
  item_package_dimensions?: Array<{
    length?: { value?: number; unit?: string }
    width?: { value?: number; unit?: string }
    height?: { value?: number; unit?: string }
  }>
}): { side1Cm: number; side2Cm: number; side3Cm: number } | null {
  const dims = attributes.item_package_dimensions?.[0]
  if (!dims) return null
  const length = dims?.length?.value
  const width = dims?.width?.value
  const height = dims?.height?.value
  if (length === undefined || width === undefined || height === undefined) return null
  if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(height)) return null

  const lengthUnit = dims?.length?.unit
  const widthUnit = dims?.width?.unit
  const heightUnit = dims?.height?.unit

  const side1Cm = convertMeasurementToCm(length, lengthUnit)
  const side2Cm = convertMeasurementToCm(width, widthUnit)
  const side3Cm = convertMeasurementToCm(height, heightUnit)
  if (side1Cm === null || side2Cm === null || side3Cm === null) return null

  const triplet = resolveDimensionTripletCm({ side1Cm, side2Cm, side3Cm })
  return triplet
}

function parseCatalogItemDimensions(attributes: {
  item_dimensions?: Array<{
    length?: { value?: number; unit?: string }
    width?: { value?: number; unit?: string }
    height?: { value?: number; unit?: string }
  }>
}): { side1Cm: number; side2Cm: number; side3Cm: number } | null {
  const dims = attributes.item_dimensions?.[0] ?? null
  if (!dims) return null
  const length = dims?.length?.value
  const width = dims?.width?.value
  const height = dims?.height?.value
  if (length === undefined || width === undefined || height === undefined) return null
  if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(height)) return null

  const lengthUnit = dims?.length?.unit
  const widthUnit = dims?.width?.unit
  const heightUnit = dims?.height?.unit

  const side1Cm = convertMeasurementToCm(length, lengthUnit)
  const side2Cm = convertMeasurementToCm(width, widthUnit)
  const side3Cm = convertMeasurementToCm(height, heightUnit)
  if (side1Cm === null || side2Cm === null || side3Cm === null) return null

  const triplet = resolveDimensionTripletCm({ side1Cm, side2Cm, side3Cm })
  return triplet
}

function convertMeasurementToCm(value: number, unit: string | undefined): number | null {
  if (!Number.isFinite(value)) return null
  if (typeof unit !== 'string') return null
  const normalized = unit.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'inches' || normalized === 'inch' || normalized === 'in') {
    return Number((value * 2.54).toFixed(2))
  }
  if (normalized === 'centimeters' || normalized === 'centimetres' || normalized === 'cm') {
    return Number(value.toFixed(2))
  }
  if (normalized === 'millimeters' || normalized === 'millimetres' || normalized === 'mm') {
    return Number((value / 10).toFixed(2))
  }
  return null
}

function parseCatalogItemPackageWeightKg(attributes: {
  item_package_weight?: Array<{ value?: number; unit?: string }>
}): number | null {
  const measurement = attributes.item_package_weight?.[0]
  if (!measurement) return null
  const raw = measurement?.value
  if (raw === undefined || raw === null) return null
  if (!Number.isFinite(raw)) return null

  const unit = measurement?.unit
  if (typeof unit !== 'string') return null
  const normalized = unit.trim().toLowerCase()
  if (!normalized) return null

  if (normalized === 'kilograms' || normalized === 'kilogram' || normalized === 'kg') {
    return Number(raw.toFixed(3))
  }

  if (normalized === 'pounds' || normalized === 'pound' || normalized === 'lb' || normalized === 'lbs') {
    return Number((raw * 0.453592).toFixed(3))
  }

  if (normalized === 'grams' || normalized === 'gram' || normalized === 'g') {
    return Number((raw / 1000).toFixed(3))
  }

  if (normalized === 'ounces' || normalized === 'ounce' || normalized === 'oz') {
    return Number((raw * 0.0283495).toFixed(3))
  }

  return null
}

function parseCatalogItemWeightKg(attributes: {
  item_weight?: Array<{ value?: number; unit?: string }>
}): number | null {
  const measurement = attributes.item_weight?.[0] ?? null
  if (!measurement) return null
  const raw = measurement?.value
  if (raw === undefined || raw === null) return null
  if (!Number.isFinite(raw)) return null

  const unit = measurement?.unit
  if (typeof unit !== 'string') return null
  const normalized = unit.trim().toLowerCase()
  if (!normalized) return null

  if (normalized === 'kilograms' || normalized === 'kilogram' || normalized === 'kg') {
    return Number(raw.toFixed(3))
  }

  if (normalized === 'pounds' || normalized === 'pound' || normalized === 'lb' || normalized === 'lbs') {
    return Number((raw * 0.453592).toFixed(3))
  }

  if (normalized === 'grams' || normalized === 'gram' || normalized === 'g') {
    return Number((raw / 1000).toFixed(3))
  }

  if (normalized === 'ounces' || normalized === 'ounce' || normalized === 'oz') {
    return Number((raw * 0.0283495).toFixed(3))
  }

  return null
}

function parseCatalogCategories(catalog: { summaries?: unknown }): { category: string | null; subcategory: string | null } {
  const summaries = catalog.summaries
  if (Array.isArray(summaries) && summaries.length > 0) {
    const summary = summaries[0]
    if (summary && typeof summary === 'object') {
      const summaryRecord = summary as Record<string, unknown>
      const displayGroupRaw = summaryRecord.websiteDisplayGroupName
      const displayGroup =
        typeof displayGroupRaw === 'string' && displayGroupRaw.trim()
          ? sanitizeForDisplay(displayGroupRaw.trim())
          : null
      const normalizedCategory = displayGroup ? normalizeReferralCategory2026(displayGroup) : ''

      const browse = summaryRecord.browseClassification
      const browseDisplayRaw =
        browse && typeof browse === 'object' ? (browse as Record<string, unknown>).displayName : null
      const browseDisplay =
        typeof browseDisplayRaw === 'string' && browseDisplayRaw.trim()
          ? sanitizeForDisplay(browseDisplayRaw.trim())
          : null

      return { category: normalizedCategory ? normalizedCategory : null, subcategory: browseDisplay ?? null }
    }
  }
  return { category: null, subcategory: null }
}

function roundToTwoDecimals(value: number): number | null {
  if (!Number.isFinite(value)) return null
  return Number(value.toFixed(2))
}

export const GET = withRole(['admin', 'staff'], async (request, _session) => {
  // Test mode: compare FBA Inventory API vs Listings API
  if (request.nextUrl.searchParams.get('test') === 'compare-apis') {
    const tenantCode = await getCurrentTenantCode()
    const result = await testCompareApis(tenantCode)
    return ApiResponses.success({ testResult: result })
  }

  // Test mode: fetch fees for a specific ASIN
  // Use ?test-fees=ASIN to test with default price
  // Use ?test-fees=ASIN&price=8.99 to test with specific price
  // Use ?test-fees=ASIN&auto-price=1 to auto-fetch listing price from Amazon
  // Use ?test-fees=ASIN&debug-pricing=1 to see raw getPricing response
  const testAsin = request.nextUrl.searchParams.get('test-fees')
  if (testAsin) {
    try {
      const tenantCode = await getCurrentTenantCode()
      const priceParam = request.nextUrl.searchParams.get('price')
      const autoPrice = request.nextUrl.searchParams.get('auto-price') === '1'
      const debugPricing = request.nextUrl.searchParams.get('debug-pricing') === '1'
      let price: number
      let fetchedListingPrice: number | null = null
      let debugPricingResponse: unknown = null
      if (autoPrice || debugPricing) {
        // For debugging, we need to call the pricing API and capture the raw response
        const { getListingPriceDebug } = await import('@/lib/amazon/client')
        const result = await getListingPriceDebug(testAsin, tenantCode)
        fetchedListingPrice = result.price
        debugPricingResponse = debugPricing ? result.rawResponse : undefined
        price = fetchedListingPrice ?? (priceParam ? Number.parseFloat(priceParam) : DEFAULT_FEE_ESTIMATE_PRICE)
      } else {
        price = priceParam ? Number.parseFloat(priceParam) : DEFAULT_FEE_ESTIMATE_PRICE
      }
      const fees = await getProductFees(testAsin, price, tenantCode)
      const parsedFees = parseAmazonProductFees(fees)
      return ApiResponses.success({
        raw: fees,
        parsed: parsedFees,
        priceUsed: price,
        fetchedListingPrice,
        ...(debugPricing ? { debugPricingResponse } : {}),
      })
    } catch (error) {
      return ApiResponses.success({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
  }

  const parsed = previewQuerySchema.safeParse({
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
  })
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const previewLimit = parsed.data.limit ?? 250
  const tenantCode = await getCurrentTenantCode()
  const prisma = await getTenantPrisma()

  const listingResponse = await getListingsItems(tenantCode, { limit: previewLimit })
  const listings = listingResponse.items

  const normalizedCodes = listings
    .map(item => normalizeSkuCode(item.sellerSku))
    .filter((code): code is string => Boolean(code))

  const existingSkus = normalizedCodes.length
    ? await prisma.sku.findMany({
        where: { skuCode: { in: normalizedCodes } },
        select: { skuCode: true },
      })
    : []

  const existingSet = new Set(existingSkus.map(sku => sku.skuCode.toUpperCase()))
  const duplicates = new Set<string>()
  const seen = new Set<string>()

  for (const code of normalizedCodes) {
    const key = code.toUpperCase()
    if (seen.has(key)) duplicates.add(key)
    else seen.add(key)
  }

  const rawItems = listings.map(listing => {
    const skuCode = normalizeSkuCode(listing.sellerSku)
    const asin = normalizeAsin(listing.asin)
    const title = normalizeTitle(listing.title)

    if (!skuCode) {
      return {
        sellerSku: listing.sellerSku,
        skuCode: null,
        asin,
        title,
        status: 'blocked' as const,
        reason: 'Invalid SKU code (empty or too long)',
        exists: false,
      }
    }

    if (duplicates.has(skuCode.toUpperCase())) {
      return {
        sellerSku: listing.sellerSku,
        skuCode,
        asin,
        title,
        status: 'blocked' as const,
        reason: 'Duplicate seller SKU after normalization',
        exists: false,
      }
    }

    if (existingSet.has(skuCode.toUpperCase())) {
      return {
        sellerSku: listing.sellerSku,
        skuCode,
        asin,
        title,
        status: 'existing' as const,
        reason: 'Already in Talos (will refresh Amazon data)',
        exists: true,
      }
    }

    if (!asin) {
      return {
        sellerSku: listing.sellerSku,
        skuCode,
        asin,
        title,
        status: 'blocked' as const,
        reason: 'Missing ASIN on Amazon listing',
        exists: false,
      }
    }

    return {
      sellerSku: listing.sellerSku,
      skuCode,
      asin,
      title,
      status: 'new' as const,
      reason: null as string | null,
      exists: false,
    }
  })

  const asinsForClassification: string[] = []
  const seenAsins = new Set<string>()

  for (const item of rawItems) {
    if (!item.asin) continue
    const key = item.asin.toUpperCase()
    if (seenAsins.has(key)) continue
    seenAsins.add(key)
    asinsForClassification.push(key)
  }

  const listingTypesByAsin = asinsForClassification.length
    ? await getCatalogListingTypesByAsin(asinsForClassification, tenantCode)
    : new Map<string, AmazonCatalogListingType>()

  const items = rawItems.map(item => {
    const asinKey = item.asin ? item.asin.toUpperCase() : null
    let listingType: AmazonCatalogListingType = 'UNKNOWN'
    if (asinKey) {
      const resolved = listingTypesByAsin.get(asinKey)
      if (resolved) listingType = resolved
    }

    if (item.status === 'new' && listingType === 'PARENT') {
      return {
        ...item,
        listingType,
        status: 'blocked' as const,
        reason: 'Variation parent ASIN (import child listings only)',
      }
    }

    return { ...item, listingType }
  })

  const summary = items.reduce(
    (acc, item) => {
      if (item.status === 'new') acc.newCount += 1
      if (item.status === 'existing') acc.existingCount += 1
      if (item.status === 'blocked') acc.blockedCount += 1
      return acc
    },
    { newCount: 0, existingCount: 0, blockedCount: 0 }
  )

  return ApiResponses.success({
    preview: {
      limit: previewLimit,
      totalListings: listings.length,
      hasMore: listingResponse.hasMore,
      summary,
      policy: {
        updatesExistingSkus: false,
        createsBatch: true,
        defaultBatchCode: DEFAULT_BATCH_CODE,
      },
      items,
    },
  })
})

export const POST = withRole(['admin', 'staff'], async (request, _session) => {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const importLimit = parsed.data.limit ?? 50
  const mode = parsed.data.mode
  const tenantCode = await getCurrentTenantCode()
  const prisma = await getTenantPrisma()

  const listingResponse = await getListingsItems(tenantCode, { limit: 250 })
  const listings = listingResponse.items

  const listingBySkuCode = new Map<string, (typeof listings)[number]>()
  for (const listing of listings) {
    const skuCode = normalizeSkuCode(listing.sellerSku)
    if (!skuCode) continue
    const key = skuCode.toUpperCase()
    if (!listingBySkuCode.has(key)) {
      listingBySkuCode.set(key, listing)
    }
  }

  const candidateSkus = listings
    .map(item => item.sellerSku.trim())
    .filter(Boolean)
    .map(code => normalizeSkuCode(code) ?? '')
    .filter(Boolean)

  const selectedSkuCodes = parsed.data.skuCodes?.length
    ? parsed.data.skuCodes.map(code => normalizeSkuCode(code) ?? '').filter(Boolean)
    : null

  if (candidateSkus.length === 0 || (selectedSkuCodes && selectedSkuCodes.length === 0)) {
    return ApiResponses.success({
      result: {
        imported: 0,
        skipped: 0,
        errors: ['No Amazon listings found to import'],
      },
    })
  }

  const existingSkus = await prisma.sku.findMany({
    where: { skuCode: { in: candidateSkus } },
    select: {
      id: true,
      skuCode: true,
      itemDimensionsCm: true,
      itemSide1Cm: true,
      itemSide2Cm: true,
      itemSide3Cm: true,
      itemWeightKg: true,
    },
  })
  const existingSkuByCode = new Map<string, (typeof existingSkus)[number]>()
  for (const sku of existingSkus) {
    existingSkuByCode.set(sku.skuCode.toUpperCase(), sku)
  }
  const existingSet = new Set(existingSkus.map(sku => sku.skuCode.toUpperCase()))

  let imported = 0
  let skipped = 0
  const errors: string[] = []
  const details: Array<{
    skuCode: string
    status: 'imported' | 'skipped' | 'blocked'
    message?: string
    unitWeightKg?: number | null
    unitDimensionsCm?: string | null
    feeDebug?: {
      referralFeePercent: number | null
      fbaFee: number | null
      sizeTier: string | null
    }
  }> = []

  const targets: string[] = []
  if (selectedSkuCodes) {
    targets.push(...selectedSkuCodes)
  } else {
    for (const listing of listings) {
      if (targets.length >= importLimit) break
      const skuCode = normalizeSkuCode(listing.sellerSku)
      if (!skuCode) continue
      if (existingSet.has(skuCode.toUpperCase())) continue
      targets.push(skuCode)
    }
  }

  if (targets.length === 0) {
    return ApiResponses.success({
      result: {
        imported: 0,
        skipped: 0,
        errors: ['No new SKUs found to import'],
      },
    })
  }

  const targetAsins: string[] = []
  const targetAsinSeen = new Set<string>()

  for (const target of targets) {
    const skuCode = normalizeSkuCode(target)
    if (!skuCode) continue
    const listing = listingBySkuCode.get(skuCode.toUpperCase())
    if (!listing) continue
    const asin = normalizeAsin(listing.asin)
    if (!asin) continue
    const key = asin.toUpperCase()
    if (targetAsinSeen.has(key)) continue
    targetAsinSeen.add(key)
    targetAsins.push(key)
  }

  const listingTypesByAsin = targetAsins.length
    ? await getCatalogListingTypesByAsin(targetAsins, tenantCode)
    : new Map<string, AmazonCatalogListingType>()

  for (const targetSkuCode of targets) {
    if (mode === 'import' && imported >= importLimit) break

    const skuCode = normalizeSkuCode(targetSkuCode)
    if (!skuCode) continue

    const listing = listingBySkuCode.get(skuCode.toUpperCase())
    if (!listing) {
      skipped += 1
      details.push({
        skuCode,
        status: 'blocked',
        message: 'SKU not found in current Amazon listings preview',
      })
      continue
    }

    const isExistingSku = existingSet.has(skuCode.toUpperCase())

    const asin = normalizeAsin(listing.asin)
    if (!asin) {
      skipped += 1
      errors.push(`Skipping ${skuCode}: ASIN missing on Amazon listing`)
      details.push({
        skuCode,
        status: 'blocked',
        message: 'Missing ASIN on Amazon listing',
      })
      continue
    }

    let listingType: AmazonCatalogListingType = 'UNKNOWN'
    const resolvedListingType = listingTypesByAsin.get(asin.toUpperCase())
    if (resolvedListingType) listingType = resolvedListingType
    if (listingType === 'PARENT') {
      skipped += 1
      details.push({
        skuCode,
        status: 'blocked',
        message: 'Variation parent ASIN (import child listings only)',
      })
      continue
    }

    let description = listing.title ? sanitizeForDisplay(listing.title.trim()) : ''
    let unitWeightKg: number | null = null
    let unitTriplet: { side1Cm: number; side2Cm: number; side3Cm: number } | null = null
    let itemWeightKg: number | null = null
    let itemTriplet: { side1Cm: number; side2Cm: number; side3Cm: number } | null = null
    let amazonCategory: string | null = null
    let amazonSubcategory: string | null = null
    let amazonReferralFeePercent: number | null = null
    let amazonFbaFulfillmentFee: number | null = null
    let amazonSizeTier: string | null = null
    let amazonListingPrice: number | null = null

    try {
      const catalog = await getCatalogItem(asin, tenantCode)
      const attributes = catalog.attributes
      if (attributes) {
        const title = attributes.item_name?.[0]?.value
        if (title) {
          const sanitizedTitle = sanitizeForDisplay(title)
          if (sanitizedTitle) {
            description = sanitizedTitle
          }
        }
        unitWeightKg = parseCatalogItemPackageWeightKg(attributes)
        unitTriplet = parseCatalogItemPackageDimensions(attributes)
        itemWeightKg = parseCatalogItemWeightKg(attributes)
        itemTriplet = parseCatalogItemDimensions(attributes)
      }
      const categories = parseCatalogCategories(catalog)
      amazonCategory = categories.category
      amazonSubcategory = categories.subcategory
    } catch (error) {
      errors.push(
        `Amazon catalog lookup failed for ${skuCode} (ASIN ${asin}): ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }

    const calculatedSizeTier = calculateSizeTier(
      unitTriplet?.side1Cm ?? null,
      unitTriplet?.side2Cm ?? null,
      unitTriplet?.side3Cm ?? null,
      unitWeightKg
    )
    if (calculatedSizeTier) {
      amazonSizeTier = calculatedSizeTier
    }

    try {
      // Fetch actual listing price to get accurate Low-Price FBA rates for products under $10
      const fetchedListingPrice = await getListingPrice(asin, tenantCode)
      if (fetchedListingPrice === null) {
        throw new Error('Amazon listing price unavailable for fee estimation')
      }

      amazonListingPrice = roundToTwoDecimals(fetchedListingPrice)

      if (amazonCategory !== null) {
        amazonReferralFeePercent = getReferralFeePercent2026(amazonCategory, fetchedListingPrice)
      }

      const fees = await getProductFees(asin, fetchedListingPrice, tenantCode)
      const parsedFees = parseAmazonProductFees(fees)
      amazonFbaFulfillmentFee = roundToTwoDecimals(parsedFees.fbaFees ?? Number.NaN)
      if (amazonSizeTier === null && parsedFees.sizeTier) {
        amazonSizeTier = parsedFees.sizeTier
      }
    } catch (error) {
      errors.push(
        `Amazon fee estimate failed for ${skuCode} (ASIN ${asin}): ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }

    if (!description) description = skuCode
    if (description.length > SKU_FIELD_LIMITS.DESCRIPTION_MAX) {
      description = description.substring(0, SKU_FIELD_LIMITS.DESCRIPTION_MAX)
    }

    const unitDimensionsCm = unitTriplet ? formatDimensionTripletCm(unitTriplet) : null
    const itemDimensionsCm = itemTriplet ? formatDimensionTripletCm(itemTriplet) : null

    if (mode === 'validate') {
      imported += 1
      details.push({
        skuCode,
        status: 'imported',
        message: isExistingSku ? 'Will refresh Amazon data' : undefined,
        unitWeightKg,
        unitDimensionsCm,
      })
      continue
    }

    try {
      if (isExistingSku) {
        const existingSku = existingSkuByCode.get(skuCode.toUpperCase()) ?? null
        let shouldSetItemDimensions = false
        let shouldSetItemWeight = false

        if (existingSku) {
          const hasItemDimensions =
            existingSku.itemDimensionsCm !== null ||
            existingSku.itemSide1Cm !== null ||
            existingSku.itemSide2Cm !== null ||
            existingSku.itemSide3Cm !== null

          if (!hasItemDimensions && itemTriplet && itemDimensionsCm) {
            shouldSetItemDimensions = true
          }

          if (existingSku.itemWeightKg === null && itemWeightKg !== null) {
            shouldSetItemWeight = true
          }
        } else {
          if (itemTriplet && itemDimensionsCm) {
            shouldSetItemDimensions = true
          }
          if (itemWeightKg !== null) {
            shouldSetItemWeight = true
          }
        }

        const skuUpdateData: Prisma.SkuUpdateInput = { description }

        if (amazonCategory !== null) skuUpdateData.amazonCategory = amazonCategory
        if (amazonSubcategory !== null) skuUpdateData.amazonSubcategory = amazonSubcategory
        if (amazonSizeTier !== null) skuUpdateData.amazonSizeTier = amazonSizeTier
        if (amazonReferralFeePercent !== null) skuUpdateData.amazonReferralFeePercent = amazonReferralFeePercent
        if (amazonFbaFulfillmentFee !== null) skuUpdateData.amazonFbaFulfillmentFee = amazonFbaFulfillmentFee
        if (amazonListingPrice !== null) skuUpdateData.amazonListingPrice = amazonListingPrice

        if (shouldSetItemDimensions && itemTriplet) {
          skuUpdateData.itemDimensionsCm = itemDimensionsCm
          skuUpdateData.itemSide1Cm = itemTriplet.side1Cm
          skuUpdateData.itemSide2Cm = itemTriplet.side2Cm
          skuUpdateData.itemSide3Cm = itemTriplet.side3Cm
        }

        if (shouldSetItemWeight) {
          skuUpdateData.itemWeightKg = itemWeightKg
        }

        // Update existing SKU with fresh Amazon data (only Amazon-sourced fields)
        await prisma.sku.update({
          where: { skuCode },
          data: skuUpdateData,
        })

        if (!existingSku) {
          throw new Error(`SKU not found during import: ${skuCode}`)
        }

        const batchUpdateData: Prisma.SkuBatchUpdateInput = {}
        if (unitTriplet) {
          batchUpdateData.amazonItemPackageDimensionsCm = unitDimensionsCm
          batchUpdateData.amazonItemPackageSide1Cm = unitTriplet.side1Cm
          batchUpdateData.amazonItemPackageSide2Cm = unitTriplet.side2Cm
          batchUpdateData.amazonItemPackageSide3Cm = unitTriplet.side3Cm
        }
        if (unitWeightKg !== null) {
          batchUpdateData.amazonReferenceWeightKg = unitWeightKg
        }
        if (amazonSizeTier !== null) {
          batchUpdateData.amazonSizeTier = amazonSizeTier
        }
        if (amazonFbaFulfillmentFee !== null) {
          batchUpdateData.amazonFbaFulfillmentFee = amazonFbaFulfillmentFee
        }

        if (Object.keys(batchUpdateData).length > 0) {
          const latestBatch = await prisma.skuBatch.findFirst({
            where: { skuId: existingSku.id, isActive: true },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          })
          if (!latestBatch) {
            throw new Error(`No active batch found for SKU: ${skuCode}`)
          }

          await prisma.skuBatch.update({
            where: { id: latestBatch.id },
            data: batchUpdateData,
          })
        }

        imported += 1
        details.push({
          skuCode,
          status: 'imported',
          message: 'Refreshed Amazon data',
          unitWeightKg,
          unitDimensionsCm,
          feeDebug: {
            referralFeePercent: amazonReferralFeePercent,
            fbaFee: amazonFbaFulfillmentFee,
            sizeTier: amazonSizeTier,
          },
        })
      } else {
        // Create new SKU
        await prisma.$transaction(async tx => {
          const createdSku = await tx.sku.create({
            data: {
              skuCode,
              asin,
              description,
              amazonCategory,
              amazonSubcategory,
              amazonSizeTier,
              amazonReferralFeePercent,
              amazonFbaFulfillmentFee,
              amazonListingPrice,
              amazonReferenceWeightKg: null,
              packSize: DEFAULT_PACK_SIZE,
              defaultSupplierId: null,
              secondarySupplierId: null,
              material: null,
              unitDimensionsCm: null,
              unitSide1Cm: null,
              unitSide2Cm: null,
              unitSide3Cm: null,
              unitWeightKg: null,
              itemDimensionsCm,
              itemSide1Cm: itemTriplet ? itemTriplet.side1Cm : null,
              itemSide2Cm: itemTriplet ? itemTriplet.side2Cm : null,
              itemSide3Cm: itemTriplet ? itemTriplet.side3Cm : null,
              itemWeightKg,
              unitsPerCarton: DEFAULT_UNITS_PER_CARTON,
              cartonDimensionsCm: null,
              cartonSide1Cm: null,
              cartonSide2Cm: null,
              cartonSide3Cm: null,
              cartonWeightKg: null,
              packagingType: null,
              isActive: true,
            },
          })

          await tx.skuBatch.create({
            data: {
              skuId: createdSku.id,
              batchCode: DEFAULT_BATCH_CODE,
              description: null,
              productionDate: null,
              expiryDate: null,
              packSize: DEFAULT_PACK_SIZE,
              unitsPerCarton: DEFAULT_UNITS_PER_CARTON,
              material: null,
              // Note: Batch item package dimensions are for packaging, not product dimensions
              // Amazon catalog gives product dimensions, not packaging - leave null
              unitDimensionsCm: null,
              unitSide1Cm: null,
              unitSide2Cm: null,
              unitSide3Cm: null,
              unitWeightKg: null,
              cartonDimensionsCm: null,
              cartonSide1Cm: null,
              cartonSide2Cm: null,
              cartonSide3Cm: null,
              cartonWeightKg: null,
              packagingType: null,
              amazonItemPackageDimensionsCm: unitDimensionsCm,
              amazonItemPackageSide1Cm: unitTriplet ? unitTriplet.side1Cm : null,
              amazonItemPackageSide2Cm: unitTriplet ? unitTriplet.side2Cm : null,
              amazonItemPackageSide3Cm: unitTriplet ? unitTriplet.side3Cm : null,
              amazonSizeTier,
              amazonFbaFulfillmentFee,
              amazonReferenceWeightKg: unitWeightKg,
              storageCartonsPerPallet: DEFAULT_CARTONS_PER_PALLET,
              shippingCartonsPerPallet: DEFAULT_CARTONS_PER_PALLET,
              isActive: true,
            },
          })
        })

        imported += 1
        existingSet.add(skuCode.toUpperCase())
        details.push({
          skuCode,
          status: 'imported',
          unitWeightKg,
          unitDimensionsCm,
          feeDebug: {
            referralFeePercent: amazonReferralFeePercent,
            fbaFee: amazonFbaFulfillmentFee,
            sizeTier: amazonSizeTier,
          },
        })
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        skipped += 1
        existingSet.add(skuCode.toUpperCase())
        details.push({
          skuCode,
          status: 'skipped',
          message: 'Already exists in Talos (not updated)',
          unitWeightKg,
          unitDimensionsCm,
        })
        continue
      }

      skipped += 1
      errors.push(
        `Failed to import ${skuCode}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      details.push({
        skuCode,
        status: 'blocked',
        message: error instanceof Error ? error.message : 'Unknown error',
        unitWeightKg,
        unitDimensionsCm,
      })
    }
  }

  if (listingResponse.hasMore && imported < importLimit && !selectedSkuCodes) {
    errors.push('More Amazon listings exist. Run import again to continue.')
  }

  return ApiResponses.success({
    result: {
      imported,
      skipped,
      errors,
      details,
    },
  })
})
