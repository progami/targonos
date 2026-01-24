'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'

export type FulfillmentOrderStatusOption = 'DRAFT' | 'SHIPPED' | 'CANCELLED'

export interface FulfillmentOrderLineSummary {
  id: string
  skuCode: string
  batchLot: string
  quantity: number
}

export interface FulfillmentOrderSummary {
  id: string
  foNumber: string
  status: FulfillmentOrderStatusOption
  warehouseCode: string
  warehouseName: string
  destinationType: string
  destinationName: string | null
  trackingNumber: string | null
  createdAt: string
  shippedDate: string | null
  lines: FulfillmentOrderLineSummary[]
}

interface FulfillmentOrdersPanelProps {
  statusFilter?: FulfillmentOrderStatusOption
}

const STATUS_BADGE_CLASSES: Record<FulfillmentOrderStatusOption, string> = {
  DRAFT: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600',
  SHIPPED: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
  CANCELLED: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800',
}

const STATUS_LABELS: Record<FulfillmentOrderStatusOption, string> = {
  DRAFT: 'Draft',
  SHIPPED: 'Shipped',
  CANCELLED: 'Cancelled',
}

function formatDateDisplay(value: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return format(parsed, 'PP')
}

function sumLineQuantities(lines: FulfillmentOrderLineSummary[]) {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}

export function FulfillmentOrdersPanel({
  statusFilter = 'DRAFT',
}: FulfillmentOrdersPanelProps) {
  const [orders, setOrders] = useState<FulfillmentOrderSummary[]>([])
  const [loading, setLoading] = useState(true)

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/fulfillment-orders')
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        toast.error(payload?.error ?? 'Failed to load fulfillment orders')
        return
      }

      const payload = await response.json().catch(() => null)
      const data = Array.isArray(payload?.data) ? (payload.data as FulfillmentOrderSummary[]) : []
      setOrders(data)
    } catch (_error) {
      toast.error('Failed to load fulfillment orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const statusCounts = useMemo(() => {
    return orders.reduce(
      (acc, order) => {
        if (order.status === 'DRAFT') acc.draftCount += 1
        if (order.status === 'SHIPPED') acc.shippedCount += 1
        if (order.status === 'CANCELLED') acc.cancelledCount += 1
        return acc
      },
      { draftCount: 0, shippedCount: 0, cancelledCount: 0 }
    )
  }, [orders])

  const visibleOrders = useMemo(
    () => orders.filter(order => order.status === statusFilter),
    [orders, statusFilter]
  )

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Fulfillment Orders</h2>
            <p className="text-sm text-muted-foreground">
              Track outbound shipments to customers, Amazon FBA, and warehouse transfers.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{statusCounts.draftCount}</span> draft
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.shippedCount}</span>{' '}
              shipped
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.cancelledCount}</span>{' '}
              cancelled
            </span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-col rounded-xl border bg-white dark:bg-slate-800 shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] table-auto text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">FO #</th>
                <th className="px-3 py-2 text-left font-semibold">Warehouse</th>
                <th className="px-3 py-2 text-left font-semibold">Destination</th>
                <th className="px-3 py-2 text-right font-semibold">Lines</th>
                <th className="px-3 py-2 text-right font-semibold">Quantity</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Created</th>
                <th className="px-3 py-2 text-left font-semibold">Shipped</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                    Loading fulfillment orders…
                  </td>
                </tr>
              ) : visibleOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                    No fulfillment orders in this status yet.
                  </td>
                </tr>
              ) : (
                visibleOrders.map(order => {
                  const totalQuantity = sumLineQuantities(order.lines)
                  const destinationLabel =
                    order.destinationName ||
                    (order.destinationType === 'AMAZON_FBA'
                      ? 'Amazon FBA'
                      : order.destinationType === 'TRANSFER'
                        ? 'Transfer'
                        : 'Customer')

                  return (
                    <tr key={order.id} className="odd:bg-muted/20">
                      <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                        <Link
                          href={`/operations/fulfillment-orders/${order.id}`}
                          className="text-primary hover:underline"
                          prefetch={false}
                        >
                          {order.foNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {order.warehouseCode || '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {destinationLabel}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {order.lines.length}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                        {totalQuantity.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Badge className={STATUS_BADGE_CLASSES[order.status]}>
                          {STATUS_LABELS[order.status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {formatDateDisplay(order.createdAt)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {formatDateDisplay(order.shippedDate)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
