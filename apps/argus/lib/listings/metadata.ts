import { formatAmazonTitleLabel } from '@/lib/product-labels'

export interface ListingMetadataSource {
  asin: string
  label: string
  brandName: string | null
}

export interface CatalogIdentitySource {
  asin: string
  brand: string | null
  title: string | null
}

export interface ListingMetadataUpdate {
  label?: string
  brandName?: string
  activeTitleId?: string
}

function clean(value: string | null): string {
  if (value === null) return ''
  return value.trim()
}

function shouldReplaceLabel(currentLabel: string, asin: string, brandName: string, nextLabel: string): boolean {
  if (currentLabel.toUpperCase() === asin) return true
  if (brandName.length === 0) return false
  if (currentLabel.toLowerCase() === `${brandName} ${nextLabel}`.toLowerCase()) return true
  return currentLabel.toLowerCase() === brandName.toLowerCase()
}

export function buildListingMetadataUpdate(
  listing: ListingMetadataSource,
  catalog: CatalogIdentitySource,
): ListingMetadataUpdate {
  const data: ListingMetadataUpdate = {}
  const asin = listing.asin.trim().toUpperCase()
  const currentLabel = listing.label.trim()
  const nextLabel = formatAmazonTitleLabel({
    asin,
    brand: catalog.brand,
    title: catalog.title,
  })
  const nextBrandName = clean(catalog.brand)

  if (shouldReplaceLabel(currentLabel, asin, nextBrandName, nextLabel) && nextLabel !== asin) {
    data.label = nextLabel
  }

  if (clean(listing.brandName).length === 0 && nextBrandName.length > 0) {
    data.brandName = nextBrandName
  }

  return data
}
