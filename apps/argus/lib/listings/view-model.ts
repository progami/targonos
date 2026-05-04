import { formatAmazonTitleLabel, formatProductLabel } from '@/lib/product-labels'

interface ListingRevisionCounts {
  snapshots: number
  titleRevisions: number
  bulletsRevisions: number
  galleryRevisions: number
  videoRevisions: number
  ebcRevisions: number
}

export interface ListingTableSource {
  id: string
  asin: string
  marketplace: string
  label: string
  brandName: string | null
  enabled: boolean
  createdAt: Date
  updatedAt: Date
  titleRevisions: Array<{ title: string }>
  _count: ListingRevisionCounts
}

export interface ListingTableRow {
  id: string
  asin: string
  marketplace: string
  displayName: string
  brandName: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
  needsMetadataRefresh: boolean
  revisionTotal: number
  counts: ListingRevisionCounts
}

export interface ListingsViewModel {
  rows: ListingTableRow[]
  totalListings: number
  totalSnapshots: number
  totalRevisions: number
  metadataRefreshCount: number
}

function revisionTotal(counts: ListingRevisionCounts): number {
  return counts.titleRevisions + counts.bulletsRevisions + counts.galleryRevisions + counts.videoRevisions + counts.ebcRevisions
}

function latestTitle(listing: ListingTableSource): string | null {
  const revision = listing.titleRevisions[0]
  if (revision === undefined) return null
  return revision.title
}

function clean(value: string | null): string {
  if (value === null) return ''
  return value.trim()
}

function labelIsGeneric(label: string, asin: string, brandName: string): boolean {
  if (label.length === 0) return true
  if (label.toUpperCase() === asin) return true
  if (brandName.length === 0) return false
  return label.toLowerCase() === brandName.toLowerCase()
}

function formatListingDisplayName(listing: ListingTableSource): string {
  const asin = listing.asin.trim().toUpperCase()
  const label = listing.label.trim()
  const brandName = clean(listing.brandName)
  const title = latestTitle(listing)

  if (!labelIsGeneric(label, asin, brandName)) return label

  if (title !== null && title.trim().length > 0) {
    return formatAmazonTitleLabel({
      asin,
      brandName,
      title,
    })
  }

  return formatProductLabel({
    asin,
    label,
    brandName,
  })
}

function needsMetadataRefresh(listing: ListingTableSource, displayName: string): boolean {
  const asin = listing.asin.trim().toUpperCase()
  if (displayName === asin) return true
  const brandName = clean(listing.brandName)
  if (brandName.length === 0) return false
  const title = latestTitle(listing)
  if (title !== null && title.trim().length > 0) return false
  return displayName.toLowerCase() === brandName.toLowerCase()
}

export function buildListingsViewModel(listings: ListingTableSource[]): ListingsViewModel {
  let totalSnapshots = 0
  let totalRevisions = 0
  let metadataRefreshCount = 0

  const rows = listings.map((listing) => {
    const counts = listing._count
    const nextRevisionTotal = revisionTotal(counts)
    const displayName = formatListingDisplayName(listing)
    const nextNeedsMetadataRefresh = needsMetadataRefresh(listing, displayName)

    totalSnapshots += counts.snapshots
    totalRevisions += nextRevisionTotal
    if (nextNeedsMetadataRefresh) metadataRefreshCount += 1

    return {
      id: listing.id,
      asin: listing.asin.trim().toUpperCase(),
      marketplace: listing.marketplace,
      displayName,
      brandName: listing.brandName,
      enabled: listing.enabled,
      createdAt: listing.createdAt.toISOString(),
      updatedAt: listing.updatedAt.toISOString(),
      needsMetadataRefresh: nextNeedsMetadataRefresh,
      revisionTotal: nextRevisionTotal,
      counts,
    }
  })

  return {
    rows,
    totalListings: listings.length,
    totalSnapshots,
    totalRevisions,
    metadataRefreshCount,
  }
}
