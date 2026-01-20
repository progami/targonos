import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth-wrapper'
import { getOrders } from '@/lib/amazon/client'

export const dynamic = 'force-dynamic'

type AmazonOrder = {
  AmazonOrderId?: string
  PurchaseDate?: string
  OrderStatus?: string
  NumberOfItemsShipped?: number
  NumberOfItemsUnshipped?: number
}

type OrdersPayload = {
  Orders?: AmazonOrder[]
  payload?: {
    Orders?: AmazonOrder[]
  }
}

export const GET = withAuth(async (request, session) => {
  const { searchParams } = new URL(request.url)
  const createdAfterParam = searchParams.get('createdAfter')
  const createdBeforeParam = searchParams.get('createdBefore')

  const createdAfter = createdAfterParam
    ? new Date(createdAfterParam)
    : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

  const createdBefore = createdBeforeParam
    ? new Date(createdBeforeParam + 'T23:59:59.999Z')
    : undefined

  try {
    const response = await getOrders(createdAfter, session.user.region) as OrdersPayload

    // Handle both direct and payload-wrapped responses
    const orders = response?.Orders ?? response?.payload?.Orders ?? []

    // Filter by createdBefore if provided
    const filteredOrders = createdBefore
      ? orders.filter((order: AmazonOrder) => {
          if (!order.PurchaseDate) return false
          return new Date(order.PurchaseDate) <= createdBefore
        })
      : orders

    // Count units by summing shipped + unshipped items
    let totalUnits = 0
    const byStatus: Record<string, number> = {}

    for (const order of filteredOrders) {
      const status = order.OrderStatus ?? 'Unknown'
      byStatus[status] = (byStatus[status] ?? 0) + 1

      if (status !== 'Canceled' && status !== 'Cancelled') {
        totalUnits += (order.NumberOfItemsShipped ?? 0) + (order.NumberOfItemsUnshipped ?? 0)
      }
    }

    return NextResponse.json({
      source: 'Amazon SP API',
      dateRange: {
        start: createdAfter.toISOString().split('T')[0],
        end: createdBefore?.toISOString().split('T')[0] ?? 'now',
      },
      stats: {
        totalOrders: filteredOrders.length,
        totalUnits,
        byStatus,
      },
      orders: filteredOrders,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 502 })
  }
})
