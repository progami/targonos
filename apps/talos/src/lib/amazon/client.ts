import 'server-only'
import type { TenantCode } from '@/lib/tenant/constants'
import { getMarketplaceCurrencyCode } from '@/lib/amazon/fees'

type SellingPartnerApiRegion = 'eu' | 'na' | 'fe'

type SellingPartnerApiClient = {
  callAPI: (params: Record<string, unknown>) => Promise<unknown>
}

type AmazonInventorySummary = {
  asin?: string
  sellerSku?: string
  fnSku?: string
  totalQuantity?: number
  productName?: string
}

type AmazonInventorySummariesResponse = {
  inventorySummaries?: AmazonInventorySummary[]
}

type AmazonCatalogMeasurement = {
  value?: number
  unit?: string
}

type AmazonCatalogItemAttributes = {
  item_name?: Array<{ value?: string }>
  item_dimensions?: Array<{
    length?: AmazonCatalogMeasurement
    width?: AmazonCatalogMeasurement
    height?: AmazonCatalogMeasurement
  }>
  item_package_dimensions?: Array<{
    length?: AmazonCatalogMeasurement
    width?: AmazonCatalogMeasurement
    height?: AmazonCatalogMeasurement
  }>
  package_dimensions?: Array<{
    length?: AmazonCatalogMeasurement
    width?: AmazonCatalogMeasurement
    height?: AmazonCatalogMeasurement
  }>
  item_weight?: Array<AmazonCatalogMeasurement>
  item_package_weight?: Array<AmazonCatalogMeasurement>
  package_weight?: Array<AmazonCatalogMeasurement>
}

type AmazonCatalogItemSummary = {
  itemName?: string
  itemClassification?: string
  browseClassification?: { displayName?: string }
  websiteDisplayGroupName?: string
}

type AmazonCatalogItemRelationships = {
  relationships?: Array<{
    parentAsins?: string[]
    childAsins?: string[]
  }>
}

type AmazonCatalogItemResponse = {
  asin?: string
  attributes?: AmazonCatalogItemAttributes
  summaries?: AmazonCatalogItemSummary[]
  relationships?: AmazonCatalogItemRelationships[]
}

type AmazonSearchCatalogItemsResponse = {
  numberOfResults?: number
  items?: AmazonCatalogItemResponse[]
}

export type AmazonCatalogListingType = 'LISTING' | 'PARENT' | 'UNKNOWN'

type AmazonListingItemSummary = {
  sellerSku: string
  asin: string | null
  title: string | null
}

type AmazonFinancialEventsResponse = {
  FinancialEvents?: {
    ServiceFeeEventList?: Array<{ FeeDescription?: string }>
  }
}

type AmazonErrorDetail = { code?: string; message?: string; details?: string }

type AmazonInboundShipment = {
  ShipmentId?: string
  ShipmentName?: string
  ShipFromAddress?: Record<string, unknown>
  DestinationFulfillmentCenterId?: string
  ShipmentStatus?: string
  LabelPrepType?: string
  BoxContentsSource?: string
  AreCasesRequired?: boolean
  ConfirmedNeedByDate?: string
}

type AmazonInboundShipmentItem = {
  ShipmentId?: string
  SellerSKU?: string
  FulfillmentNetworkSKU?: string
  QuantityShipped?: number
  QuantityReceived?: number
  QuantityInCase?: number
  ReleaseDate?: string
  PrepDetailsList?: unknown
}

type AmazonInboundShipmentsResponse = {
  payload?: {
    ShipmentData?: AmazonInboundShipment[]
    NextToken?: string
  }
  errors?: AmazonErrorDetail[]
}

type AmazonInboundShipmentItemsResponse = {
  payload?: {
    ItemData?: AmazonInboundShipmentItem[]
    NextToken?: string
  }
  errors?: AmazonErrorDetail[]
}

type AmazonBillOfLadingResponse = {
  payload?: {
    DownloadURL?: string
  }
  errors?: AmazonErrorDetail[]
}

type AmazonInboundPlanMatch = {
  inboundPlanId: string
  inboundPlan: Record<string, unknown> | null
  shipment: Record<string, unknown> | null
  items: Record<string, unknown>[]
  placementOptions: Record<string, unknown> | unknown[] | null
  transportationOptions: Record<string, unknown> | unknown[] | null
}

type AmazonInboundShipmentNormalized = {
  shipmentId: string
  shipmentName?: string
  shipmentStatus?: string
  destinationFulfillmentCenterId?: string
  labelPrepType?: string
  boxContentsSource?: string
  referenceId?: string
  shipFromAddress?: Record<string, unknown> | null
  shipToAddress?: Record<string, unknown> | null
  inboundPlanId?: string
  inboundOrderId?: string
}

async function callAmazonApi<T>(tenantCode: TenantCode | undefined, params: Record<string, unknown>): Promise<T> {
  const client = getAmazonClient(tenantCode)
  return (await client.callAPI(params)) as T
}

type AmazonSpApiConfig = {
  region: SellingPartnerApiRegion
  refreshToken: string
  marketplaceId: string
  appClientId: string
  appClientSecret: string
  sellerId?: string
}

const AMAZON_BASE_REQUIRED_ENV_VARS = [
  'AMAZON_SP_APP_CLIENT_ID',
  'AMAZON_SP_APP_CLIENT_SECRET',
] as const

const AMAZON_TENANT_REQUIRED_ENV_VARS = ['AMAZON_REFRESH_TOKEN'] as const

const clientCache = new Map<string, SellingPartnerApiClient>()

// Pricing cache to avoid repeated API calls for the same ASIN
// Key: `${tenantCode}:${asin}`, Value: { price, expiresAt }
const PRICING_CACHE_TTL_MS = 5 * 60_000 // 5 minutes
const pricingCache = new Map<string, { price: number | null; expiresAt: number }>()

function getPricingCacheKey(asin: string, tenantCode?: TenantCode): string {
  return `${tenantCode ?? 'default'}:${asin.toUpperCase()}`
}

function getCachedPrice(asin: string, tenantCode?: TenantCode): number | null | undefined {
  const key = getPricingCacheKey(asin, tenantCode)
  const cached = pricingCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.price
  }
  return undefined // undefined means not cached, null means cached as "no price found"
}

function setCachedPrice(asin: string, tenantCode: TenantCode | undefined, price: number | null): void {
  const key = getPricingCacheKey(asin, tenantCode)
  pricingCache.set(key, { price, expiresAt: Date.now() + PRICING_CACHE_TTL_MS })

  // Prune old entries periodically (keep cache size bounded)
  if (pricingCache.size > 500) {
    const now = Date.now()
    for (const [k, v] of pricingCache) {
      if (v.expiresAt < now) {
        pricingCache.delete(k)
      }
    }
  }
}

function normalizeRegion(value: string): SellingPartnerApiRegion | null {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'eu' || normalized === 'na' || normalized === 'fe') {
    return normalized
  }
  return null
}

function readEnvVar(name: string): string | undefined {
  const value = process.env[name]
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function getDefaultMarketplaceId(tenantCode: TenantCode | undefined): string | undefined {
  if (tenantCode === 'US') return 'ATVPDKIKX0DER'
  if (tenantCode === 'UK') return 'A1F83G8C2ARO7P'
  return undefined
}

function getDefaultRegion(tenantCode: TenantCode | undefined): SellingPartnerApiRegion {
  if (tenantCode === 'US') return 'na'
  if (tenantCode === 'UK') return 'eu'
  return 'eu'
}

function extractAmazonErrors(response: { errors?: AmazonErrorDetail[] } | null | undefined): string[] {
  if (!response?.errors?.length) return []
  return response.errors
    .map(error => error?.message?.trim() || error?.details?.trim())
    .filter((message): message is string => Boolean(message))
}

function unwrapAmazonPayload(response: unknown): Record<string, unknown> | null {
  const record = asRecord(response)
  if (!record) return null
  const payload = asRecord(record.payload)
  return payload ?? record
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function getRecordValue(record: Record<string, unknown> | null | undefined, key: string): unknown {
  if (!record) return undefined
  if (record[key] !== undefined) return record[key]
  const lowered = key.toLowerCase()
  const match = Object.keys(record).find(entry => entry.toLowerCase() === lowered)
  return match ? record[match] : undefined
}

function getStringField(record: Record<string, unknown> | null | undefined, keys: string[]): string | undefined {
  if (!record) return undefined
  for (const key of keys) {
    const value = getRecordValue(record, key)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function getArrayField(record: Record<string, unknown> | null | undefined, keys: string[]): unknown[] {
  if (!record) return []
  for (const key of keys) {
    const value = getRecordValue(record, key)
    if (Array.isArray(value)) return value
    const nested = asRecord(value)
    if (nested) {
      const nestedArray = getArrayField(nested, ['items', 'data', 'plans', 'inboundPlans', 'shipments', 'shipmentItems'])
      if (nestedArray.length) return nestedArray
    }
  }
  return []
}

function isAddressLike(record: Record<string, unknown>): boolean {
  const addressKeys = [
    'AddressLine1',
    'AddressLine2',
    'AddressLine3',
    'City',
    'StateOrProvinceCode',
    'PostalCode',
    'CountryCode',
    'addressLine1',
    'addressLine2',
    'addressLine3',
    'city',
    'stateOrProvinceCode',
    'stateOrProvince',
    'postalCode',
    'zipCode',
    'countryCode',
    'country',
  ]
  return addressKeys.some(key => typeof getRecordValue(record, key) === 'string')
}

function normalizeAsinKey(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.toUpperCase()
}

function resolveListingTypeFromClassification(value: string | undefined): AmazonCatalogListingType {
  if (typeof value !== 'string') return 'UNKNOWN'
  const normalized = value.trim().toUpperCase()
  if (!normalized) return 'UNKNOWN'
  if (normalized === 'VARIATION_PARENT') return 'PARENT'
  return 'LISTING'
}

export async function getCatalogListingTypesByAsin(
  asins: string[],
  tenantCode?: TenantCode
): Promise<Map<string, AmazonCatalogListingType>> {
  const results = new Map<string, AmazonCatalogListingType>()
  const uniqueAsins: string[] = []
  const seen = new Set<string>()

  for (const asin of asins) {
    const normalized = normalizeAsinKey(asin)
    if (!normalized) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    uniqueAsins.push(normalized)
  }

  const chunkSize = 20

  for (let offset = 0; offset < uniqueAsins.length; offset += chunkSize) {
    const chunk = uniqueAsins.slice(offset, offset + chunkSize)
    const config = getAmazonSpApiConfigFromEnv(tenantCode)

    const response = await callAmazonApi<AmazonSearchCatalogItemsResponse>(tenantCode, {
      operation: 'searchCatalogItems',
      endpoint: 'catalogItems',
      options: { version: '2022-04-01' },
      query: {
        marketplaceIds: [config?.marketplaceId ?? process.env.AMAZON_MARKETPLACE_ID],
        identifiersType: 'ASIN',
        identifiers: chunk,
        includedData: 'summaries,relationships',
      },
    })

    if (!response.items?.length) continue

    for (const item of response.items) {
      const asinValue = typeof item.asin === 'string' ? item.asin : ''
      const normalized = normalizeAsinKey(asinValue)
      if (!normalized) continue
      const summary = item.summaries?.[0]
      const classification = summary?.itemClassification
      results.set(normalized, resolveListingTypeFromClassification(classification))
    }
  }

  for (const asin of uniqueAsins) {
    if (results.has(asin)) continue
    results.set(asin, 'UNKNOWN')
  }

  return results
}

function getRecordField(record: Record<string, unknown> | null | undefined, keys: string[]): Record<string, unknown> | null {
  if (!record) return null
  for (const key of keys) {
    const value = getRecordValue(record, key)
    const direct = asRecord(value)
    if (direct) {
      if (isAddressLike(direct)) return direct
      const nested = asRecord(getRecordValue(direct, 'address')) || asRecord(getRecordValue(direct, 'Address'))
      if (nested && isAddressLike(nested)) return nested
      return direct
    }
  }
  return null
}

function pickString(
  records: Array<Record<string, unknown> | null | undefined>,
  keys: string[]
): string | undefined {
  for (const record of records) {
    const value = getStringField(record, keys)
    if (value) return value
  }
  return undefined
}

function pickAddress(
  records: Array<Record<string, unknown> | null | undefined>,
  keys: string[]
): Record<string, unknown> | null {
  for (const record of records) {
    const value = getRecordField(record, keys)
    if (value) return value
  }
  return null
}

function extractPaginationToken(record: Record<string, unknown> | null | undefined): string | undefined {
  if (!record) return undefined
  const direct = getStringField(record, ['nextToken', 'paginationToken'])
  if (direct) return direct
  const pagination = asRecord(getRecordValue(record, 'pagination'))
  return getStringField(pagination, ['nextToken', 'paginationToken'])
}

function toRecordArray(values: unknown[]): Record<string, unknown>[] {
  return values
    .map((value) => asRecord(value))
    .filter((value): value is Record<string, unknown> => Boolean(value))
}

function getAmazonSpApiConfigFromEnv(tenantCode?: TenantCode): AmazonSpApiConfig | null {
  const isProduction = process.env.NODE_ENV === 'production'
  const anyAmazonEnvConfigured =
    AMAZON_BASE_REQUIRED_ENV_VARS.some((name) => Boolean(readEnvVar(name))) ||
    AMAZON_TENANT_REQUIRED_ENV_VARS.some((name) => Boolean(readEnvVar(name) || readEnvVar(`${name}_US`) || readEnvVar(`${name}_UK`)))

  if (!anyAmazonEnvConfigured) {
    if (isProduction) {
      throw new Error(
        'Amazon SP-API not configured. Missing env vars: AMAZON_SP_APP_CLIENT_ID, AMAZON_SP_APP_CLIENT_SECRET, AMAZON_REFRESH_TOKEN[_US|_UK]'
      )
    }

    return null
  }

  const appClientId = readEnvVar('AMAZON_SP_APP_CLIENT_ID')
  const appClientSecret = readEnvVar('AMAZON_SP_APP_CLIENT_SECRET')

  const refreshToken = tenantCode
    ? readEnvVar(`AMAZON_REFRESH_TOKEN_${tenantCode}`)
    : readEnvVar('AMAZON_REFRESH_TOKEN')

  const marketplaceId =
    (tenantCode ? readEnvVar(`AMAZON_MARKETPLACE_ID_${tenantCode}`) : readEnvVar('AMAZON_MARKETPLACE_ID')) ||
    getDefaultMarketplaceId(tenantCode)

  const regionRaw =
    (tenantCode ? readEnvVar(`AMAZON_SP_API_REGION_${tenantCode}`) : readEnvVar('AMAZON_SP_API_REGION')) ||
    getDefaultRegion(tenantCode)
  const region = normalizeRegion(regionRaw)

  const sellerId = tenantCode
    ? readEnvVar(`AMAZON_SELLER_ID_${tenantCode}`)
    : readEnvVar('AMAZON_SELLER_ID')

  const missing: string[] = []
  if (!appClientId) missing.push('AMAZON_SP_APP_CLIENT_ID')
  if (!appClientSecret) missing.push('AMAZON_SP_APP_CLIENT_SECRET')

  if (!refreshToken) {
    missing.push(tenantCode ? `AMAZON_REFRESH_TOKEN_${tenantCode}` : 'AMAZON_REFRESH_TOKEN')
  }
  if (!marketplaceId) {
    missing.push(tenantCode ? `AMAZON_MARKETPLACE_ID_${tenantCode}` : 'AMAZON_MARKETPLACE_ID')
  }

  if (missing.length > 0) {
    throw new Error(`Amazon SP-API not configured. Missing env vars: ${missing.join(', ')}`)
  }

  if (!region) {
    const key = tenantCode ? `AMAZON_SP_API_REGION_${tenantCode}` : 'AMAZON_SP_API_REGION'
    throw new Error(`Invalid ${key} value "${regionRaw}". Expected one of: eu, na, fe.`)
  }

  return {
    region,
    refreshToken,
    marketplaceId,
    appClientId,
    appClientSecret,
    sellerId: sellerId || undefined,
  }
}

function getCacheKey(config: AmazonSpApiConfig) {
  return `${config.region}:${config.marketplaceId}:${config.refreshToken}`
}

function createAmazonClient(config: AmazonSpApiConfig): SellingPartnerApiClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const SellingPartnerAPI = require('amazon-sp-api') as new (params: unknown) => SellingPartnerApiClient

  return new SellingPartnerAPI({
    region: config.region, // 'eu', 'na', or 'fe'
    refresh_token: config.refreshToken,
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: config.appClientId,
      SELLING_PARTNER_APP_CLIENT_SECRET: config.appClientSecret,
    },
    options: {
      auto_request_tokens: true,
      auto_request_throttled: true,
      use_sandbox: false,
    },
  })
}

export function getAmazonClient(tenantCode?: TenantCode): SellingPartnerApiClient {
  const config = getAmazonSpApiConfigFromEnv(tenantCode)
  if (!config) {
    // Use mock client for local dev/testing when not configured.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const mockClient = require('./mock-client') as { getAmazonClient: () => SellingPartnerApiClient }
    return mockClient.getAmazonClient()
  }

  const key = getCacheKey(config)
  const cached = clientCache.get(key)
  if (cached) return cached

  const client = createAmazonClient(config)
  clientCache.set(key, client)
  return client
}

export async function getListingsItems(
  tenantCode?: TenantCode,
  options?: {
    limit?: number
  }
): Promise<{ items: AmazonListingItemSummary[]; hasMore: boolean }> {
  const limit = Math.min(options?.limit ?? 250, 1000)
  if (!limit) return { items: [], hasMore: false }

  const config = getAmazonSpApiConfigFromEnv(tenantCode)
  const sellerId = config?.sellerId
  const marketplaceId = config?.marketplaceId ?? process.env.AMAZON_MARKETPLACE_ID

  if (!sellerId) {
    throw new Error('AMAZON_SELLER_ID environment variable is required for Amazon import')
  }

  // Use Listings API instead of FBA Inventory API
  // This returns all catalog listings, not just items with FBA inventory
  // Allows importing products before inventory lands at Amazon warehouses
  const response = await callAmazonApi<{
    numberOfResults?: number
    items?: Array<{
      sku?: string
      summaries?: Array<{
        asin?: string
        productType?: string
        status?: string[]
      }>
    }>
  }>(tenantCode, {
    api_path: `/listings/2021-08-01/items/${sellerId}`,
    method: 'GET',
    query: {
      marketplaceIds: marketplaceId,
    },
  })

  const listingsItems = response.items ?? []
  const seen = new Set<string>()
  const items: AmazonListingItemSummary[] = []

  for (const item of listingsItems) {
    if (items.length >= limit) break

    const sellerSku = typeof item.sku === 'string' ? item.sku.trim() : ''
    if (!sellerSku) continue

    const normalizedKey = sellerSku.toUpperCase()
    if (seen.has(normalizedKey)) continue
    seen.add(normalizedKey)

    const asin = item.summaries?.[0]?.asin
    const normalizedAsin = typeof asin === 'string' && asin.trim() ? asin.trim() : null

    // Listings API doesn't return title; import flow fetches it from Catalog API
    items.push({ sellerSku, asin: normalizedAsin, title: null })
  }

  return { items, hasMore: listingsItems.length > items.length }
}

// Helper functions for common operations
export async function getInventory(tenantCode?: TenantCode) {
  try {
    const config = getAmazonSpApiConfigFromEnv(tenantCode)
    const response = await callAmazonApi<AmazonInventorySummariesResponse>(tenantCode, {
      operation: 'getInventorySummaries',
      endpoint: 'fbaInventory',
      query: {
        marketplaceIds: [config?.marketplaceId ?? process.env.AMAZON_MARKETPLACE_ID],
        granularityType: 'Marketplace',
        granularityId: config?.marketplaceId ?? process.env.AMAZON_MARKETPLACE_ID,
      },
    })
    return response
  } catch (_error) {
    // console.error('Error fetching Amazon inventory:', _error)
    throw _error
  }
}

export async function getInboundShipments(
  tenantCode?: TenantCode,
  options?: { nextToken?: string }
) {
  try {
    const config = getAmazonSpApiConfigFromEnv(tenantCode)
    const nextToken = options?.nextToken?.trim()
    const baseQuery = {
      MarketplaceId: config?.marketplaceId ?? process.env.AMAZON_MARKETPLACE_ID,
      ShipmentStatusList: ['WORKING', 'SHIPPED', 'RECEIVING', 'CLOSED', 'CANCELLED', 'DELETED'],
    }
    const response = await callAmazonApi<unknown>(tenantCode, {
      operation: 'getShipments',
      endpoint: 'fulfillmentInbound',
      query: nextToken ? { ...baseQuery, NextToken: nextToken } : baseQuery,
    })
    return response
  } catch (_error) {
    // console.error('Error fetching inbound shipments:', _error)
    throw _error
  }
}

async function safeAmazonCall<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call()
  } catch {
    return null
  }
}

async function findInboundPlanForShipment(
  shipmentId: string,
  tenantCode?: TenantCode
): Promise<AmazonInboundPlanMatch | null> {
  const maxPages = 3
  const maxPlans = 40
  let paginationToken: string | undefined
  let checked = 0

  for (let page = 0; page < maxPages; page += 1) {
    const listResponse = await safeAmazonCall(() =>
      callAmazonApi<Record<string, unknown>>(tenantCode, {
        operation: 'listInboundPlans',
        endpoint: 'fulfillmentInbound',
        options: { version: '2024-03-20' },
        query: paginationToken ? { paginationToken } : undefined,
      })
    )

    const listRecord = asRecord(listResponse)
    if (!listRecord) return null

    const plans = toRecordArray(getArrayField(listRecord, ['inboundPlans', 'plans', 'items']))
    for (const plan of plans) {
      const planId = getStringField(plan, ['inboundPlanId', 'planId', 'id'])
      if (!planId) continue
      checked += 1
      if (checked > maxPlans) return null

      const shipment = await safeAmazonCall(() =>
        callAmazonApi<Record<string, unknown>>(tenantCode, {
          operation: 'getShipment',
          endpoint: 'fulfillmentInbound',
          options: { version: '2024-03-20' },
          path: { inboundPlanId: planId, shipmentId },
        })
      )

      if (!shipment) continue

      const inboundPlan = await safeAmazonCall(() =>
        callAmazonApi<Record<string, unknown>>(tenantCode, {
          operation: 'getInboundPlan',
          endpoint: 'fulfillmentInbound',
          options: { version: '2024-03-20' },
          path: { inboundPlanId: planId },
        })
      )

      const itemsResponse = await safeAmazonCall(() =>
        callAmazonApi<Record<string, unknown>>(tenantCode, {
          operation: 'listShipmentItems',
          endpoint: 'fulfillmentInbound',
          options: { version: '2024-03-20' },
          path: { inboundPlanId: planId, shipmentId },
        })
      )

      const itemsRecord = asRecord(itemsResponse)
      const items = toRecordArray(getArrayField(itemsRecord, ['items', 'shipmentItems', 'itemData']))

      const placementResponse = await safeAmazonCall(() =>
        callAmazonApi<unknown>(tenantCode, {
          operation: 'listPlacementOptions',
          endpoint: 'fulfillmentInbound',
          options: { version: '2024-03-20' },
          path: { inboundPlanId: planId },
        })
      )

      const transportationResponse = await safeAmazonCall(() =>
        callAmazonApi<unknown>(tenantCode, {
          operation: 'listTransportationOptions',
          endpoint: 'fulfillmentInbound',
          options: { version: '2024-03-20' },
          path: { inboundPlanId: planId },
        })
      )

      const placementOptions =
        asRecord(placementResponse) || (Array.isArray(placementResponse) ? placementResponse : null)
      const transportationOptions =
        asRecord(transportationResponse) ||
        (Array.isArray(transportationResponse) ? transportationResponse : null)

      return {
        inboundPlanId: planId,
        inboundPlan: asRecord(inboundPlan) ?? null,
        shipment: asRecord(shipment) ?? null,
        items,
        placementOptions,
        transportationOptions,
      }
    }

    paginationToken = extractPaginationToken(listRecord)
    if (!paginationToken) return null
  }

  return null
}

function normalizeInboundShipmentDetails(params: {
  shipmentId: string
  fbaShipment: AmazonInboundShipment | null
  inboundPlanMatch: AmazonInboundPlanMatch | null
  awdShipment: Record<string, unknown> | null
  awdInboundOrder: Record<string, unknown> | null
}): AmazonInboundShipmentNormalized {
  const fbaRecord = params.fbaShipment ? (params.fbaShipment as Record<string, unknown>) : null
  const planShipment = params.inboundPlanMatch?.shipment ?? null
  const planRecord = params.inboundPlanMatch?.inboundPlan ?? null
  const awdShipment = params.awdShipment
  const awdInboundOrder = params.awdInboundOrder

  const shipmentName = pickString(
    [planShipment, awdShipment, fbaRecord],
    ['ShipmentName', 'shipmentName', 'name']
  )
  const shipmentStatus = pickString(
    [planShipment, awdShipment, fbaRecord],
    ['ShipmentStatus', 'shipmentStatus', 'status']
  )
  const destinationFulfillmentCenterId = pickString(
    [planShipment, awdShipment, fbaRecord],
    [
      'DestinationFulfillmentCenterId',
      'destinationFulfillmentCenterId',
      'fulfillmentCenterId',
      'destinationWarehouseId',
      'destinationId',
    ]
  )
  const labelPrepType = pickString(
    [planShipment, awdShipment, fbaRecord],
    ['LabelPrepType', 'labelPrepType']
  )
  const boxContentsSource = pickString(
    [planShipment, awdShipment, fbaRecord],
    ['BoxContentsSource', 'boxContentsSource']
  )
  const referenceId = pickString(
    [planShipment, planRecord, awdShipment, awdInboundOrder, fbaRecord],
    [
      'AmazonReferenceId',
      'amazonReferenceId',
      'referenceId',
      'ReferenceId',
      'referenceNumber',
      'poNumber',
      'purchaseOrderId',
    ]
  )

  const shipFromAddress = pickAddress(
    [planShipment, awdShipment, fbaRecord],
    ['ShipFromAddress', 'shipFromAddress', 'originAddress', 'sourceAddress', 'shipFrom']
  )
  const shipToAddress = pickAddress(
    [planShipment, awdShipment, fbaRecord],
    ['ShipToAddress', 'shipToAddress', 'destinationAddress', 'destination', 'shipTo']
  )

  return {
    shipmentId: params.shipmentId,
    shipmentName,
    shipmentStatus,
    destinationFulfillmentCenterId,
    labelPrepType,
    boxContentsSource,
    referenceId,
    shipFromAddress,
    shipToAddress,
    inboundPlanId: params.inboundPlanMatch?.inboundPlanId,
    inboundOrderId: pickString(
      [awdShipment, awdInboundOrder],
      ['inboundOrderId', 'orderId', 'inboundOrderID']
    ),
  }
}

export async function getInboundShipmentDetails(shipmentId: string, tenantCode?: TenantCode) {
  const trimmedShipmentId = shipmentId.trim()
  if (!trimmedShipmentId) {
    throw new Error('Shipment ID is required')
  }

  const config = getAmazonSpApiConfigFromEnv(tenantCode)
  const marketplaceId = config?.marketplaceId ?? process.env.AMAZON_MARKETPLACE_ID

  if (!marketplaceId) {
    throw new Error('Amazon marketplace ID is not configured')
  }

  let shipment: AmazonInboundShipment | null = null
  let items: AmazonInboundShipmentItem[] = []
  let billOfLadingUrl: string | null = null
  let fbaError: string | null = null

  const shipmentResponse = await safeAmazonCall(() =>
    callAmazonApi<AmazonInboundShipmentsResponse>(tenantCode, {
      operation: 'getShipments',
      endpoint: 'fulfillmentInbound',
      query: {
        QueryType: 'SHIPMENT',
        ShipmentIdList: [trimmedShipmentId],
        MarketplaceId: marketplaceId,
      },
    })
  )

  if (shipmentResponse) {
    const shipmentErrors = extractAmazonErrors(shipmentResponse)
    if (shipmentErrors.length > 0) {
      fbaError = shipmentErrors.join(' ')
    } else {
      const shipmentPayload = unwrapAmazonPayload(shipmentResponse)
      const shipmentData = getArrayField(shipmentPayload, [
        'ShipmentData',
        'shipments',
        'shipmentData',
      ])
      shipment = (shipmentData[0] as AmazonInboundShipment | undefined) ?? null
    }
  }

  if (shipment) {
    const itemsResponse = await safeAmazonCall(() =>
      callAmazonApi<AmazonInboundShipmentItemsResponse>(tenantCode, {
        operation: 'getShipmentItemsByShipmentId',
        endpoint: 'fulfillmentInbound',
        path: {
          shipmentId: trimmedShipmentId,
        },
      })
    )

    if (itemsResponse) {
      const itemErrors = extractAmazonErrors(itemsResponse)
      if (itemErrors.length > 0) {
        fbaError = fbaError ?? itemErrors.join(' ')
      } else {
        const itemsPayload = unwrapAmazonPayload(itemsResponse)
        items = getArrayField(itemsPayload, ['ItemData', 'items', 'shipmentItems'])
      }
    }

    const bolResponse = await safeAmazonCall(() =>
      callAmazonApi<AmazonBillOfLadingResponse>(tenantCode, {
        operation: 'getBillOfLading',
        endpoint: 'fulfillmentInbound',
        path: {
          shipmentId: trimmedShipmentId,
        },
      })
    )
    if (bolResponse) {
      const bolErrors = extractAmazonErrors(bolResponse)
      if (bolErrors.length === 0) {
        const bolPayload = unwrapAmazonPayload(bolResponse)
        billOfLadingUrl = getStringField(bolPayload, ['DownloadURL', 'downloadUrl']) ?? null
      }
    }
  }

  const awdShipmentResponse = await safeAmazonCall(() =>
    callAmazonApi<Record<string, unknown>>(tenantCode, {
      operation: 'getInboundShipment',
      endpoint: 'amazonWarehousingAndDistribution',
      options: { version: '2024-05-09' },
      path: { shipmentId: trimmedShipmentId },
    })
  )

  const awdShipment = asRecord(awdShipmentResponse)
  const awdInboundOrderId = getStringField(awdShipment, ['inboundOrderId', 'orderId', 'inboundOrderID'])
  const awdInboundOrderResponse = awdInboundOrderId
    ? await safeAmazonCall(() =>
        callAmazonApi<Record<string, unknown>>(tenantCode, {
          operation: 'getInbound',
          endpoint: 'amazonWarehousingAndDistribution',
          options: { version: '2024-05-09' },
          path: { orderId: awdInboundOrderId },
        })
      )
    : null

  const awdInboundOrder = asRecord(awdInboundOrderResponse)
  const inboundPlanMatch = await findInboundPlanForShipment(trimmedShipmentId, tenantCode)
  const normalized = normalizeInboundShipmentDetails({
    shipmentId: trimmedShipmentId,
    fbaShipment: shipment,
    inboundPlanMatch,
    awdShipment,
    awdInboundOrder,
  })

  if (
    !shipment &&
    items.length === 0 &&
    !awdShipment &&
    !inboundPlanMatch?.shipment &&
    !inboundPlanMatch?.inboundPlan
  ) {
    throw new Error(fbaError ?? 'Amazon shipment not found')
  }

  return {
    shipmentId: trimmedShipmentId,
    shipment,
    items,
    billOfLadingUrl,
    awdShipment,
    awdInboundOrder,
    inboundPlan: inboundPlanMatch?.inboundPlan ?? null,
    inboundPlanShipment: inboundPlanMatch?.shipment ?? null,
    inboundPlanItems: inboundPlanMatch?.items ?? [],
    inboundPlanPlacementOptions: inboundPlanMatch?.placementOptions ?? null,
    inboundPlanTransportationOptions: inboundPlanMatch?.transportationOptions ?? null,
    normalized,
  }
}

export async function getOrders(createdAfter?: Date, tenantCode?: TenantCode) {
  try {
    const config = getAmazonSpApiConfigFromEnv(tenantCode)
    const response = await callAmazonApi<unknown>(tenantCode, {
      operation: 'getOrders',
      endpoint: 'orders',
      query: {
        marketplaceIds: [config?.marketplaceId ?? process.env.AMAZON_MARKETPLACE_ID],
        createdAfter: createdAfter || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Default to last 7 days
      },
    })
    return response
  } catch (_error) {
    // console.error('Error fetching orders:', _error)
    throw _error
  }
}

export async function getCatalogItem(asin: string, tenantCode?: TenantCode) {
  try {
    const config = getAmazonSpApiConfigFromEnv(tenantCode)
    const response = await callAmazonApi<AmazonCatalogItemResponse>(tenantCode, {
      operation: 'getCatalogItem',
      endpoint: 'catalogItems',
      options: { version: '2022-04-01' },
      path: {
        asin,
      },
      query: {
        marketplaceIds: [config?.marketplaceId ?? process.env.AMAZON_MARKETPLACE_ID],
        includedData: 'summaries,attributes,relationships',
      },
    })
    return response
  } catch (_error) {
    // console.error('Error fetching catalog item:', _error)
    throw _error
  }
}

export async function getProductFees(asin: string, price: number, tenantCode?: TenantCode) {
  try {
    const config = getAmazonSpApiConfigFromEnv(tenantCode)
    const currencyCode = getMarketplaceCurrencyCode(tenantCode)
    const response = await callAmazonApi<unknown>(tenantCode, {
      operation: 'getMyFeesEstimateForASIN',
      endpoint: 'productFees',
      path: {
        Asin: asin,
      },
      body: {
        FeesEstimateRequest: {
          MarketplaceId: config?.marketplaceId ?? process.env.AMAZON_MARKETPLACE_ID,
          Identifier: `fee-estimate-${asin}`,
          IsAmazonFulfilled: true,
          PriceToEstimateFees: {
            ListingPrice: {
              CurrencyCode: currencyCode,
              Amount: price,
            },
          },
        },
      },
    })
    return response
  } catch (_error) {
    // console.error('Error fetching product fees:', _error)
    throw _error
  }
}

/**
 * Get the current listing price for an ASIN from Amazon's Pricing API.
 * Uses getPricing which returns the seller's own listing price.
 * Returns the seller's listing price if available, null otherwise.
 * Results are cached for 5 minutes to reduce API calls.
 */
export async function getListingPrice(asin: string, tenantCode?: TenantCode): Promise<number | null> {
  // Check cache first
  const cached = getCachedPrice(asin, tenantCode)
  if (cached !== undefined) {
    return cached
  }

  const result = await getListingPriceDebug(asin, tenantCode)
  return result.price
}

/**
 * Debug version of getListingPrice that returns both the price and the raw API response.
 * Also populates the pricing cache.
 */
export async function getListingPriceDebug(
  asin: string,
  tenantCode?: TenantCode
): Promise<{ price: number | null; rawResponse: unknown }> {
  try {
    const config = getAmazonSpApiConfigFromEnv(tenantCode)
    const marketplaceId = config?.marketplaceId ?? process.env.AMAZON_MARKETPLACE_ID

    // Use getPricing which returns our own seller's price for the ASIN
    const response = await callAmazonApi<unknown>(tenantCode, {
      operation: 'getPricing',
      endpoint: 'productPricing',
      query: {
        MarketplaceId: marketplaceId,
        ItemType: 'Asin',
        Asins: asin,
        ItemCondition: 'New',
      },
    })

    // Parse the response - getPricing returns our own seller's offers for the ASIN
    // Response can be either an array directly or wrapped in { payload: [...] }
    type PricingItem = {
      ASIN?: string
      status?: string
      Product?: {
        Offers?: Array<{
          BuyingPrice?: {
            ListingPrice?: { Amount?: number; CurrencyCode?: string }
            LandedPrice?: { Amount?: number; CurrencyCode?: string }
          }
          RegularPrice?: { Amount?: number; CurrencyCode?: string }
        }>
      }
    }

    let payload: PricingItem[] = []
    if (Array.isArray(response)) {
      payload = response as PricingItem[]
    } else if (response && typeof response === 'object') {
      const obj = response as { payload?: PricingItem[] }
      payload = obj.payload ?? []
    }
    for (const item of payload) {
      if (item.status !== 'Success') continue
      const offers = item.Product?.Offers ?? []
      for (const offer of offers) {
        // Try ListingPrice first, then RegularPrice
        const listingPrice = offer.BuyingPrice?.ListingPrice?.Amount ?? offer.RegularPrice?.Amount
        if (typeof listingPrice === 'number' && Number.isFinite(listingPrice) && listingPrice > 0) {
          setCachedPrice(asin, tenantCode, listingPrice)
          return { price: listingPrice, rawResponse: response }
        }
      }
    }

    // Cache null result to avoid repeated API calls for ASINs without pricing
    setCachedPrice(asin, tenantCode, null)
    return { price: null, rawResponse: response }
  } catch (error) {
    // Pricing API may fail for various reasons, return null to use default
    // Don't cache errors - they may be transient
    return { price: null, rawResponse: { error: error instanceof Error ? error.message : 'Unknown error' } }
  }
}

export async function getMonthlyStorageFees(
  startDate?: Date,
  endDate?: Date,
  tenantCode?: TenantCode
) {
  try {
    // This would fetch financial events including storage fees
    const response = await callAmazonApi<AmazonFinancialEventsResponse>(tenantCode, {
      operation: 'listFinancialEvents',
      endpoint: 'finances',
      query: {
        PostedAfter: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default last 30 days
        PostedBefore: endDate || new Date(),
      },
    })

    // Filter for storage fee events
    const storageFees =
      response.FinancialEvents?.ServiceFeeEventList?.filter((fee) =>
        fee.FeeDescription?.toLowerCase().includes('storage')
      ) || []

    return storageFees
  } catch (_error) {
    // console.error('Error fetching storage fees:', _error)
    throw _error
  }
}

export async function getInventoryAgedData(tenantCode?: TenantCode) {
  try {
    const config = getAmazonSpApiConfigFromEnv(tenantCode)
    // Get aged inventory data which includes storage fee preview
    const response = await callAmazonApi<AmazonInventorySummariesResponse>(tenantCode, {
      operation: 'getInventorySummaries',
      endpoint: 'fbaInventory',
      query: {
        marketplaceIds: [config?.marketplaceId ?? process.env.AMAZON_MARKETPLACE_ID],
        granularityType: 'Marketplace',
        granularityId: config?.marketplaceId ?? process.env.AMAZON_MARKETPLACE_ID,
      },
    })
    return response
  } catch (_error) {
    // console.error('Error fetching inventory aged data:', _error)
    throw _error
  }
}

// Test function to compare FBA Inventory API vs Listings API
export async function testCompareApis(tenantCode?: TenantCode) {
  const config = getAmazonSpApiConfigFromEnv(tenantCode)
  const marketplaceId = config?.marketplaceId ?? process.env.AMAZON_MARKETPLACE_ID

  // Get sellerId from config (set via AMAZON_SELLER_ID or AMAZON_SELLER_ID_<tenantCode> env var)
  const sellerId = config?.sellerId ?? null

  // 1. FBA Inventory API (current approach)
  let inventorySkus: Array<{ sellerSku: string; asin: string | null; fnSku: string | null }> = []
  try {
    const inventoryResponse = await callAmazonApi<AmazonInventorySummariesResponse>(tenantCode, {
      operation: 'getInventorySummaries',
      endpoint: 'fbaInventory',
      query: {
        marketplaceIds: [marketplaceId],
        granularityType: 'Marketplace',
        granularityId: marketplaceId,
      },
    })
    inventorySkus = (inventoryResponse.inventorySummaries ?? []).map(item => ({
      sellerSku: item.sellerSku ?? '',
      asin: item.asin ?? null,
      fnSku: item.fnSku ?? null,
    }))
  } catch (error) {
    console.error('FBA Inventory API error:', error)
  }

  // 2. Listings Items API (GET /listings/2021-08-01/items/{sellerId})
  let listingsSkus: Array<{ sku: string; asin: string | null; productType: string | null }> = []
  let listingsError: string | null = null

  if (!sellerId) {
    listingsError = 'Missing AMAZON_SELLER_ID environment variable'
  } else {
    try {
      const listingsResponse = await callAmazonApi<{
        numberOfResults?: number
        items?: Array<{
          sku?: string
          summaries?: Array<{
            asin?: string
            productType?: string
            status?: string[]
          }>
        }>
      }>(tenantCode, {
        api_path: `/listings/2021-08-01/items/${sellerId}`,
        method: 'GET',
        query: {
          marketplaceIds: marketplaceId,
        },
      })
      listingsSkus = (listingsResponse.items ?? []).map(item => ({
        sku: item.sku ?? '',
        asin: item.summaries?.[0]?.asin ?? null,
        productType: item.summaries?.[0]?.productType ?? null,
      }))
    } catch (error) {
      listingsError = error instanceof Error ? error.message : 'Unknown error'
    }
  }

  return {
    sellerId,
    fbaInventoryApi: {
      count: inventorySkus.length,
      skus: inventorySkus,
    },
    listingsApi: {
      count: listingsSkus.length,
      skus: listingsSkus,
      error: listingsError,
    },
  }
}
