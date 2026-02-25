import { callAmazonApi, getAmazonSpApiConfig } from './client.js'
import type {
  TenantCode,
  AmazonOrder,
  AmazonOrderItem,
} from './types.js'

export type OrderWithItems = AmazonOrder & {
  items: AmazonOrderItem[]
}

export type OrdersSummary = {
  dateRange: {
    start: string
    end: string
  }
  totalOrders: number
  totalUnits: number
  byStatus: Record<string, number>
  byAsin: Record<string, { units: number; sku: string }>
  orders: OrderWithItems[]
}

const ORDERS_API_V2026_PATH = '/orders/2026-01-01/orders'

type V2026Money = {
  amount?: string
  currencyCode?: string
}

type V2026OrderItem = {
  orderItemId?: string
  quantityOrdered?: number
  product?: {
    asin?: string
    sellerSku?: string
    title?: string
    price?: {
      unitPrice?: V2026Money
    }
  }
  fulfillment?: {
    quantityFulfilled?: number
    quantityUnfulfilled?: number
  }
}

type V2026Order = {
  orderId?: string
  createdTime?: string
  fulfillment?: {
    fulfillmentStatus?: string
    fulfilledBy?: string
    fulfillmentServiceLevel?: string
  }
  proceeds?: {
    grandTotal?: V2026Money
  }
  salesChannel?: {
    marketplaceId?: string
  }
  orderItems?: V2026OrderItem[]
}

type V2026SearchOrdersResponse = {
  orders?: V2026Order[]
  pagination?: {
    nextToken?: string
  }
}

type V2026GetOrderResponse = {
  order?: V2026Order
}

function normalizeStatusForV2026(status: string): string {
  const normalized = status.trim().toUpperCase().replace(/\s+/g, '_')
  if (normalized === 'PARTIALLYSHIPPED') return 'PARTIALLY_SHIPPED'
  if (normalized === 'CANCELED') return 'CANCELLED'
  return normalized
}

function normalizeStatusForLegacy(status: string | undefined): string {
  if (!status) return 'Unknown'
  if (status === 'PENDING_AVAILABILITY') return 'PendingAvailability'
  if (status === 'PENDING') return 'Pending'
  if (status === 'UNSHIPPED') return 'Unshipped'
  if (status === 'PARTIALLY_SHIPPED') return 'PartiallyShipped'
  if (status === 'SHIPPED') return 'Shipped'
  if (status === 'CANCELLED') return 'Canceled'
  if (status === 'UNFULFILLABLE') return 'Unfulfillable'
  return status
}

function normalizeFulfillmentChannelForLegacy(fulfilledBy: string | undefined): string | undefined {
  if (!fulfilledBy) return undefined
  if (fulfilledBy === 'AMAZON') return 'AFN'
  if (fulfilledBy === 'MERCHANT') return 'MFN'
  return fulfilledBy
}

function getSearchOrdersPayload(response: unknown): V2026SearchOrdersResponse {
  if (!response || typeof response !== 'object') return {}
  const record = response as Record<string, unknown>
  const payload = record.payload
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as V2026SearchOrdersResponse
  }
  return record as V2026SearchOrdersResponse
}

function getOrderPayload(response: unknown): V2026GetOrderResponse {
  if (!response || typeof response !== 'object') return {}
  const record = response as Record<string, unknown>
  const payload = record.payload
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as V2026GetOrderResponse
  }
  return record as V2026GetOrderResponse
}

function mapOrderItemsFromV2026(items: V2026OrderItem[] | undefined): AmazonOrderItem[] {
  if (!items?.length) return []
  return items.map(item => {
    const unitPrice = item.product?.price?.unitPrice
    return {
      ASIN: item.product?.asin ?? '',
      SellerSKU: item.product?.sellerSku ?? '',
      OrderItemId: item.orderItemId ?? '',
      Title: item.product?.title ?? '',
      QuantityOrdered: item.quantityOrdered ?? 0,
      QuantityShipped: item.fulfillment?.quantityFulfilled ?? 0,
      ItemPrice:
        unitPrice?.amount && unitPrice.currencyCode
          ? {
              Amount: unitPrice.amount,
              CurrencyCode: unitPrice.currencyCode,
            }
          : undefined,
    }
  })
}

function mapOrderFromV2026(order: V2026Order): AmazonOrder {
  const items = order.orderItems ?? []
  const shipped = items.reduce((total, item) => total + (item.fulfillment?.quantityFulfilled ?? 0), 0)
  const unshipped = items.reduce((total, item) => {
    if (typeof item.fulfillment?.quantityUnfulfilled === 'number') {
      return total + item.fulfillment.quantityUnfulfilled
    }
    const ordered = item.quantityOrdered ?? 0
    const fulfilled = item.fulfillment?.quantityFulfilled ?? 0
    const remaining = ordered - fulfilled
    return total + (remaining > 0 ? remaining : 0)
  }, 0)
  const grandTotal = order.proceeds?.grandTotal

  return {
    AmazonOrderId: order.orderId ?? '',
    PurchaseDate: order.createdTime ?? '',
    OrderStatus: normalizeStatusForLegacy(order.fulfillment?.fulfillmentStatus),
    NumberOfItemsShipped: shipped,
    NumberOfItemsUnshipped: unshipped,
    OrderTotal:
      grandTotal?.amount && grandTotal.currencyCode
        ? {
            Amount: grandTotal.amount,
            CurrencyCode: grandTotal.currencyCode,
          }
        : undefined,
    MarketplaceId: order.salesChannel?.marketplaceId,
    FulfillmentChannel: normalizeFulfillmentChannelForLegacy(order.fulfillment?.fulfilledBy),
    ShipServiceLevel: order.fulfillment?.fulfillmentServiceLevel,
  }
}

function buildSearchOrdersQuery(params: {
  marketplaceId: string
  createdAfter: Date
  createdBefore?: Date
  orderStatuses?: string[]
  paginationToken?: string
  includedData?: string[]
}): Record<string, unknown> {
  const query: Record<string, unknown> = {
    marketplaceIds: [params.marketplaceId],
    createdAfter: params.createdAfter.toISOString(),
    maxResultsPerPage: 100,
  }

  if (params.createdBefore) {
    query.createdBefore = params.createdBefore.toISOString()
  }

  if (params.orderStatuses?.length) {
    query.fulfillmentStatuses = params.orderStatuses.map(normalizeStatusForV2026)
  }

  if (params.paginationToken) {
    query.paginationToken = params.paginationToken
  }

  if (params.includedData?.length) {
    query.includedData = params.includedData
  }

  return query
}

async function searchOrdersMapped(params: {
  tenantCode: TenantCode
  createdAfter: Date
  createdBefore?: Date
  orderStatuses?: string[]
  includedData?: string[]
}): Promise<Array<{ order: AmazonOrder; items: AmazonOrderItem[] }>> {
  const config = getAmazonSpApiConfig(params.tenantCode)
  const rows: Array<{ order: AmazonOrder; items: AmazonOrderItem[] }> = []
  let paginationToken: string | undefined

  do {
    const query = buildSearchOrdersQuery({
      marketplaceId: config.marketplaceId,
      createdAfter: params.createdAfter,
      createdBefore: params.createdBefore,
      orderStatuses: params.orderStatuses,
      paginationToken,
      includedData: params.includedData,
    })

    const response = await callAmazonApi<V2026SearchOrdersResponse | { payload?: V2026SearchOrdersResponse }>(
      params.tenantCode,
      {
        api_path: ORDERS_API_V2026_PATH,
        method: 'GET',
        query,
      }
    )
    const payload = getSearchOrdersPayload(response)
    const orders = payload.orders ?? []

    for (const order of orders) {
      rows.push({
        order: mapOrderFromV2026(order),
        items: mapOrderItemsFromV2026(order.orderItems),
      })
    }

    paginationToken = payload.pagination?.nextToken
  } while (paginationToken)

  return rows
}

/**
 * Fetch orders from Amazon SP API for a given date range.
 */
export async function getOrders(
  tenantCode: TenantCode,
  options: {
    createdAfter: Date
    createdBefore?: Date
    orderStatuses?: string[]
  }
): Promise<AmazonOrder[]> {
  const rows = await searchOrdersMapped({
    tenantCode,
    createdAfter: options.createdAfter,
    createdBefore: options.createdBefore,
    orderStatuses: options.orderStatuses,
    includedData: ['FULFILLMENT'],
  })
  return rows.map(row => row.order)
}

/**
 * Fetch order items for a specific order.
 */
export async function getOrderItems(
  tenantCode: TenantCode,
  orderId: string
): Promise<AmazonOrderItem[]> {
  const response = await callAmazonApi<V2026GetOrderResponse | { payload?: V2026GetOrderResponse }>(tenantCode, {
    api_path: `${ORDERS_API_V2026_PATH}/${encodeURIComponent(orderId)}`,
    method: 'GET',
    query: {
      includedData: ['FULFILLMENT'],
    },
  })
  const payload = getOrderPayload(response)
  return mapOrderItemsFromV2026(payload.order?.orderItems)
}

/**
 * Fetch orders with their items for a given date range.
 * Summarizes units by ASIN.
 */
export async function getOrdersWithItems(
  tenantCode: TenantCode,
  options: {
    createdAfter: Date
    createdBefore?: Date
    orderStatuses?: string[]
  }
): Promise<OrdersSummary> {
  const rows = await searchOrdersMapped({
    tenantCode,
    createdAfter: options.createdAfter,
    createdBefore: options.createdBefore,
    orderStatuses: options.orderStatuses,
    includedData: ['FULFILLMENT'],
  })

  const orders = rows.map(row => row.order)
  const ordersWithItems: OrderWithItems[] = []
  const byStatus: Record<string, number> = {}
  const byAsin: Record<string, { units: number; sku: string }> = {}
  let totalUnits = 0

  for (const row of rows) {
    const order = row.order
    // Count by status
    const status = order.OrderStatus ?? 'Unknown'
    byStatus[status] = (byStatus[status] ?? 0) + 1

    // Skip cancelled orders for unit counts
    if (status === 'Canceled' || status === 'Cancelled') {
      ordersWithItems.push({ ...order, items: [] })
      continue
    }

    const items = row.items

    for (const item of items) {
      const asin = item.ASIN
      const qty = item.QuantityOrdered ?? 0
      totalUnits += qty

      if (!byAsin[asin]) {
        byAsin[asin] = { units: 0, sku: item.SellerSKU ?? '' }
      }
      byAsin[asin].units += qty
    }

    ordersWithItems.push({ ...order, items })
  }

  return {
    dateRange: {
      start: options.createdAfter.toISOString(),
      end: options.createdBefore?.toISOString() ?? new Date().toISOString(),
    },
    totalOrders: orders.length,
    totalUnits,
    byStatus,
    byAsin,
    orders: ordersWithItems,
  }
}

/**
 * Get units sold for a specific ASIN in a date range.
 */
export async function getUnitsForAsin(
  tenantCode: TenantCode,
  asin: string,
  options: {
    createdAfter: Date
    createdBefore?: Date
  }
): Promise<{
  asin: string
  sku: string | null
  units: number
  orders: Array<{
    orderId: string
    purchaseDate: string
    status: string
    quantity: number
  }>
}> {
  const summary = await getOrdersWithItems(tenantCode, {
    ...options,
    orderStatuses: ['Unshipped', 'PartiallyShipped', 'Shipped'],
  })

  const asinData = summary.byAsin[asin]
  const matchingOrders: Array<{
    orderId: string
    purchaseDate: string
    status: string
    quantity: number
  }> = []

  for (const order of summary.orders) {
    for (const item of order.items) {
      if (item.ASIN === asin) {
        matchingOrders.push({
          orderId: order.AmazonOrderId,
          purchaseDate: order.PurchaseDate,
          status: order.OrderStatus,
          quantity: item.QuantityOrdered,
        })
      }
    }
  }

  return {
    asin,
    sku: asinData?.sku ?? null,
    units: asinData?.units ?? 0,
    orders: matchingOrders,
  }
}
