#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../../../../../')
const TALOS_PACKAGE_JSON = path.join(REPO_ROOT, 'apps/talos/package.json')

const MONITORING_HOURLY_LISTINGS_DIR = '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Hourly/Listing Attributes (API)'
const SNAPSHOT_HISTORY_FILE_NAME = 'Listings-Snapshot-History.csv'
const CHANGES_HISTORY_FILE_NAME = 'Listings-Changes-History.csv'

const OUR_ASINS = ['B09HXC3NL8', 'B0CR1GSBQ9', 'B0FLKJ7WWM', 'B0FP66CWQ6']
const COMPETITOR_SEED_ASINS = ['B0DQDWV1SV', 'B0CWS3848Y']
const OUR_ASIN_PRIORITY = new Map([
  ['B09HXC3NL8', 0],
  ['B0CR1GSBQ9', 1],
  ['B0FLKJ7WWM', 2],
  ['B0FP66CWQ6', 3],
])

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return

  const rawLines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  for (const rawLine of rawLines) {
    for (const line of rawLine.split(/\\\\n|\\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const cleaned = trimmed.replace(/^\d+→/, '')
      const separator = cleaned.indexOf('=')
      if (separator < 0) continue

      const key = cleaned.slice(0, separator).trim()
      let value = cleaned.slice(separator + 1).trim()
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1)
      if (value.endsWith('$')) value = value.slice(0, -1)

      if (!process.env[key]) process.env[key] = value
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value.trim()
}

function formatDateLocal(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTimeLocal(date) {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}${minutes}`
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function writeCsv(file, rows, headersInput = null) {
  if (!rows.length) {
    fs.writeFileSync(file, '')
    return
  }

  const headers = Array.isArray(headersInput) && headersInput.length
    ? headersInput
    : Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','))
  }
  fs.writeFileSync(file, `${lines.join('\n')}\n`)
}

function appendCsv(file, rows) {
  if (!rows.length) return

  const newHeaders = Object.keys(rows[0])
  if (!fs.existsSync(file)) {
    writeCsv(file, rows, newHeaders)
    return
  }

  const existingText = fs.readFileSync(file, 'utf8')
  if (!existingText.trim()) {
    writeCsv(file, rows, newHeaders)
    return
  }

  const firstLine = existingText.split(/\r?\n/, 1)[0] || ''
  const existingHeaders = firstLine.split(',').map((field) => field.trim())

  const headerMatches = existingHeaders.length === newHeaders.length
    && existingHeaders.every((field, index) => field === newHeaders[index])

  if (!headerMatches) {
    const existingRows = parseCsv(file)
    const mergedHeaders = [...existingHeaders]
    for (const header of newHeaders) {
      if (!mergedHeaders.includes(header)) mergedHeaders.push(header)
    }
    writeCsv(file, [...existingRows, ...rows], mergedHeaders)
    return
  }

  const lines = rows.map((row) => newHeaders.map((header) => csvEscape(row[header])).join(','))
  const prefix = existingText.endsWith('\n') ? '' : '\n'
  fs.appendFileSync(file, `${prefix}${lines.join('\n')}\n`)
}

function parseCsv(file) {
  if (!fs.existsSync(file)) return []

  const input = fs.readFileSync(file, 'utf8')
  if (!input) return []

  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }
    if (char === '\r') continue

    field += char
  }

  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }

  if (!rows.length) return []

  const headers = rows[0]
  const parsedRows = []
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const values = rows[rowIndex]
    if (!values.length || (values.length === 1 && values[0] === '')) continue

    const parsed = {}
    for (let index = 0; index < headers.length; index += 1) {
      parsed[headers[index]] = values[index] ?? ''
    }
    parsedRows.push(parsed)
  }

  return parsedRows
}

function normalizeCompareValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

function uniq(values) {
  const seen = new Set()
  const out = []

  for (const value of values) {
    const item = String(value || '').trim()
    if (!item || seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }

  return out
}

function sortedPipe(values) {
  return uniq(values).sort().join('|')
}

function extractStrings(node) {
  const out = []

  const push = (value) => {
    const item = String(value ?? '').trim()
    if (item && !out.includes(item)) out.push(item)
  }

  const walk = (value) => {
    if (value === null || value === undefined) return

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      push(value)
      return
    }

    if (Array.isArray(value)) {
      for (const element of value) walk(element)
      return
    }

    if (typeof value === 'object') {
      if (value.value !== undefined && typeof value.value !== 'object') push(value.value)
      if (value.link) push(value.link)
      if (value.url) push(value.url)

      for (const [key, nested] of Object.entries(value)) {
        if (key === 'value' || key === 'link' || key === 'url') continue
        if (key === 'language_tag' || key === 'marketplace_id' || key === 'marketplaceId') continue
        walk(nested)
      }
    }
  }

  walk(node)
  return out
}

function pickFirstString(...values) {
  for (const value of values) {
    const found = extractStrings(value)
    if (found.length) return found[0]
  }
  return ''
}

function parseRelationships(catalog) {
  const parentAsins = []
  const childAsins = []

  for (const group of catalog?.relationships || []) {
    for (const relationship of group?.relationships || []) {
      for (const parent of relationship?.parentAsins || []) parentAsins.push(parent)
      for (const child of relationship?.childAsins || []) childAsins.push(child)
    }
  }

  return {
    parentAsins: uniq(parentAsins),
    childAsins: uniq(childAsins),
  }
}

function parseIdentifiers(catalog) {
  const identifiers = []

  for (const entry of catalog?.identifiers || []) {
    for (const identifier of entry?.identifiers || []) identifiers.push(identifier)
  }

  const byType = new Map()
  for (const identifier of identifiers) {
    const type = String(identifier?.identifierType || '').toUpperCase()
    const value = String(identifier?.identifier || '')
    if (type && value && !byType.has(type)) byType.set(type, value)
  }

  return {
    upc: byType.get('UPC') || '',
    ean: byType.get('EAN') || '',
    isbn: byType.get('ISBN') || '',
  }
}

function parseClassifications(catalog) {
  const classifications = catalog?.classifications?.[0]?.classifications || []
  if (!Array.isArray(classifications) || !classifications.length) {
    return {
      leafId: '',
      leafName: '',
      rootId: '',
      rootName: '',
    }
  }

  const leaf = classifications[0] || {}
  const root = classifications[classifications.length - 1] || {}

  return {
    leafId: leaf.classificationId || '',
    leafName: leaf.displayName || '',
    rootId: root.classificationId || '',
    rootName: root.displayName || '',
  }
}

function collectCatalogImageUrls(catalog, listingSummaryMainImage) {
  const urls = []

  const add = (url) => {
    const item = String(url || '').trim()
    if (!item || urls.includes(item)) return
    urls.push(item)
  }

  add(listingSummaryMainImage)

  for (const group of catalog?.images || []) {
    for (const image of group?.images || []) {
      add(image?.link || image?.url)
    }
  }

  const attributes = catalog?.attributes || {}
  for (const url of extractStrings(attributes.main_product_image_locator)) add(url)
  for (let index = 1; index <= 8; index += 1) {
    for (const url of extractStrings(attributes[`other_product_image_locator_${index}`])) add(url)
  }

  return urls
}

function parsePricing(pricingPayload) {
  const item = Array.isArray(pricingPayload) ? pricingPayload[0] : pricingPayload
  const product = item?.Product || {}
  const competitivePricing = product?.CompetitivePricing || {}
  const competitivePrices = competitivePricing?.CompetitivePrices || []
  const firstNewPrice = competitivePrices.find((price) => price?.condition === 'New')
  const selectedPrice = firstNewPrice || competitivePrices[0] || {}
  const amount = selectedPrice?.Price || {}
  const offerListings = competitivePricing?.NumberOfOfferListings || []

  const offersAny = offerListings.find((offer) => offer?.condition === 'Any')?.Count ?? ''
  const offersNew = offerListings.find((offer) => offer?.condition === 'New')?.Count ?? ''
  const salesRankings = product?.SalesRankings || []
  const rootRank = salesRankings[0] || {}
  const subRank = salesRankings[1] || {}

  return {
    belongsToRequester: selectedPrice?.belongsToRequester ?? '',
    landedPrice: amount?.LandedPrice?.Amount ?? '',
    listingPrice: amount?.ListingPrice?.Amount ?? '',
    shippingPrice: amount?.Shipping?.Amount ?? '',
    currency: amount?.LandedPrice?.CurrencyCode || amount?.ListingPrice?.CurrencyCode || '',
    offersAny,
    offersNew,
    rootRank: rootRank?.Rank ?? '',
    rootCategoryId: rootRank?.ProductCategoryId ?? '',
    subRank: subRank?.Rank ?? '',
    subCategoryId: subRank?.ProductCategoryId ?? '',
  }
}

function parseItemOffers(itemOffersPayload) {
  const summary = itemOffersPayload?.Summary ?? {}
  const offers = Array.isArray(itemOffersPayload?.Offers) ? itemOffersPayload.Offers : []
  const lowestPrices = Array.isArray(summary?.LowestPrices) ? summary.LowestPrices : []
  const buyBoxPrices = Array.isArray(summary?.BuyBoxPrices) ? summary.BuyBoxPrices : []
  const numberOfOffers = Array.isArray(summary?.NumberOfOffers) ? summary.NumberOfOffers : []
  const buyBoxEligibleOffers = Array.isArray(summary?.BuyBoxEligibleOffers) ? summary.BuyBoxEligibleOffers : []

  const readAmount = (priceNode, key) => {
    const amount = priceNode?.[key]?.Amount
    return amount ?? ''
  }

  const readCurrency = (priceNode, key) => {
    const currency = priceNode?.[key]?.CurrencyCode
    return currency ?? ''
  }

  const findPrice = (items, predicate) => {
    for (const item of items) {
      if (predicate(item)) return item
    }
    return null
  }

  const firstNonEmpty = (...values) => {
    for (const value of values) {
      if (value !== null && value !== undefined && String(value).trim() !== '') return value
    }
    return ''
  }

  const buyBoxPrice = findPrice(
    buyBoxPrices,
    (entry) => String(entry?.condition ?? '').toLowerCase() === 'new'
  ) ?? buyBoxPrices[0] ?? null

  const lowestFbaPrice = findPrice(
    lowestPrices,
    (entry) => String(entry?.condition ?? '').toLowerCase() === 'new'
      && String(entry?.fulfillmentChannel ?? '').toLowerCase() === 'amazon'
  )
  const lowestMfnPrice = findPrice(
    lowestPrices,
    (entry) => String(entry?.condition ?? '').toLowerCase() === 'new'
      && String(entry?.fulfillmentChannel ?? '').toLowerCase() === 'merchant'
  )

  const countOffers = (items, predicate) => {
    let total = 0
    for (const item of items) {
      if (!predicate(item)) continue
      const raw = item?.OfferCount ?? item?.Count
      const value = Number(raw)
      if (Number.isFinite(value)) total += value
    }
    return total
  }

  const offersFba = countOffers(
    numberOfOffers,
    (entry) => String(entry?.condition ?? '').toLowerCase() === 'new'
      && String(entry?.fulfillmentChannel ?? '').toLowerCase() === 'amazon'
  )
  const offersMfn = countOffers(
    numberOfOffers,
    (entry) => String(entry?.condition ?? '').toLowerCase() === 'new'
      && String(entry?.fulfillmentChannel ?? '').toLowerCase() === 'merchant'
  )
  const buyBoxEligibleOfferCount = countOffers(
    buyBoxEligibleOffers,
    (entry) => String(entry?.condition ?? '').toLowerCase() === 'new'
  )

  let featuredOfferCount = 0
  let primeOfferCount = 0
  let fbaOfferCount = 0
  const uniqueSellers = new Set()
  for (const offer of offers) {
    if (offer?.IsFeaturedMerchant === true) featuredOfferCount += 1
    if (offer?.PrimeInformation?.IsPrime === true) primeOfferCount += 1
    if (offer?.IsFulfilledByAmazon === true) fbaOfferCount += 1
    const sellerId = String(offer?.SellerId ?? '').trim()
    if (sellerId) uniqueSellers.add(sellerId)
  }

  const buyBoxWinner = findPrice(
    offers,
    (offer) => offer?.IsBuyBoxWinner === true
  )

  const totalOfferCountRaw = Number(summary?.TotalOfferCount)
  const totalOfferCount = Number.isFinite(totalOfferCountRaw) ? totalOfferCountRaw : ''

  const buyBoxPriceCurrency = firstNonEmpty(
    readCurrency(buyBoxPrice, 'LandedPrice'),
    readCurrency(buyBoxPrice, 'ListingPrice')
  )
  const lowestOfferCurrency = firstNonEmpty(
    readCurrency(lowestFbaPrice, 'LandedPrice'),
    readCurrency(lowestFbaPrice, 'ListingPrice'),
    readCurrency(lowestMfnPrice, 'LandedPrice'),
    readCurrency(lowestMfnPrice, 'ListingPrice')
  )

  return {
    listPrice: summary?.ListPrice?.Amount ?? '',
    listPriceCurrency: summary?.ListPrice?.CurrencyCode ?? '',
    buyBoxLandedPrice: readAmount(buyBoxPrice, 'LandedPrice'),
    buyBoxListingPrice: readAmount(buyBoxPrice, 'ListingPrice'),
    buyBoxShippingPrice: readAmount(buyBoxPrice, 'Shipping'),
    buyBoxPriceCurrency,
    lowestFbaLandedPrice: readAmount(lowestFbaPrice, 'LandedPrice'),
    lowestFbaListingPrice: readAmount(lowestFbaPrice, 'ListingPrice'),
    lowestFbaShippingPrice: readAmount(lowestFbaPrice, 'Shipping'),
    lowestMfnLandedPrice: readAmount(lowestMfnPrice, 'LandedPrice'),
    lowestMfnListingPrice: readAmount(lowestMfnPrice, 'ListingPrice'),
    lowestMfnShippingPrice: readAmount(lowestMfnPrice, 'Shipping'),
    lowestOfferCurrency,
    totalOfferCount,
    offersFba,
    offersMfn,
    buyBoxEligibleOfferCount,
    buyBoxWinnerSellerId: buyBoxWinner?.SellerId ?? '',
    buyBoxWinnerIsFba: buyBoxWinner?.IsFulfilledByAmazon ?? '',
    buyBoxWinnerIsPrime: buyBoxWinner?.PrimeInformation?.IsPrime ?? '',
    buyBoxWinnerIsFeatured: buyBoxWinner?.IsFeaturedMerchant ?? '',
    buyBoxWinnerFeedbackCount: buyBoxWinner?.SellerFeedbackRating?.FeedbackCount ?? '',
    buyBoxWinnerPositiveFeedbackPct: buyBoxWinner?.SellerFeedbackRating?.SellerPositiveFeedbackRating ?? '',
    featuredOfferCount,
    primeOfferCount,
    fbaOfferCount,
    uniqueSellerCount: uniqueSellers.size,
  }
}

function parseListingMonitoringFields(listing) {
  const offers = Array.isArray(listing?.offers) ? listing.offers : []
  const fulfillmentAvailability = Array.isArray(listing?.fulfillmentAvailability)
    ? listing.fulfillmentAvailability
    : []
  const issues = Array.isArray(listing?.issues) ? listing.issues : []

  let ownB2cPrice = ''
  let ownB2cCurrency = ''
  let ownB2bPrice = ''
  let ownB2bCurrency = ''
  const offerTypes = []
  const offerAudienceValues = []

  for (const offer of offers) {
    const offerType = String(offer?.offerType ?? '').trim()
    if (offerType) offerTypes.push(offerType)

    const audienceValue = String(offer?.audience?.value ?? '').trim()
    if (audienceValue) offerAudienceValues.push(audienceValue)

    if (String(offerType).toUpperCase() === 'B2C') {
      ownB2cPrice = offer?.price?.amount ?? ''
      ownB2cCurrency = offer?.price?.currencyCode ?? offer?.price?.currency ?? ''
    }
    if (String(offerType).toUpperCase() === 'B2B') {
      ownB2bPrice = offer?.price?.amount ?? ''
      ownB2bCurrency = offer?.price?.currencyCode ?? offer?.price?.currency ?? ''
    }
  }

  const fulfillmentChannels = []
  let fulfillmentQuantityTotal = 0
  for (const availability of fulfillmentAvailability) {
    const channel = String(availability?.fulfillmentChannelCode ?? '').trim()
    if (channel) fulfillmentChannels.push(channel)

    const quantity = Number(availability?.quantity)
    if (Number.isFinite(quantity)) fulfillmentQuantityTotal += quantity
  }

  const issueCodes = []
  for (const issue of issues) {
    const code = String(issue?.code ?? '').trim()
    if (code) issueCodes.push(code)
  }

  return {
    ownOfferB2cPrice: ownB2cPrice,
    ownOfferB2cCurrency: ownB2cCurrency,
    ownOfferB2bPrice: ownB2bPrice,
    ownOfferB2bCurrency: ownB2bCurrency,
    ownOfferTypes: sortedPipe(offerTypes),
    ownOfferAudiences: sortedPipe(offerAudienceValues),
    ownFulfillmentChannels: sortedPipe(fulfillmentChannels),
    ownFulfillmentChannelCount: uniq(fulfillmentChannels).length,
    ownFulfillmentQuantityTotal: fulfillmentQuantityTotal,
    ownIssueCount: issues.length,
    ownIssueCodes: sortedPipe(issueCodes),
  }
}

function sortRows(rows) {
  rows.sort((a, b) => {
    if (a.owner_type !== b.owner_type) return a.owner_type === 'our' ? -1 : 1
    if (a.owner_type === 'our') {
      const left = OUR_ASIN_PRIORITY.get(a.asin)
      const right = OUR_ASIN_PRIORITY.get(b.asin)
      return (left ?? 99) - (right ?? 99)
    }
    return a.asin.localeCompare(b.asin)
  })
}

function sortDiffs(diffs) {
  const changedPriority = new Map([
    ['yes', 0],
    ['no', 1],
    ['no_baseline', 2],
  ])

  diffs.sort((a, b) => {
    const left = changedPriority.get(a.changed)
    const right = changedPriority.get(b.changed)
    if ((left ?? 9) !== (right ?? 9)) return (left ?? 9) - (right ?? 9)

    if (a.owner_type !== b.owner_type) return a.owner_type === 'our' ? -1 : 1
    if (a.owner_type === 'our') {
      const leftPriority = OUR_ASIN_PRIORITY.get(a.asin)
      const rightPriority = OUR_ASIN_PRIORITY.get(b.asin)
      return (leftPriority ?? 99) - (rightPriority ?? 99)
    }
    return a.asin.localeCompare(b.asin)
  })
}

function loadPreviousRowsByAsin(previousState) {
  if (!previousState || typeof previousState !== 'object') {
    return {
      byAsin: new Map(),
      baselineTimestampUtc: '',
    }
  }

  const byAsin = new Map()
  for (const [asin, row] of Object.entries(previousState.by_asin || {})) {
    if (!asin || !row || typeof row !== 'object') continue
    byAsin.set(asin, row)
  }

  return {
    byAsin,
    baselineTimestampUtc: String(previousState.timestamp_utc || ''),
  }
}

async function fetchCatalog(sp, marketplaceId, asin, includedData) {
  return sp.callAPI({
    operation: 'getCatalogItem',
    endpoint: 'catalogItems',
    options: { version: '2022-04-01' },
    path: { asin },
    query: {
      marketplaceIds: [marketplaceId],
      includedData,
    },
  })
}

async function discoverCompetitorVariations(sp, marketplaceId) {
  const parentToChildren = new Map()
  const seedToParent = new Map()

  for (const seedAsin of COMPETITOR_SEED_ASINS) {
    const seedCatalog = await fetchCatalog(sp, marketplaceId, seedAsin, ['relationships'])
    const relationships = parseRelationships(seedCatalog)

    for (const parentAsin of relationships.parentAsins) {
      seedToParent.set(seedAsin, parentAsin)
      if (parentToChildren.has(parentAsin)) continue
      const parentCatalog = await fetchCatalog(sp, marketplaceId, parentAsin, ['relationships'])
      const parentRelationships = parseRelationships(parentCatalog)
      parentToChildren.set(parentAsin, parentRelationships.childAsins)
    }
  }

  const competitorAsins = []
  const add = (asin) => {
    if (!asin) return
    if (OUR_ASINS.includes(asin)) return
    if (competitorAsins.includes(asin)) return
    competitorAsins.push(asin)
  }

  for (const seedAsin of COMPETITOR_SEED_ASINS) {
    const parentAsin = seedToParent.get(seedAsin)
    if (parentAsin && parentToChildren.has(parentAsin)) {
      for (const childAsin of parentToChildren.get(parentAsin) || []) add(childAsin)
    }
    add(seedAsin)
  }

  for (const childAsins of parentToChildren.values()) {
    for (const childAsin of childAsins || []) add(childAsin)
  }

  competitorAsins.sort()
  return competitorAsins
}

async function discoverOurSkus(sp, marketplaceId, sellerId) {
  const asinToSku = new Map()
  let pageToken = undefined

  for (let page = 0; page < 25; page += 1) {
    const query = {
      marketplaceIds: [marketplaceId],
      includedData: ['summaries'],
      pageSize: 20,
    }
    if (pageToken) query.pageToken = pageToken

    const response = await sp.callAPI({
      operation: 'searchListingsItems',
      endpoint: 'listingsItems',
      options: { version: '2021-08-01' },
      path: { sellerId },
      query,
    })

    const items = Array.isArray(response?.items) ? response.items : []
    for (const item of items) {
      const asin = item?.summaries?.[0]?.asin
      const sku = item?.sku
      if (asin && sku) asinToSku.set(asin, sku)
    }

    const nextToken = response?.pagination?.nextToken
    if (!nextToken) break
    pageToken = nextToken
  }

  return asinToSku
}

async function collectRows(sp, marketplaceId, sellerId) {
  const ourAsinSet = new Set(OUR_ASINS)
  const competitorAsins = await discoverCompetitorVariations(sp, marketplaceId)
  const allAsins = [...OUR_ASINS, ...competitorAsins]
  const asinToSku = await discoverOurSkus(sp, marketplaceId, sellerId)

  const now = new Date()
  const snapshotTimestampUtc = now.toISOString()
  const snapshotDate = formatDateLocal(now)
  const snapshotTimeLocal = formatTimeLocal(now)

  const rows = []

  for (const asin of allAsins) {
    const ownerType = ourAsinSet.has(asin) ? 'our' : 'competitor'
    const sellerSku = ownerType === 'our' ? (asinToSku.get(asin) || '') : ''

    const pricingPayload = await sp.callAPI({
      operation: 'getCompetitivePricing',
      endpoint: 'productPricing',
      query: {
        MarketplaceId: marketplaceId,
        Asins: [asin],
        ItemType: 'Asin',
      },
    })
    const pricing = parsePricing(pricingPayload)
    const itemOffersPayload = await sp.callAPI({
      operation: 'getItemOffers',
      endpoint: 'productPricing',
      path: { Asin: asin },
      query: {
        MarketplaceId: marketplaceId,
        ItemCondition: 'New',
      },
    })
    const itemOffers = parseItemOffers(itemOffersPayload)

    const catalog = await fetchCatalog(sp, marketplaceId, asin, ['summaries', 'attributes', 'images', 'relationships', 'salesRanks', 'classifications', 'identifiers'])

    let listing = null
    if (ownerType === 'our' && sellerSku) {
      listing = await sp.callAPI({
        operation: 'getListingsItem',
        endpoint: 'listingsItems',
        options: { version: '2021-08-01' },
        path: { sellerId, sku: sellerSku },
        query: {
          marketplaceIds: [marketplaceId],
          includedData: ['summaries', 'attributes', 'issues', 'offers', 'fulfillmentAvailability', 'relationships'],
        },
      })
    }

    const catalogSummary = catalog?.summaries?.[0] || {}
    const listingSummary = listing?.summaries?.[0] || {}
    const attributes = listing?.attributes || catalog?.attributes || {}

    const title = listingSummary?.itemName || catalogSummary?.itemName || pickFirstString(attributes.item_name)
    const brand = pickFirstString(attributes.brand, catalogSummary?.brand)
    const manufacturer = pickFirstString(attributes.manufacturer, catalogSummary?.manufacturer)
    const modelNumber = pickFirstString(attributes.model_number, catalogSummary?.modelNumber)
    const productType = listingSummary?.productType || pickFirstString(attributes.item_type_keyword)
    const itemClassification = catalogSummary?.itemClassification || ''
    const color = pickFirstString(attributes.color, catalogSummary?.color)
    const size = pickFirstString(attributes.size, catalogSummary?.size)
    const material = pickFirstString(attributes.material)
    const variationTheme = pickFirstString(attributes.variation_theme)
    const bulletPointValues = extractStrings(attributes.bullet_point)
    const descriptionValues = extractStrings(attributes.product_description)
    const backendTermValues = ownerType === 'our' ? extractStrings(attributes.generic_keyword) : []
    const bulletPoints = bulletPointValues.join(' | ')
    const description = descriptionValues.join(' | ')
    const backendTerms = backendTermValues.join(' | ')

    const imageUrlsList = collectCatalogImageUrls(catalog, listingSummary?.mainImage?.link)
    const imageUrls = imageUrlsList.join(' | ')

    const classifications = parseClassifications(catalog)
    const identifiers = parseIdentifiers(catalog)
    const relationships = parseRelationships(catalog)
    const relatedAsins = uniq([...relationships.parentAsins, ...relationships.childAsins])
    const statusValues = Array.isArray(listingSummary?.status) ? uniq(listingSummary.status).sort() : []
    const listingMonitoring = parseListingMonitoringFields(listing)

    rows.push({
      snapshot_timestamp_utc: snapshotTimestampUtc,
      snapshot_date: snapshotDate,
      snapshot_time_local: snapshotTimeLocal,
      asin,
      owner_type: ownerType,
      seller_sku: sellerSku,
      belongs_to_requester: pricing.belongsToRequester,
      status: statusValues.join('|'),
      title,
      brand,
      manufacturer,
      model_number: modelNumber,
      product_type: productType,
      item_classification: itemClassification,
      color,
      size,
      material,
      variation_theme: variationTheme,
      bullet_points: bulletPoints,
      description,
      backend_terms: backendTerms,
      title_length: title ? title.length : '',
      bullet_count: bulletPointValues.length,
      description_length: description ? description.length : '',
      backend_terms_count: ownerType === 'our' ? backendTermValues.length : '',
      image_count: imageUrlsList.length,
      image_urls: imageUrls,
      landed_price: pricing.landedPrice,
      listing_price: pricing.listingPrice,
      shipping_price: pricing.shippingPrice,
      price_currency: pricing.currency,
      list_price: itemOffers.listPrice,
      list_price_currency: itemOffers.listPriceCurrency,
      buy_box_landed_price: itemOffers.buyBoxLandedPrice,
      buy_box_listing_price: itemOffers.buyBoxListingPrice,
      buy_box_shipping_price: itemOffers.buyBoxShippingPrice,
      buy_box_price_currency: itemOffers.buyBoxPriceCurrency,
      lowest_fba_landed_price: itemOffers.lowestFbaLandedPrice,
      lowest_fba_listing_price: itemOffers.lowestFbaListingPrice,
      lowest_fba_shipping_price: itemOffers.lowestFbaShippingPrice,
      lowest_mfn_landed_price: itemOffers.lowestMfnLandedPrice,
      lowest_mfn_listing_price: itemOffers.lowestMfnListingPrice,
      lowest_mfn_shipping_price: itemOffers.lowestMfnShippingPrice,
      lowest_offer_currency: itemOffers.lowestOfferCurrency,
      total_offer_count: itemOffers.totalOfferCount,
      offers_any: pricing.offersAny,
      offers_new: pricing.offersNew,
      offers_fba: itemOffers.offersFba,
      offers_mfn: itemOffers.offersMfn,
      buybox_eligible_offer_count: itemOffers.buyBoxEligibleOfferCount,
      buybox_winner_seller_id: itemOffers.buyBoxWinnerSellerId,
      buybox_winner_is_fba: itemOffers.buyBoxWinnerIsFba,
      buybox_winner_is_prime: itemOffers.buyBoxWinnerIsPrime,
      buybox_winner_is_featured: itemOffers.buyBoxWinnerIsFeatured,
      buybox_winner_feedback_count: itemOffers.buyBoxWinnerFeedbackCount,
      buybox_winner_positive_feedback_pct: itemOffers.buyBoxWinnerPositiveFeedbackPct,
      featured_offer_count: itemOffers.featuredOfferCount,
      prime_offer_count: itemOffers.primeOfferCount,
      fba_offer_count: itemOffers.fbaOfferCount,
      unique_seller_count: itemOffers.uniqueSellerCount,
      own_offer_b2c_price: ownerType === 'our' ? listingMonitoring.ownOfferB2cPrice : '',
      own_offer_b2c_currency: ownerType === 'our' ? listingMonitoring.ownOfferB2cCurrency : '',
      own_offer_b2b_price: ownerType === 'our' ? listingMonitoring.ownOfferB2bPrice : '',
      own_offer_b2b_currency: ownerType === 'our' ? listingMonitoring.ownOfferB2bCurrency : '',
      own_offer_types: ownerType === 'our' ? listingMonitoring.ownOfferTypes : '',
      own_offer_audiences: ownerType === 'our' ? listingMonitoring.ownOfferAudiences : '',
      own_fulfillment_channels: ownerType === 'our' ? listingMonitoring.ownFulfillmentChannels : '',
      own_fulfillment_channel_count: ownerType === 'our' ? listingMonitoring.ownFulfillmentChannelCount : '',
      own_fulfillment_quantity_total: ownerType === 'our' ? listingMonitoring.ownFulfillmentQuantityTotal : '',
      own_issue_count: ownerType === 'our' ? listingMonitoring.ownIssueCount : '',
      own_issue_codes: ownerType === 'our' ? listingMonitoring.ownIssueCodes : '',
      root_bsr_rank: pricing.rootRank,
      root_bsr_category_id: pricing.rootCategoryId,
      sub_bsr_rank: pricing.subRank,
      sub_bsr_category_id: pricing.subCategoryId,
      leaf_classification_id: classifications.leafId,
      leaf_classification_name: classifications.leafName,
      root_classification_id: classifications.rootId,
      root_classification_name: classifications.rootName,
      upc: identifiers.upc,
      ean: identifiers.ean,
      isbn: identifiers.isbn,
      parent_asins: sortedPipe(relationships.parentAsins),
      child_asins: sortedPipe(relationships.childAsins),
      related_asins: sortedPipe(relatedAsins),
      item_dimensions: JSON.stringify(attributes.item_dimensions || []),
      item_package_dimensions: JSON.stringify(attributes.item_package_dimensions || []),
      item_weight: JSON.stringify(attributes.item_weight || []),
      item_package_weight: JSON.stringify(attributes.item_package_weight || []),
      created_date: listingSummary?.createdDate || '',
      last_updated_date: listingSummary?.lastUpdatedDate || '',
    })
  }

  sortRows(rows)

  return {
    rows,
    snapshotTimestampUtc,
    snapshotDate,
    snapshotTimeLocal,
    competitorAsinCount: competitorAsins.length,
  }
}

function buildDiffRows(rows, snapshotTimestampUtc, snapshotDate, snapshotTimeLocal) {
  const statePath = path.join(MONITORING_HOURLY_LISTINGS_DIR, 'latest_state.json')
  const previousState = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : null

  const {
    byAsin: previousRowsByAsin,
    baselineTimestampUtc,
  } = loadPreviousRowsByAsin(previousState)

  const compareFields = rows.length
    ? Object.keys(rows[0]).filter((field) => ![
      'snapshot_timestamp_utc',
      'snapshot_date',
      'snapshot_time_local',
      'asin',
    ].includes(field))
    : []

  const diffs = []
  const nextState = {
    timestamp_utc: snapshotTimestampUtc,
    snapshot_file: SNAPSHOT_HISTORY_FILE_NAME,
    by_asin: {},
  }

  for (const row of rows) {
    const previousRow = previousRowsByAsin.get(row.asin)
    const hasBaseline = Boolean(previousRow)

    const currentImages = String(row.image_urls || '')
      .split(' | ')
      .map((imageUrl) => imageUrl.trim())
      .filter(Boolean)
    const previousImagesText = hasBaseline
      ? String(previousRow.image_urls_ordered ?? previousRow.image_urls ?? '')
      : ''
    const previousImages = previousImagesText
      .split(' | ')
      .map((imageUrl) => imageUrl.trim())
      .filter(Boolean)

    const previousSet = new Set(previousImages)
    const currentSet = new Set(currentImages)
    const addedImages = hasBaseline ? currentImages.filter((imageUrl) => !previousSet.has(imageUrl)) : []
    const removedImages = hasBaseline ? previousImages.filter((imageUrl) => !currentSet.has(imageUrl)) : []

    const changedFields = []
    const perAttributeChanges = {}
    for (const field of compareFields) {
      if (!hasBaseline) {
        perAttributeChanges[`${field}_changed`] = 'no_baseline'
        continue
      }

      const fieldChanged = field === 'image_urls'
        ? Boolean(addedImages.length || removedImages.length)
        : normalizeCompareValue(previousRow[field]) !== normalizeCompareValue(row[field])

      perAttributeChanges[`${field}_changed`] = fieldChanged ? 'yes' : 'no'
      if (fieldChanged) changedFields.push(field)
    }

    const currentImageSet = [...new Set(currentImages)].sort()
    const normalized = {}
    for (const field of compareFields) normalized[field] = normalizeCompareValue(row[field])
    normalized.image_urls_set = currentImageSet.join(' | ')
    normalized.image_urls_ordered = normalizeCompareValue(row.image_urls)

    nextState.by_asin[row.asin] = {
      state_key: JSON.stringify(normalized),
      ...normalized,
    }

    diffs.push({
      snapshot_timestamp_utc: snapshotTimestampUtc,
      asin: row.asin,
      owner_type: row.owner_type,
      baseline_timestamp_utc: hasBaseline
        ? normalizeCompareValue(previousRow.snapshot_timestamp_utc || baselineTimestampUtc)
        : '',
      changed: hasBaseline ? (changedFields.length ? 'yes' : 'no') : 'no_baseline',
      changed_fields: hasBaseline ? changedFields.join(',') : '',
      changed_field_count: hasBaseline ? String(changedFields.length) : '',
      added_images: hasBaseline ? addedImages.join(' | ') : '',
      removed_images: hasBaseline ? removedImages.join(' | ') : '',
      image_order_changed: '',
      ...perAttributeChanges,
    })
  }

  sortDiffs(diffs)

  return {
    diffs,
    nextState,
    statePath,
  }
}

async function main() {
  ensureDir(MONITORING_HOURLY_LISTINGS_DIR)

  loadEnvFile(path.join(REPO_ROOT, 'apps/talos/.env.local'))
  loadEnvFile(path.join(REPO_ROOT, 'apps/xplan/.env.local'))
  loadEnvFile(path.join(REPO_ROOT, 'apps/argus/.env.local'))
  loadEnvFile(path.join(REPO_ROOT, '.env.local'))

  const appClientId = requiredEnv('AMAZON_SP_APP_CLIENT_ID')
  const appClientSecret = requiredEnv('AMAZON_SP_APP_CLIENT_SECRET')
  const refreshToken = requiredEnv('AMAZON_REFRESH_TOKEN_US')
  const region = requiredEnv('AMAZON_SP_API_REGION_US')
  const marketplaceId = requiredEnv('AMAZON_MARKETPLACE_ID_US')
  const sellerId = requiredEnv('AMAZON_SELLER_ID_US')

  const requireFromTalos = createRequire(TALOS_PACKAGE_JSON)
  const SellingPartnerAPI = requireFromTalos('amazon-sp-api')

  const sp = new SellingPartnerAPI({
    region,
    refresh_token: refreshToken,
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: appClientId,
      SELLING_PARTNER_APP_CLIENT_SECRET: appClientSecret,
    },
    options: {
      auto_request_tokens: true,
      auto_request_throttled: true,
      use_sandbox: false,
    },
  })

  const {
    rows,
    snapshotTimestampUtc,
    snapshotDate,
    snapshotTimeLocal,
    competitorAsinCount,
  } = await collectRows(sp, marketplaceId, sellerId)

  const {
    diffs,
    nextState,
    statePath,
  } = buildDiffRows(rows, snapshotTimestampUtc, snapshotDate, snapshotTimeLocal)

  const snapshotHistoryFile = path.join(MONITORING_HOURLY_LISTINGS_DIR, SNAPSHOT_HISTORY_FILE_NAME)
  const changesHistoryFile = path.join(MONITORING_HOURLY_LISTINGS_DIR, CHANGES_HISTORY_FILE_NAME)

  appendCsv(snapshotHistoryFile, rows)
  appendCsv(changesHistoryFile, diffs)
  fs.writeFileSync(statePath, JSON.stringify(nextState, null, 2))

  console.log('Hourly listing attributes collection complete')
  console.log(`competitor_variations=${competitorAsinCount}`)
  console.log(`asin_rows=${rows.length}`)
  console.log(`snapshot_history_file=${snapshotHistoryFile}`)
  console.log(`changes_history_file=${changesHistoryFile}`)
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
})
