export interface ProductLabelSource {
  asin: string
  label?: string | null
  brand?: string | null
  brandName?: string | null
  size?: string | null
  title?: string | null
}

export interface AmazonTitleLabelSource {
  asin: string
  brand?: string | null
  brandName?: string | null
  title?: string | null
}

function clean(value: string | null | undefined): string {
  if (value === null) return ''
  if (value === undefined) return ''
  return value.trim()
}

function firstText(values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = clean(value)
    if (text.length > 0) return text
  }

  return ''
}

function removeBrandPrefix(title: string, brand: string): string {
  if (brand.length === 0) return title
  if (!title.toLowerCase().startsWith(brand.toLowerCase())) return title

  const withoutBrand = title.slice(brand.length).trim()
  return withoutBrand.replace(/^[\s:-]+/, '').trim()
}

function firstTitleSegment(title: string): string {
  const segments = title.split(/[|,;(\[]/)
  const segment = clean(segments[0])
  if (segment.length > 0) return segment
  return title
}

function limitWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter((word) => word.length > 0)
  if (words.length <= maxWords) return words.join(' ')
  return words.slice(0, maxWords).join(' ')
}

export function formatProductLabel(source: ProductLabelSource): string {
  const asin = source.asin.trim().toUpperCase()
  const label = clean(source.label)
  if (label.length > 0 && label.toUpperCase() !== asin) return label

  const brand = firstText([source.brand, source.brandName])
  const size = clean(source.size)
  const title = clean(source.title)

  if (brand.length > 0 && size.length > 0) return `${brand} - ${size}`
  if (size.length > 0) return size
  if (title.length > 0) return formatAmazonTitleLabel({ asin, brand, title })
  if (brand.length > 0) return brand

  return asin
}

export function formatAmazonTitleLabel(source: AmazonTitleLabelSource): string {
  const asin = source.asin.trim().toUpperCase()
  const title = clean(source.title)
  if (title.length === 0) return asin

  const brand = firstText([source.brand, source.brandName])
  const titleWithoutBrand = removeBrandPrefix(firstTitleSegment(title), brand)
  const titleLabel = limitWords(titleWithoutBrand, 6)
  if (titleLabel.length === 0) return brand
  return titleLabel
}
