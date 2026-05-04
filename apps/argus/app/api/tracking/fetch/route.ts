import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { parseArgusMarket, type ArgusMarket } from '@/lib/argus-market'
import { getCompetitivePricing, getCatalogItemWithRanks } from '@/lib/sp-api'

function extractBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ? match[1].trim() : null
}

function requireCronAuth(request: NextRequest): NextResponse | null {
  const expected = process.env.ARGUS_TRACKING_FETCH_TOKEN?.trim()
  if (!expected) {
    return NextResponse.json({ error: 'Missing ARGUS_TRACKING_FETCH_TOKEN' }, { status: 500 })
  }

  const provided = extractBearerToken(request.headers.get('authorization'))
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

function marketplaceForMarket(market: ArgusMarket): 'US' | 'UK' {
  if (market === 'us') return 'US'
  if (market === 'uk') return 'UK'
  throw new Error(`Unsupported Argus market: ${market}`)
}

export async function POST(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  const body = await request.json().catch(() => ({}))
  const market = parseArgusMarket(request.nextUrl.searchParams.get('market'))
  const marketplace = marketplaceForMarket(market)
  const triggeredBy = (body as { triggeredBy?: string }).triggeredBy ?? 'manual'

  // Create a fetch run record
  const run = await prisma.trackingFetchRun.create({
    data: { triggeredBy },
  })

  const enabledAsins = await prisma.trackedAsin.findMany({
    where: { enabled: true, marketplace },
  })

  if (enabledAsins.length === 0) {
    await prisma.trackingFetchRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: 'SUCCEEDED',
        asinCount: 0,
      },
    })
    return NextResponse.json({ runId: run.id, market, marketplace, asinCount: 0, errorCount: 0 })
  }

  const asinStrings = enabledAsins.map((a) => a.asin)
  const errors: Array<{ asin: string; error: string }> = []

  // Step 1: Get competitive pricing for all ASINs (batched)
  let pricingResults: Awaited<ReturnType<typeof getCompetitivePricing>> = []
  try {
    pricingResults = await getCompetitivePricing(asinStrings, market)
  } catch (err) {
    errors.push({ asin: '*', error: `Pricing batch failed: ${err instanceof Error ? err.message : String(err)}` })
  }

  // Index pricing results by ASIN
  const pricingByAsin = new Map(pricingResults.map((p) => [p.asin, p]))

  // Step 2: Get catalog data for each ASIN (for title, brand, image, and catalog-based BSR)
  const catalogByAsin = new Map<string, Awaited<ReturnType<typeof getCatalogItemWithRanks>>>()
  for (const asin of asinStrings) {
    try {
      const catalog = await getCatalogItemWithRanks(asin, market)
      catalogByAsin.set(asin, catalog)
    } catch (err) {
      errors.push({ asin, error: `Catalog failed: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  // Step 3: Create snapshots and update TrackedAsin metadata
  const now = new Date()

  for (const tracked of enabledAsins) {
    const pricing = pricingByAsin.get(tracked.asin)
    const catalog = catalogByAsin.get(tracked.asin)

    // Prefer pricing BSR (from getCompetitivePricing) but fall back to catalog BSR
    const bsrRoot = pricing?.bsrRoot ?? catalog?.bsrRoot ?? null
    const bsrRootCategory = pricing?.bsrRootCategory ?? catalog?.bsrRootCategory ?? null
    const bsrSub = pricing?.bsrSub ?? catalog?.bsrSub ?? null
    const bsrSubCategory = pricing?.bsrSubCategory ?? catalog?.bsrSubCategory ?? null

    await prisma.trackingSnapshot.create({
      data: {
        trackedAsinId: tracked.id,
        capturedAt: now,
        landedPriceCents: pricing?.landedPriceCents ?? null,
        listingPriceCents: pricing?.listingPriceCents ?? null,
        shippingPriceCents: pricing?.shippingPriceCents ?? null,
        currencyCode: pricing?.currencyCode ?? null,
        offerCount: pricing?.offerCount ?? null,
        bsrRoot,
        bsrRootCategory,
        bsrSub,
        bsrSubCategory,
        title: catalog?.title ?? null,
        brand: catalog?.brand ?? null,
        rawPricing: pricing?.rawPricing ?? undefined,
        rawCatalog: catalog?.rawCatalog ?? undefined,
      },
    })

    // Update the TrackedAsin's brand/imageUrl if we got new data
    const updates: Record<string, unknown> = {}
    if (catalog?.brand && !tracked.brand) updates.brand = catalog.brand
    if (catalog?.imageUrl && !tracked.imageUrl) updates.imageUrl = catalog.imageUrl
    if (Object.keys(updates).length > 0) {
      await prisma.trackedAsin.update({
        where: { id: tracked.id },
        data: updates,
      })
    }
  }

  // Finalize the run
  await prisma.trackingFetchRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      status: errors.length > 0 ? 'FAILED' : 'SUCCEEDED',
      asinCount: enabledAsins.length,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    },
  })

  return NextResponse.json({
    runId: run.id,
    market,
    marketplace,
    asinCount: enabledAsins.length,
    errorCount: errors.length,
    errors,
  })
}
