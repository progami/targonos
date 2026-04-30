#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { sendArgusAlertEmail } from '../../lib/alert-email.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../../../../../')
const ARGUS_PACKAGE_JSON = path.join(REPO_ROOT, 'apps/argus/package.json')
const TALOS_PACKAGE_JSON = path.join(REPO_ROOT, 'apps/talos/package.json')
const { loadEnvForApp } = createRequire(import.meta.url)(path.join(REPO_ROOT, 'scripts/lib/shared-env.cjs'))

let MONITORING_HOURLY_LISTINGS_DIR = ''
const SNAPSHOT_HISTORY_FILE_NAME = 'Listings-Snapshot-History.csv'
const CHANGES_HISTORY_FILE_NAME = 'Listings-Changes-History.csv'

let CURRENT_OUR_ASINS = []
let CURRENT_COMPETITOR_SEED_ASINS = []
let CURRENT_OUR_ASIN_PRIORITY = new Map()
const BSR_CHANGE_FIELDS = new Set([
  'root_bsr_rank',
  'root_bsr_category_id',
  'sub_bsr_rank',
  'sub_bsr_category_id',
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

function readMarketArg() {
  const argv = process.argv.slice(2)
  const index = argv.indexOf('--market')
  if (index < 0) {
    return process.env.ARGUS_MARKET
  }
  return argv[index + 1]
}

function resolveArgusMarket() {
  const raw = readMarketArg()
  if (raw === undefined) return 'us'
  const value = String(raw).trim().toLowerCase()
  if (value === '') return 'us'
  if (value === 'us') return 'us'
  if (value === 'uk') return 'uk'
  throw new Error(`Unsupported Argus market: ${raw}`)
}

function monitoringHourlyListingsDir(market) {
  const salesRoot = requiredEnv(`ARGUS_SALES_ROOT_${market.toUpperCase()}`)
  return path.join(salesRoot, 'Monitoring', 'Hourly', 'Listing Attributes (API)')
}

function parseAsinList(value) {
  if (!value || typeof value !== 'string') return []

  return value
    .split(/[\s,|]+/)
    .map((asin) => asin.trim().toUpperCase())
    .filter(Boolean)
}

function requiredMarketAsinList(baseName, market) {
  const envName = `${baseName}_${market.toUpperCase()}`
  const asins = parseAsinList(requiredEnv(envName))
  if (!asins.length) {
    throw new Error(`Missing required ASIN list env var: ${envName}`)
  }
  return asins
}

function listingSourceConfigForMarket(market) {
  return {
    market,
    listingOurAsins: requiredMarketAsinList('ARGUS_OUR_ASINS', market),
    listingCompetitorSeedAsins: requiredMarketAsinList('ARGUS_COMPETITOR_MAIN_ASINS', market),
    listingHeroBsrAsins: requiredMarketAsinList('ARGUS_HERO_BSR_ASINS', market),
  }
}

function configureListingSource(config) {
  CURRENT_OUR_ASINS = [...config.listingOurAsins]
  CURRENT_COMPETITOR_SEED_ASINS = [...config.listingCompetitorSeedAsins]
  CURRENT_OUR_ASIN_PRIORITY = new Map(CURRENT_OUR_ASINS.map((asin, index) => [asin, index]))
}

function resolveArgusDatasourceUrl() {
  const databaseUrl = process.env.DATABASE_URL
  if (typeof databaseUrl !== 'string') return undefined

  const url = new URL(databaseUrl)
  url.searchParams.set('application_name', 'argus-hourly-listing-attributes')
  return url.toString()
}

function resolveTrackedAsinMarketplace(marketplaceId) {
  if (marketplaceId === 'ATVPDKIKX0DER') return 'US'
  if (marketplaceId === 'A1F83G8C2ARO7P') return 'UK'
  throw new Error(`Unsupported tracked ASIN marketplace: ${marketplaceId}`)
}

async function loadTrackedAsinLabels(marketplace) {
  try {
    const requireFromArgus = createRequire(ARGUS_PACKAGE_JSON)
    const { PrismaClient } = requireFromArgus('@targon/prisma-argus')
    const datasourceUrl = resolveArgusDatasourceUrl()
    const prisma = new PrismaClient({
      log: ['error'],
      ...(datasourceUrl ? { datasourceUrl } : {}),
    })

    try {
      const trackedAsins = await prisma.trackedAsin.findMany({
        where: { marketplace },
        select: { asin: true, label: true },
      })

      return new Map(
        trackedAsins
          .filter((item) => item?.asin && item?.label)
          .map((item) => [item.asin.trim().toUpperCase(), item.label.trim()])
      )
    } finally {
      await prisma.$disconnect().catch(() => {})
    }
  } catch (error) {
    console.warn(`Unable to load tracked ASIN labels: ${error?.message || String(error)}`)
    return new Map()
  }
}

function formatListingLabel(row, labelOverride = null) {
  const trackedLabel = labelOverride ? String(labelOverride).trim() : ''
  if (trackedLabel) return trackedLabel

  const brand = row?.brand ? String(row.brand).trim() : ''
  const size = row?.size ? String(row.size).trim() : ''
  const title = row?.title ? String(row.title).trim() : ''
  const asin = row?.asin ? String(row.asin).trim().toUpperCase() : ''

  if (brand && size) return `${brand} - ${size}`
  if (brand) return brand
  if (size) return size
  if (title) return title
  return asin
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
      const left = CURRENT_OUR_ASIN_PRIORITY.get(a.asin)
      const right = CURRENT_OUR_ASIN_PRIORITY.get(b.asin)
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
      const leftPriority = CURRENT_OUR_ASIN_PRIORITY.get(a.asin)
      const rightPriority = CURRENT_OUR_ASIN_PRIORITY.get(b.asin)
      return (leftPriority ?? 99) - (rightPriority ?? 99)
    }
    return a.asin.localeCompare(b.asin)
  })
}

const EVENT_CATEGORY_FIELDS = {
  status: new Set([
    'status',
    'owner_type',
    'seller_sku',
    'belongs_to_requester',
    'own_issue_count',
    'own_issue_codes',
  ]),
  content: new Set([
    'title',
    'brand',
    'manufacturer',
    'model_number',
    'product_type',
    'item_classification',
    'color',
    'size',
    'material',
    'variation_theme',
    'bullet_points',
    'description',
    'backend_terms',
    'title_length',
    'bullet_count',
    'description_length',
    'backend_terms_count',
  ]),
  images: new Set([
    'image_count',
    'image_urls',
    'added_images',
    'removed_images',
    'image_order_changed',
  ]),
  price: new Set([
    'landed_price',
    'listing_price',
    'shipping_price',
    'price_currency',
    'list_price',
    'list_price_currency',
    'buy_box_landed_price',
    'buy_box_listing_price',
    'buy_box_shipping_price',
    'buy_box_price_currency',
    'lowest_fba_landed_price',
    'lowest_fba_listing_price',
    'lowest_fba_shipping_price',
    'lowest_mfn_landed_price',
    'lowest_mfn_listing_price',
    'lowest_mfn_shipping_price',
    'lowest_offer_currency',
    'own_offer_b2c_price',
    'own_offer_b2c_currency',
    'own_offer_b2b_price',
    'own_offer_b2b_currency',
  ]),
  offers: new Set([
    'offers_any',
    'offers_new',
    'total_offer_count',
    'offers_fba',
    'offers_mfn',
    'featured_offer_count',
    'prime_offer_count',
    'fba_offer_count',
    'unique_seller_count',
    'buybox_eligible_offer_count',
    'buybox_winner_seller_id',
    'buybox_winner_is_fba',
    'buybox_winner_is_prime',
    'buybox_winner_is_featured',
    'buybox_winner_feedback_count',
    'buybox_winner_positive_feedback_pct',
    'own_offer_types',
    'own_offer_audiences',
    'own_fulfillment_channels',
    'own_fulfillment_channel_count',
    'own_fulfillment_quantity_total',
  ]),
  rank: new Set([
    'root_bsr_rank',
    'root_bsr_category_id',
    'sub_bsr_rank',
    'sub_bsr_category_id',
    'leaf_classification_id',
    'leaf_classification_name',
    'root_classification_id',
    'root_classification_name',
  ]),
  catalog: new Set([
    'upc',
    'ean',
    'isbn',
    'parent_asins',
    'child_asins',
    'related_asins',
    'item_dimensions',
    'item_package_dimensions',
    'item_weight',
    'item_package_weight',
    'created_date',
    'last_updated_date',
  ]),
}

const EVENT_CATEGORY_PRIORITY = [
  'status',
  'content',
  'images',
  'price',
  'offers',
  'rank',
  'catalog',
]

function normalizeEventOwner(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'our') return 'OURS'
  if (normalized === 'competitor') return 'COMPETITOR'
  return 'UNKNOWN'
}

function readEventString(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function readEventNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const text = String(value ?? '').trim()
  if (!text) return null

  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function toEventSnapshot(row) {
  if (!row || typeof row !== 'object') return null

  return {
    asin: String(row.asin ?? '').trim().toUpperCase(),
    owner: normalizeEventOwner(row.owner_type),
    title: readEventString(row.title),
    brand: readEventString(row.brand),
    size: readEventString(row.size),
    status: readEventString(row.status),
    imageCount: readEventNumber(row.image_count),
    landedPrice: readEventNumber(row.landed_price),
    priceCurrency: readEventString(row.price_currency),
    totalOfferCount: readEventNumber(row.total_offer_count),
    rootBsrRank: readEventNumber(row.root_bsr_rank),
  }
}

function classifyEventCategories(changedFields) {
  const categories = EVENT_CATEGORY_PRIORITY.filter((category) =>
    changedFields.some((field) => EVENT_CATEGORY_FIELDS[category].has(field))
  )

  return categories.length > 0 ? categories : ['catalog']
}

function valuesDiffer(baseline, current) {
  return baseline !== current
}

function pickEventPrimaryCategory({ categories, currentSnapshot, baselineSnapshot }) {
  if (categories.includes('content')) return 'content'
  if (
    categories.includes('images') &&
    valuesDiffer(baselineSnapshot?.imageCount, currentSnapshot?.imageCount)
  ) {
    return 'images'
  }
  if (
    categories.includes('price') &&
    valuesDiffer(baselineSnapshot?.landedPrice, currentSnapshot?.landedPrice)
  ) {
    return 'price'
  }
  if (
    categories.includes('offers') &&
    valuesDiffer(baselineSnapshot?.totalOfferCount, currentSnapshot?.totalOfferCount)
  ) {
    return 'offers'
  }
  if (
    categories.includes('status') &&
    valuesDiffer(baselineSnapshot?.status, currentSnapshot?.status)
  ) {
    return 'status'
  }
  if (
    categories.includes('rank') &&
    valuesDiffer(baselineSnapshot?.rootBsrRank, currentSnapshot?.rootBsrRank)
  ) {
    return 'rank'
  }

  return categories[0]
}

function classifyEventSeverity({
  owner,
  categories,
  changedFields,
  currentSnapshot,
  baselineSnapshot,
}) {
  let score = 0

  if (owner === 'OURS') score += 2
  if (categories.includes('status')) score += 4
  if (categories.includes('content')) score += 4
  if (categories.includes('images')) score += 3
  if (categories.includes('price')) score += 2
  if (categories.includes('offers')) score += 2
  if (categories.includes('rank')) score += 1
  if (changedFields.length >= 4) score += 2

  const currentRank = currentSnapshot?.rootBsrRank
  const baselineRank = baselineSnapshot?.rootBsrRank
  if (
    owner === 'OURS' &&
    currentRank !== null &&
    baselineRank !== null &&
    currentRank - baselineRank > 1000
  ) {
    score += 1
  }

  if (categories.length === 1 && categories[0] === 'rank' && owner !== 'OURS') {
    score -= 1
  }

  if (owner !== 'OURS' && score >= 7) return 'high'
  if (score >= 7) return 'critical'
  if (score >= 5) return 'high'
  if (score >= 3) return 'medium'
  return 'low'
}

function formatEventValue(value) {
  if (value === null || value === undefined || value === '') return 'n/a'
  if (typeof value === 'number') return value.toLocaleString()
  return String(value)
}

function formatEventCurrency(value, currency) {
  if (value === null || value === undefined) return 'n/a'
  if (!currency) return value.toFixed(2)

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return value.toFixed(2)
  }
}

function formatEventComparison(label, fromValue, toValue) {
  return `${label}: ${formatEventValue(fromValue)} -> ${formatEventValue(toValue)}`
}

function formatEventCurrencyComparison(label, fromValue, toValue, currency) {
  return `${label}: ${formatEventCurrency(fromValue, currency)} -> ${formatEventCurrency(toValue, currency)}`
}

function buildEventHeadline({ label, primaryCategory, currentSnapshot, baselineSnapshot }) {
  switch (primaryCategory) {
    case 'status':
      if (valuesDiffer(baselineSnapshot?.status, currentSnapshot?.status)) {
        return `${label} availability changed`
      }
      return `${label} operational signal changed`
    case 'content':
      return `${label} content changed`
    case 'images':
      return `${label} gallery changed`
    case 'price':
      return `${label} pricing changed`
    case 'offers':
      return `${label} offer mix changed`
    case 'rank': {
      const current = currentSnapshot?.rootBsrRank
      const baseline = baselineSnapshot?.rootBsrRank
      if (current !== null && baseline !== null) {
        if (current < baseline) return `${label} rank improved`
        if (current > baseline) return `${label} rank worsened`
      }
      return `${label} rank moved`
    }
    case 'catalog':
      return `${label} catalog data changed`
  }
}

function buildEventSummary({
  primaryCategory,
  changedFields,
  currentSnapshot,
  baselineSnapshot,
}) {
  switch (primaryCategory) {
    case 'status':
      if (valuesDiffer(baselineSnapshot?.status, currentSnapshot?.status)) {
        return formatEventComparison('Status', baselineSnapshot?.status, currentSnapshot?.status)
      }
      return `Fields changed: ${changedFields.slice(0, 4).join(', ')}`
    case 'images':
      return formatEventComparison('Image count', baselineSnapshot?.imageCount, currentSnapshot?.imageCount)
    case 'price':
      return formatEventCurrencyComparison(
        'Landed price',
        baselineSnapshot?.landedPrice,
        currentSnapshot?.landedPrice,
        currentSnapshot?.priceCurrency,
      )
    case 'offers':
      return formatEventComparison(
        'Offer count',
        baselineSnapshot?.totalOfferCount,
        currentSnapshot?.totalOfferCount,
      )
    case 'rank':
      return formatEventComparison('Root BSR', baselineSnapshot?.rootBsrRank, currentSnapshot?.rootBsrRank)
    case 'content':
      return `Fields changed: ${changedFields.slice(0, 4).join(', ')}`
    case 'catalog':
      return `Catalog fields changed: ${changedFields.slice(0, 4).join(', ')}`
  }
}

function buildCanonicalEvent(
  row,
  previousRow,
  changedFields,
  fieldChanges,
  snapshotTimestampUtc,
  baselineTimestampUtc,
  labelOverride = null,
) {
  const label = formatListingLabel(row, labelOverride)
  const owner = normalizeEventOwner(row.owner_type)
  const currentSnapshot = toEventSnapshot(row)
  const baselineSnapshot = toEventSnapshot(previousRow)
  const categories = classifyEventCategories(changedFields)
  const primaryCategory = pickEventPrimaryCategory({
    categories,
    currentSnapshot,
    baselineSnapshot,
  })
  const severity = classifyEventSeverity({
    owner,
    categories,
    changedFields,
    currentSnapshot,
    baselineSnapshot,
  })

  return {
    snapshot_timestamp_utc: snapshotTimestampUtc,
    baseline_timestamp_utc: baselineTimestampUtc,
    asin: row.asin,
    label,
    owner_type: row.owner_type,
    severity,
    primary_category: primaryCategory,
    categories,
    headline: buildEventHeadline({
      label,
      primaryCategory,
      currentSnapshot,
      baselineSnapshot,
    }),
    summary: buildEventSummary({
      primaryCategory,
      changedFields,
      currentSnapshot,
      baselineSnapshot,
    }),
    changed_fields: [...changedFields],
    field_changes: fieldChanges,
  }
}

function eventHasBsrChange(event) {
  const changedFields = Array.isArray(event?.changed_fields) ? event.changed_fields : []
  return changedFields.some((field) => BSR_CHANGE_FIELDS.has(field))
}

function filterVisibleBsrChanges(asin, changedFields, fieldChanges, heroBsrAsins) {
  const normalizedAsin = String(asin ?? '').trim().toUpperCase()
  if (heroBsrAsins.has(normalizedAsin)) {
    return {
      changedFields: [...changedFields],
      fieldChanges: [...fieldChanges],
    }
  }

  return {
    changedFields: changedFields.filter((field) => !BSR_CHANGE_FIELDS.has(field)),
    fieldChanges: fieldChanges.filter((change) => !BSR_CHANGE_FIELDS.has(change.field)),
  }
}

function shouldEmailEvent(event) {
  return eventHasBsrChange(event)
}

function selectEmailEvents(events) {
  return events.filter((event) => shouldEmailEvent(event))
}

function severityRank(severity) {
  switch (severity) {
    case 'critical':
      return 4
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
      return 1
    default:
      return 0
  }
}

function compareCanonicalEvents(left, right) {
  const severityDelta = severityRank(right.severity) - severityRank(left.severity)
  if (severityDelta !== 0) return severityDelta
  if (left.owner_type !== right.owner_type) return left.owner_type === 'our' ? -1 : 1
  if (left.owner_type === 'our') {
    const leftPriority = CURRENT_OUR_ASIN_PRIORITY.get(left.asin)
    const rightPriority = CURRENT_OUR_ASIN_PRIORITY.get(right.asin)
    return (leftPriority ?? 99) - (rightPriority ?? 99)
  }
  return left.asin.localeCompare(right.asin)
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

  for (const seedAsin of CURRENT_COMPETITOR_SEED_ASINS) {
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
    if (CURRENT_OUR_ASINS.includes(asin)) return
    if (competitorAsins.includes(asin)) return
    competitorAsins.push(asin)
  }

  for (const seedAsin of CURRENT_COMPETITOR_SEED_ASINS) {
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
  const ourAsinSet = new Set(CURRENT_OUR_ASINS)
  const competitorAsins = await discoverCompetitorVariations(sp, marketplaceId)
  const allAsins = [...CURRENT_OUR_ASINS, ...competitorAsins]
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

function buildDiffRows(
  rows,
  snapshotTimestampUtc,
  snapshotDate,
  snapshotTimeLocal,
  trackedLabelsByAsin = new Map(),
  heroBsrAsins = new Set(),
) {
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
  const events = []
  const nextState = {
    timestamp_utc: snapshotTimestampUtc,
    snapshot_file: SNAPSHOT_HISTORY_FILE_NAME,
    by_asin: {},
  }

  for (const row of rows) {
    const previousRow = previousRowsByAsin.get(row.asin)
    const hasBaseline = Boolean(previousRow)
    const normalizedAsin = String(row.asin ?? '').trim().toUpperCase()
    const shouldSurfaceBsrChanges = heroBsrAsins.has(normalizedAsin)

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
    const fieldChanges = []
    const perAttributeChanges = {}
    for (const field of compareFields) {
      if (!hasBaseline) {
        perAttributeChanges[`${field}_changed`] = 'no_baseline'
        continue
      }

      const fieldChanged = field === 'image_urls'
        ? Boolean(addedImages.length || removedImages.length)
        : normalizeCompareValue(previousRow[field]) !== normalizeCompareValue(row[field])

      const isSuppressedBsrField = !shouldSurfaceBsrChanges && BSR_CHANGE_FIELDS.has(field)
      perAttributeChanges[`${field}_changed`] = fieldChanged
        ? (isSuppressedBsrField ? 'suppressed' : 'yes')
        : 'no'
      if (fieldChanged) {
        changedFields.push(field)
        if (field === 'image_urls') {
          fieldChanges.push({ field, added: addedImages, removed: removedImages })
        } else {
          fieldChanges.push({
            field,
            from: normalizeCompareValue(previousRow[field]),
            to: normalizeCompareValue(row[field]),
          })
        }
      }
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

    const {
      changedFields: visibleChangedFields,
      fieldChanges: visibleFieldChanges,
    } = filterVisibleBsrChanges(row.asin, changedFields, fieldChanges, heroBsrAsins)

    let event = null
    if (hasBaseline && visibleChangedFields.length > 0) {
      const trackedLabel = trackedLabelsByAsin.get(normalizedAsin) ?? null
      event = buildCanonicalEvent(
        row,
        previousRow,
        visibleChangedFields,
        visibleFieldChanges,
        snapshotTimestampUtc,
        normalizeCompareValue(previousRow.snapshot_timestamp_utc || baselineTimestampUtc),
        trackedLabel,
      )
      events.push(event)
    }

    diffs.push({
      snapshot_timestamp_utc: snapshotTimestampUtc,
      asin: row.asin,
      owner_type: row.owner_type,
      baseline_timestamp_utc: hasBaseline
        ? normalizeCompareValue(previousRow.snapshot_timestamp_utc || baselineTimestampUtc)
        : '',
      changed: hasBaseline ? (visibleChangedFields.length ? 'yes' : 'no') : 'no_baseline',
      changed_fields: hasBaseline ? visibleChangedFields.join(',') : '',
      changed_field_count: hasBaseline ? String(visibleChangedFields.length) : '',
      event_label: event?.label ?? '',
      event_severity: event?.severity ?? '',
      event_primary_category: event?.primary_category ?? '',
      event_categories: event ? event.categories.join('|') : '',
      event_field_changes: event ? JSON.stringify(event.field_changes) : '',
      event_headline: event?.headline ?? '',
      event_summary: event?.summary ?? '',
      added_images: hasBaseline ? addedImages.join(' | ') : '',
      removed_images: hasBaseline ? removedImages.join(' | ') : '',
      image_order_changed: '',
      ...perAttributeChanges,
    })
  }

  sortDiffs(diffs)
  events.sort(compareCanonicalEvents)

  return {
    diffs,
    events,
    nextState,
    statePath,
  }
}

// ─── HTML email builder ─────────────────────────────────────

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function humanizeField(field) {
  return field.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function buildAlertDigestHtml({ events, totalEvents, maxEvents, snapshotDate, timeLabel, appUrl, feedUrl }) {
  const F = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
  const M = "Menlo, Consolas, 'Courier New', monospace"
  const NAVY = '#002C51'
  const TEAL = '#00C2B9'
  const BORDER = '#e2e8f0'
  const logoUrl = `${appUrl}/brand/targon-logo-white.png`

  let alertRows = ''
  for (let i = 0; i < events.length; i++) {
    const a = events[i]
    const ownerLabel = String(a.owner_type).toUpperCase() === 'OUR' ? 'Ours' : 'Competitor'
    const ownerColor = ownerLabel === 'Ours' ? '#0d9488' : '#c2410c'
    const ownerBg = ownerLabel === 'Ours' ? '#f0fdfa' : '#fff7ed'
    const ownerBorder = ownerLabel === 'Ours' ? '#99f6e4' : '#fed7aa'
    const bg = i % 2 === 0 ? '#ffffff' : '#fafbfc'

    // Build field changes rows
    let changesRows = ''
    for (const change of a.field_changes) {
      if (change.field === 'image_urls') {
        const added = Array.isArray(change.added) ? change.added : []
        const removed = Array.isArray(change.removed) ? change.removed : []
        changesRows += `<tr>
          <td style="padding:6px 10px; font-family:${F}; font-size:12px; color:#475569; border-bottom:1px solid #f1f5f9;">Images</td>
          <td style="padding:6px 10px; font-family:${M}; font-size:11px; color:#94a3b8; border-bottom:1px solid #f1f5f9;" align="right">${esc(String(removed.length))} removed</td>
          <td style="padding:6px 10px; font-family:${M}; font-size:11px; font-weight:700; color:#0f172a; border-bottom:1px solid #f1f5f9;" align="right">${esc(String(added.length))} added</td>
        </tr>`
        continue
      }
      changesRows += `<tr>
        <td style="padding:6px 10px; font-family:${F}; font-size:12px; color:#475569; border-bottom:1px solid #f1f5f9;">${esc(humanizeField(change.field))}</td>
        <td style="padding:6px 10px; font-family:${M}; font-size:11px; color:#94a3b8; border-bottom:1px solid #f1f5f9;" align="right">${esc(String(change.from))}</td>
        <td style="padding:6px 10px; font-family:${M}; font-size:11px; font-weight:700; color:#0f172a; border-bottom:1px solid #f1f5f9;" align="right">${esc(String(change.to))}</td>
      </tr>`
    }

    alertRows += `
<!-- Alert ${i + 1} -->
<tr><td style="padding:0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; background:${bg}; border-bottom:1px solid ${BORDER};">
  <tr>
    <td style="padding:16px 20px 10px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:8px;">
            <span style="display:inline-block; padding:2px 7px; font-family:${F}; font-size:10px; font-weight:700; color:${ownerColor}; background:${ownerBg}; border:1px solid ${ownerBorder};">${esc(ownerLabel)}</span>
          </td>
          <td>
            <span style="font-family:${F}; font-size:14px; font-weight:700; color:#0f172a;">${esc(a.headline)}</span>
          </td>
        </tr>
      </table>
      <div style="font-family:${M}; font-size:10px; color:#94a3b8; margin-top:3px;">${esc(a.asin)}</div>
      <div style="font-family:${F}; font-size:12px; color:#475569; margin-top:6px;">${esc(a.summary)}</div>
    </td>
  </tr>
  <tr>
    <td style="padding:0 20px 14px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; border:1px solid ${BORDER};">
        <tr>
          <td style="padding:6px 10px; font-family:${F}; font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; background:#f8fafc; border-bottom:2px solid ${BORDER}; border-right:1px solid ${BORDER};">Field</td>
          <td style="padding:6px 10px; font-family:${F}; font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; background:#f8fafc; border-bottom:2px solid ${BORDER}; border-right:1px solid ${BORDER};" align="right">Before</td>
          <td style="padding:6px 10px; font-family:${F}; font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; background:#f8fafc; border-bottom:2px solid ${BORDER};" align="right">After</td>
        </tr>
        ${changesRows}
      </table>
    </td>
  </tr>
</table>
</td></tr>`
  }

  const overflowRow = totalEvents > maxEvents
    ? `<tr><td style="padding:12px 20px; font-family:${F}; font-size:12px; color:#94a3b8; text-align:center; border-bottom:1px solid ${BORDER};">...and ${totalEvents - maxEvents} more alert${totalEvents - maxEvents === 1 ? '' : 's'}</td></tr>`
    : ''

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
</head>
<body style="margin:0; padding:0; background:#f1f5f9;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%; max-width:600px;">

<!-- HEADER -->
<tr>
<td style="background:${NAVY}; padding:18px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td style="vertical-align:middle;">
  <span style="font-family:${F}; font-size:11px; font-weight:700; color:${NAVY}; background:${TEAL}; display:inline-block; width:22px; height:22px; line-height:22px; text-align:center; border-radius:50%; vertical-align:middle;">&bull;</span>
  <span style="font-family:${F}; font-size:16px; font-weight:800; color:${TEAL}; letter-spacing:0.14em; vertical-align:middle; padding-left:8px;">ARGUS</span>
</td>
<td align="right" style="vertical-align:middle;">
  <img src="${esc(logoUrl)}" width="100" height="26" alt="TARGON" style="display:inline-block; border:0; vertical-align:middle;">
</td>
</tr>
</table>
</td>
</tr>

<!-- TEAL BAR -->
<tr><td style="background:${TEAL}; height:3px; font-size:0; line-height:0;">&nbsp;</td></tr>

<!-- SUMMARY -->
<tr>
<td style="background:#ffffff; padding:20px 24px; border-left:1px solid ${BORDER}; border-right:1px solid ${BORDER}; border-bottom:1px solid ${BORDER};">
  <div style="font-family:${F}; font-size:16px; font-weight:700; color:#0f172a; margin:0 0 4px 0;">
    ${esc(String(totalEvents))} monitoring alert${totalEvents === 1 ? '' : 's'}
  </div>
  <div style="font-family:${F}; font-size:12px; color:#64748b;">
    ${esc(snapshotDate)} ${esc(timeLabel)} CT
  </div>
</td>
</tr>

<!-- ALERTS -->
${alertRows}
${overflowRow}

<!-- CTA -->
<tr>
<td style="background:#ffffff; padding:20px 24px; border-left:1px solid ${BORDER}; border-right:1px solid ${BORDER};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
  <td bgcolor="${TEAL}" style="mso-padding-alt:0;">
    <a href="${esc(feedUrl)}" target="_blank" style="display:inline-block; padding:11px 24px; font-family:${F}; font-size:13px; font-weight:700; color:${NAVY}; text-decoration:none;">
      Open change feed &rarr;
    </a>
  </td>
  </tr>
  </table>
</td>
</tr>

<!-- FOOTER -->
<tr>
<td style="background:#f8fafc; border:1px solid ${BORDER}; border-top:none; padding:14px 24px; text-align:center;">
  <div style="font-family:${F}; font-size:11px; color:#94a3b8;">
    Automated alert from Argus &middot; Targon
  </div>
</td>
</tr>

</table>
</td></tr>
</table>
</body></html>`
}

async function main() {
  let envMode = 'local'
  if (process.env.ARGUS_ENV_MODE && process.env.ARGUS_ENV_MODE.trim().length > 0) {
    envMode = process.env.ARGUS_ENV_MODE
  } else if (process.env.TARGONOS_ENV_MODE && process.env.TARGONOS_ENV_MODE.trim().length > 0) {
    envMode = process.env.TARGONOS_ENV_MODE
  }

  loadEnvForApp({
    repoRoot: REPO_ROOT,
    appName: 'argus',
    mode: envMode,
    targetEnv: process.env,
  })
  const market = resolveArgusMarket()
  const envSuffix = market.toUpperCase()
  MONITORING_HOURLY_LISTINGS_DIR = monitoringHourlyListingsDir(market)
  ensureDir(MONITORING_HOURLY_LISTINGS_DIR)

  const listingSourceConfig = listingSourceConfigForMarket(market)
  configureListingSource(listingSourceConfig)
  const competitorMainAsins = new Set(listingSourceConfig.listingCompetitorSeedAsins)
  const heroBsrAsins = new Set(listingSourceConfig.listingHeroBsrAsins)

  const appClientId = requiredEnv('AMAZON_SP_APP_CLIENT_ID')
  const appClientSecret = requiredEnv('AMAZON_SP_APP_CLIENT_SECRET')
  const refreshToken = requiredEnv(`AMAZON_REFRESH_TOKEN_${envSuffix}`)
  const region = requiredEnv(`AMAZON_SP_API_REGION_${envSuffix}`)
  const marketplaceId = requiredEnv(`AMAZON_MARKETPLACE_ID_${envSuffix}`)
  const sellerId = requiredEnv(`AMAZON_SELLER_ID_${envSuffix}`)
  const trackedAsinMarketplace = resolveTrackedAsinMarketplace(marketplaceId)
  const trackedLabelsByAsin = await loadTrackedAsinLabels(trackedAsinMarketplace)

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
    events,
    nextState,
    statePath,
  } = buildDiffRows(
    rows,
    snapshotTimestampUtc,
    snapshotDate,
    snapshotTimeLocal,
    trackedLabelsByAsin,
    heroBsrAsins,
  )

  const snapshotHistoryFile = path.join(MONITORING_HOURLY_LISTINGS_DIR, SNAPSHOT_HISTORY_FILE_NAME)
  const changesHistoryFile = path.join(MONITORING_HOURLY_LISTINGS_DIR, CHANGES_HISTORY_FILE_NAME)

  appendCsv(snapshotHistoryFile, rows)
  appendCsv(changesHistoryFile, diffs)
  fs.writeFileSync(statePath, JSON.stringify(nextState, null, 2))

  const emailEvents = selectEmailEvents(events)

  if (emailEvents.length > 0) {
    const appUrl = requiredEnv('NEXT_PUBLIC_APP_URL').replace(/\/$/, '')
    const timeLabel = snapshotTimeLocal.length === 4
      ? `${snapshotTimeLocal.slice(0, 2)}:${snapshotTimeLocal.slice(2)}`
      : snapshotTimeLocal
    const feedUrl = `${appUrl}/tracking?window=all&snapshot=${encodeURIComponent(snapshotTimestampUtc)}`

    const subject = `Argus: ${emailEvents.length} monitoring alert${emailEvents.length === 1 ? '' : 's'} (${snapshotDate} ${timeLabel} CT)`
    const lines = [
      `Argus monitoring detected ${emailEvents.length} change${emailEvents.length === 1 ? '' : 's'}.`,
      `Snapshot UTC: ${snapshotTimestampUtc}`,
      '',
      `Open change feed: ${feedUrl}`,
      '',
    ]

    const maxEvents = 40
    const visibleEvents = emailEvents.slice(0, maxEvents)
    for (const event of visibleEvents) {
      const eventUrl = `${feedUrl}&query=${encodeURIComponent(event.asin)}`
      lines.push(`${String(event.owner_type).toUpperCase()} ${event.headline}`)
      lines.push(`ASIN: ${event.asin}`)
      lines.push(`Baseline UTC: ${event.baseline_timestamp_utc}`)
      lines.push(`Summary: ${event.summary}`)
      lines.push(`Fields: ${event.changed_fields.join(', ')}`)
      for (const change of event.field_changes) {
        if (change.field === 'image_urls') {
          const added = Array.isArray(change.added) ? change.added : []
          const removed = Array.isArray(change.removed) ? change.removed : []
          lines.push(`- image_urls: +${added.length} -${removed.length}`)
          if (added.length) lines.push(`  added: ${added.slice(0, 3).join(' | ')}${added.length > 3 ? ' | …' : ''}`)
          if (removed.length) lines.push(`  removed: ${removed.slice(0, 3).join(' | ')}${removed.length > 3 ? ' | …' : ''}`)
          continue
        }

        lines.push(`- ${change.field}: ${change.from} -> ${change.to}`)
      }
      lines.push(`Link: ${eventUrl}`)
      lines.push('')
    }

    if (emailEvents.length > maxEvents) {
      lines.push(`...and ${emailEvents.length - maxEvents} more alert(s).`)
      lines.push('')
    }

    const html = buildAlertDigestHtml({
      events: visibleEvents,
      totalEvents: emailEvents.length,
      maxEvents,
      snapshotDate,
      timeLabel,
      appUrl,
      feedUrl,
    })

    await sendArgusAlertEmail({
      subject,
      text: lines.join('\n'),
      html,
    })
  }

  console.log('Hourly listing attributes collection complete')
  console.log(`competitor_variations=${competitorAsinCount}`)
  console.log(`email_alerts=${emailEvents.length}`)
  console.log(`competitor_main_asins=${[...competitorMainAsins].join('|')}`)
  console.log(`main_bsr_email_asins=${[...heroBsrAsins].join('|')}`)
  console.log(`asin_rows=${rows.length}`)
  console.log(`snapshot_history_file=${snapshotHistoryFile}`)
  console.log(`changes_history_file=${changesHistoryFile}`)
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
})
