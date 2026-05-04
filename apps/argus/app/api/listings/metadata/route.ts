import { NextResponse } from 'next/server'
import { RevisionOrigin } from '@targon/prisma-argus'
import prisma from '@/lib/db'
import { getCatalogItemWithRanks } from '@/lib/sp-api'
import { buildListingMetadataUpdate } from '@/lib/listings/metadata'

function clean(value: string | null): string {
  if (value === null) return ''
  return value.trim()
}

export async function POST() {
  const listings = await prisma.listing.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      asin: true,
      label: true,
      brandName: true,
      titleRevisions: {
        orderBy: { seq: 'desc' },
        take: 1,
        select: { seq: true, title: true },
      },
    },
  })

  let refreshed = 0

  for (const listing of listings) {
    const catalog = await getCatalogItemWithRanks(listing.asin)
    const data = buildListingMetadataUpdate(listing, catalog)
    const catalogTitle = clean(catalog.title)
    const latestTitle = listing.titleRevisions[0]
    let titleRevisionId: string | null = null

    if (catalogTitle.length > 0) {
      let shouldCreateTitleRevision = false
      if (latestTitle === undefined) {
        shouldCreateTitleRevision = true
      } else if (latestTitle.title !== catalogTitle) {
        shouldCreateTitleRevision = true
      }

      if (shouldCreateTitleRevision) {
        const seq = latestTitle === undefined ? 1 : latestTitle.seq + 1
        const titleRevision = await prisma.titleRevision.create({
          data: {
            listingId: listing.id,
            seq,
            title: catalogTitle,
            origin: RevisionOrigin.CAPTURED_SNAPSHOT,
            note: 'Catalog metadata refresh',
          },
          select: { id: true },
        })
        titleRevisionId = titleRevision.id
      }
    }

    if (titleRevisionId !== null) {
      data.activeTitleId = titleRevisionId
    }

    const keys = Object.keys(data)
    if (keys.length === 0) continue

    await prisma.listing.update({ where: { id: listing.id }, data })
    refreshed += 1
  }

  return NextResponse.json({ refreshed, total: listings.length })
}
