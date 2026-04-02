import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  const asins = await prisma.trackedAsin.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      snapshots: {
        orderBy: { capturedAt: 'desc' },
        take: 2, // Latest + previous for 24h delta
      },
    },
  })

  const lastRun = await prisma.trackingFetchRun.findFirst({
    orderBy: { startedAt: 'desc' },
  })

  const rows = asins.map((a) => {
    const latest = a.snapshots[0] ?? null
    const previous = a.snapshots[1] ?? null

    const priceDelta =
      latest?.landedPriceCents != null && previous?.landedPriceCents != null
        ? latest.landedPriceCents - previous.landedPriceCents
        : null

    const bsrDelta =
      latest?.bsrRoot != null && previous?.bsrRoot != null
        ? latest.bsrRoot - previous.bsrRoot
        : null

    return {
      id: a.id,
      asin: a.asin,
      marketplace: a.marketplace,
      ownership: a.ownership,
      label: a.label,
      brand: a.brand,
      imageUrl: a.imageUrl,
      enabled: a.enabled,
      createdAt: a.createdAt,
      // Current values
      price: latest?.landedPriceCents ?? null,
      listingPrice: latest?.listingPriceCents ?? null,
      currencyCode: latest?.currencyCode ?? null,
      bsrRoot: latest?.bsrRoot ?? null,
      bsrRootCategory: latest?.bsrRootCategory ?? null,
      bsrSub: latest?.bsrSub ?? null,
      bsrSubCategory: latest?.bsrSubCategory ?? null,
      offerCount: latest?.offerCount ?? null,
      lastUpdated: latest?.capturedAt ?? null,
      // 24h deltas
      priceDelta,
      bsrDelta,
    }
  })

  const oursCount = asins.filter((a) => a.ownership === 'OURS').length
  const competitorCount = asins.filter((a) => a.ownership === 'COMPETITOR').length

  return NextResponse.json({
    totalAsins: asins.length,
    oursCount,
    competitorCount,
    lastFetchAt: lastRun?.finishedAt ?? lastRun?.startedAt ?? null,
    lastFetchStatus: lastRun?.status ?? null,
    rows,
  })
}
