import 'server-only'
import { callAmazonApi } from '@targon/amazon-sp-api'

const MARKETPLACE_ID = process.env.AMAZON_MARKETPLACE_ID!

// ─── Types ──────────────────────────────────────────────────────

type SalesRanking = {
  ProductCategoryId?: string
  Rank?: number
}

type CompetitivePriceItem = {
  ASIN?: string
  status?: string
  Product?: {
    CompetitivePricing?: {
      CompetitivePrices?: Array<{
        condition?: string
        CompetitivePriceId?: string
        Price?: {
          LandedPrice?: { Amount?: number; CurrencyCode?: string }
          ListingPrice?: { Amount?: number; CurrencyCode?: string }
          Shipping?: { Amount?: number; CurrencyCode?: string }
        }
      }>
      NumberOfOfferListings?: Array<{
        condition?: string
        Count?: number
      }>
    }
    SalesRankings?: SalesRanking[]
  }
}

type CatalogItemResponse = {
  asin?: string
  summaries?: Array<{
    marketplaceId?: string
    brand?: string
    brandName?: string
    itemName?: string
    mainImage?: { link?: string; width?: number; height?: number }
  }>
  images?: Array<{
    marketplaceId?: string
    images?: Array<{
      link?: string
      url?: string
      variant?: string
      width?: number
      height?: number
    }>
  }>
  salesRanks?: Array<{
    marketplaceId?: string
    classificationRanks?: Array<{
      classificationId?: string
      title?: string
      rank?: number
    }>
    displayGroupRanks?: Array<{
      websiteDisplayGroup?: string
      title?: string
      rank?: number
    }>
  }>
}

export type CompetitivePricingResult = {
  asin: string
  landedPriceCents: number | null
  listingPriceCents: number | null
  shippingPriceCents: number | null
  currencyCode: string | null
  offerCount: number | null
  bsrRoot: number | null
  bsrRootCategory: string | null
  bsrSub: number | null
  bsrSubCategory: string | null
  rawPricing: unknown
}

export type CatalogResult = {
  asin: string
  title: string | null
  brand: string | null
  imageUrl: string | null
  bsrRoot: number | null
  bsrRootCategory: string | null
  bsrSub: number | null
  bsrSubCategory: string | null
  rawCatalog: unknown
}

// ─── Helpers ────────────────────────────────────────────────────

function dollarsToCents(amount: number | undefined | null): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null
  return Math.round(amount * 100)
}

function parseSalesRankings(rankings: SalesRanking[] | undefined): {
  bsrRoot: number | null
  bsrRootCategory: string | null
  bsrSub: number | null
  bsrSubCategory: string | null
} {
  if (!rankings?.length) return { bsrRoot: null, bsrRootCategory: null, bsrSub: null, bsrSubCategory: null }

  // The first ranking is typically the root/display group, subsequent are subcategories
  let bsrRoot: number | null = null
  let bsrRootCategory: string | null = null
  let bsrSub: number | null = null
  let bsrSubCategory: string | null = null

  for (const ranking of rankings) {
    const catId = ranking.ProductCategoryId ?? ''
    const rank = ranking.Rank ?? null
    if (rank === null) continue

    // Root categories tend to have short IDs like "home_garden_display_on_website"
    // Sub-categories tend to have numeric IDs
    if (/^\d+$/.test(catId)) {
      if (bsrSub === null) {
        bsrSub = rank
        bsrSubCategory = catId
      }
    } else {
      if (bsrRoot === null) {
        bsrRoot = rank
        bsrRootCategory = catId
      }
    }
  }

  return { bsrRoot, bsrRootCategory, bsrSub, bsrSubCategory }
}

function parseCatalogSalesRanks(salesRanks: CatalogItemResponse['salesRanks']): {
  bsrRoot: number | null
  bsrRootCategory: string | null
  bsrSub: number | null
  bsrSubCategory: string | null
} {
  if (!salesRanks?.length) return { bsrRoot: null, bsrRootCategory: null, bsrSub: null, bsrSubCategory: null }

  let bsrRoot: number | null = null
  let bsrRootCategory: string | null = null
  let bsrSub: number | null = null
  let bsrSubCategory: string | null = null

  for (const group of salesRanks) {
    // displayGroupRanks are root-level (e.g., "Home & Kitchen")
    for (const dgr of group.displayGroupRanks ?? []) {
      if (bsrRoot === null && dgr.rank != null) {
        bsrRoot = dgr.rank
        bsrRootCategory = dgr.title ?? dgr.websiteDisplayGroup ?? null
      }
    }
    // classificationRanks are subcategory-level
    for (const cr of group.classificationRanks ?? []) {
      if (bsrSub === null && cr.rank != null) {
        bsrSub = cr.rank
        bsrSubCategory = cr.title ?? cr.classificationId ?? null
      }
    }
  }

  return { bsrRoot, bsrRootCategory, bsrSub, bsrSubCategory }
}

function pickCatalogImageUrl(images: CatalogItemResponse['images'], fallback: string | undefined): string | null {
  for (const group of images ?? []) {
    for (const image of group.images ?? []) {
      const value = image.link ?? image.url ?? null
      if (value) return value
    }
  }

  return fallback ?? null
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Fetch competitive pricing for up to 20 ASINs via the SP-API
 * getCompetitivePricing operation. Returns price, BSR, and offer count.
 */
export async function getCompetitivePricing(asins: string[]): Promise<CompetitivePricingResult[]> {
  const results: CompetitivePricingResult[] = []

  // SP-API allows up to 20 ASINs per request
  for (let i = 0; i < asins.length; i += 20) {
    const chunk = asins.slice(i, i + 20)

    const response = await callAmazonApi<CompetitivePriceItem[] | { payload?: CompetitivePriceItem[] }>(
      undefined,
      {
        operation: 'getCompetitivePricing',
        endpoint: 'productPricing',
        query: {
          MarketplaceId: MARKETPLACE_ID,
          ItemType: 'Asin',
          Asins: chunk,
          ItemCondition: 'New',
        },
      }
    )

    const items: CompetitivePriceItem[] = Array.isArray(response)
      ? response
      : (response as { payload?: CompetitivePriceItem[] }).payload ?? []

    for (const item of items) {
      const asin = item.ASIN ?? ''
      if (item.status !== 'Success') {
        results.push({
          asin,
          landedPriceCents: null,
          listingPriceCents: null,
          shippingPriceCents: null,
          currencyCode: null,
          offerCount: null,
          bsrRoot: null,
          bsrRootCategory: null,
          bsrSub: null,
          bsrSubCategory: null,
          rawPricing: item,
        })
        continue
      }

      const cp = item.Product?.CompetitivePricing
      const price = cp?.CompetitivePrices?.[0]?.Price
      const offerListings = cp?.NumberOfOfferListings ?? []
      const newOffers = offerListings.find((o) => o.condition === 'New')
      const bsr = parseSalesRankings(item.Product?.SalesRankings)

      results.push({
        asin,
        landedPriceCents: dollarsToCents(price?.LandedPrice?.Amount),
        listingPriceCents: dollarsToCents(price?.ListingPrice?.Amount),
        shippingPriceCents: dollarsToCents(price?.Shipping?.Amount),
        currencyCode: price?.LandedPrice?.CurrencyCode ?? price?.ListingPrice?.CurrencyCode ?? null,
        offerCount: newOffers?.Count ?? null,
        ...bsr,
        rawPricing: item,
      })
    }
  }

  return results
}

/**
 * Fetch catalog item details with sales ranks for a single ASIN.
 * Returns title, brand, image, and BSR data.
 */
export async function getCatalogItemWithRanks(asin: string): Promise<CatalogResult> {
  const response = await callAmazonApi<CatalogItemResponse>(undefined, {
    operation: 'getCatalogItem',
    endpoint: 'catalogItems',
    options: { version: '2022-04-01' },
    path: { asin },
    query: {
      marketplaceIds: [MARKETPLACE_ID],
      includedData: ['summaries', 'salesRanks', 'images'],
    },
  })

  const summary = response.summaries?.[0]
  const bsr = parseCatalogSalesRanks(response.salesRanks)

  return {
    asin,
    title: summary?.itemName ?? null,
    brand: summary?.brand ?? summary?.brandName ?? null,
    imageUrl: pickCatalogImageUrl(response.images, summary?.mainImage?.link),
    ...bsr,
    rawCatalog: response,
  }
}
