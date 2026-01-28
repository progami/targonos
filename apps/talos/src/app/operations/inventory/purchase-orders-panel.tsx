'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import {
  PO_TYPE_BADGE_CLASSES,
  type POType,
} from '@/lib/constants/status-mappings'

export type PurchaseOrderTypeOption = 'PURCHASE' | 'ADJUSTMENT' | 'FULFILLMENT'
export type PurchaseOrderStatusOption =
  | 'DRAFT'
  | 'ISSUED'
  | 'MANUFACTURING'
  | 'OCEAN'
  | 'WAREHOUSE'
  | 'REJECTED'
  | 'CANCELLED'
export type PurchaseOrderLineStatusOption = 'PENDING' | 'POSTED' | 'CANCELLED'

export interface PurchaseOrderLineSummary {
  id: string
  skuCode: string
  skuDescription: string | null
  batchLot: string | null
  unitsOrdered: number
  unitsPerCarton: number
  quantity: number
  unitCost: number | null
  status: PurchaseOrderLineStatusOption
  postedQuantity: number
  quantityReceived?: number | null
  createdAt: string
  updatedAt: string
}

export interface PurchaseOrderSummary {
  id: string
  orderNumber: string
  poNumber?: string | null
  type: PurchaseOrderTypeOption
  status: PurchaseOrderStatusOption
  warehouseCode: string | null
  warehouseName: string | null
  counterpartyName: string | null
  incoterms?: string | null
  paymentTerms?: string | null
  notes?: string | null
  expectedDate: string | null
  proformaInvoiceNumber?: string | null
  factoryName?: string | null
  expectedCompletionDate?: string | null
  vesselName?: string | null
  voyageNumber?: string | null
  portOfLoading?: string | null
  portOfDischarge?: string | null
  estimatedArrival?: string | null
  customsClearedDate?: string | null
  receivedDate?: string | null
  postedAt: string | null
  createdAt: string
  updatedAt: string
  createdByName?: string | null
  lines: PurchaseOrderLineSummary[]
}

export type PurchaseOrderFilter = PurchaseOrderStatusOption

interface PurchaseOrdersPanelProps {
  onPosted: () => void
  statusFilter?: PurchaseOrderFilter
  typeFilter?: PurchaseOrderTypeOption
}

const DEFAULT_BADGE_CLASS = 'bg-muted text-muted-foreground border border-muted'

function typeBadgeClasses(type: PurchaseOrderTypeOption) {
  return PO_TYPE_BADGE_CLASSES[type as POType] ?? DEFAULT_BADGE_CLASS
}

function formatDateDisplay(value: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '—'
  }
  return format(parsed, 'PP')
}

function sumLineUnits(lines: PurchaseOrderLineSummary[]) {
  return lines.reduce((sum, line) => sum + (line.unitsOrdered ?? 0), 0)
}

function sumLineCartons(lines: PurchaseOrderLineSummary[]) {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}

function sumReceivedQuantities(lines: PurchaseOrderLineSummary[]) {
  return lines.reduce((sum, line) => sum + (line.quantityReceived ?? line.postedQuantity ?? 0), 0)
}

function getDraftMissingFields(order: PurchaseOrderSummary) {
  const missing: string[] = []
  if (!order.counterpartyName?.trim()) missing.push('Supplier')
  if (!order.expectedDate) missing.push('Cargo ready date')
  if (!order.incoterms?.trim()) missing.push('Incoterms')
  if (!order.paymentTerms?.trim()) missing.push('Payment terms')
  if (order.lines.length === 0) missing.push('Line items')
  return missing
}

type TableColumn = {
  key: string
  header: string
  thClassName?: string
  tdClassName?: string
  render: (order: PurchaseOrderSummary) => ReactNode
}

export function PurchaseOrdersPanel({
  onPosted: _onPosted,
  statusFilter = 'DRAFT',
  typeFilter,
}: PurchaseOrdersPanelProps) {
  const [orders, setOrders] = useState<PurchaseOrderSummary[]>([])
  const [loading, setLoading] = useState(true)

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/purchase-orders')
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        toast.error(payload?.error ?? 'Failed to load purchase orders')
        return
      }

      const payload = await response.json().catch(() => null)
      const data = Array.isArray(payload?.data) ? (payload.data as PurchaseOrderSummary[]) : []
      setOrders(data)
    } catch (_error) {
      toast.error('Failed to load purchase orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Count orders by new 5-stage statuses
  const statusCounts = useMemo(() => {
    return orders.reduce(
      (acc, order) => {
        if (order.status === 'DRAFT') acc.draftCount += 1
        if (order.status === 'ISSUED') acc.issuedCount += 1
        if (order.status === 'MANUFACTURING') acc.manufacturingCount += 1
        if (order.status === 'OCEAN') acc.oceanCount += 1
        if (order.status === 'WAREHOUSE') acc.warehouseCount += 1
        if (order.status === 'REJECTED') acc.rejectedCount += 1
        if (order.status === 'CANCELLED') acc.cancelledCount += 1
        return acc
      },
      {
        draftCount: 0,
        issuedCount: 0,
        manufacturingCount: 0,
        oceanCount: 0,
        warehouseCount: 0,
        rejectedCount: 0,
        cancelledCount: 0,
      }
    )
  }, [orders])

  const visibleOrders = useMemo(
    () =>
      orders.filter(order => {
        const matchesStatus = order.status === statusFilter
        const matchesType = !typeFilter || order.type === typeFilter
        return matchesStatus && matchesType
      }),
    [orders, statusFilter, typeFilter]
  )

  const columns = useMemo<TableColumn[]>(() => {
    const cols: TableColumn[] = [
      {
        key: 'po-number',
        header: statusFilter === 'DRAFT' ? 'RFQ #' : 'PO #',
        tdClassName: 'px-3 py-2 font-medium text-foreground whitespace-nowrap',
        render: order => (
          <Link
            href={`/operations/purchase-orders/${order.id}`}
            className="text-primary hover:underline"
            prefetch={false}
          >
            {order.status === 'DRAFT' ? order.orderNumber : order.poNumber ?? order.orderNumber}
          </Link>
        ),
      },
    ]

    if (!typeFilter) {
      cols.push({
        key: 'type',
        header: 'Type',
        tdClassName: 'px-3 py-2 whitespace-nowrap',
        render: order => (
          <Badge className={typeBadgeClasses(order.type)}>
            {order.type === 'FULFILLMENT'
              ? 'Fulfillment'
              : order.type === 'PURCHASE'
                ? 'Purchase'
                : 'Adjustment'}
          </Badge>
        ),
      })
    }

    cols.push(
      {
        key: 'supplier',
        header: 'Supplier',
        tdClassName: 'px-3 py-2 text-muted-foreground',
        render: order => (
          <span className="block max-w-[200px] truncate" title={order.counterpartyName || undefined}>
            {order.counterpartyName || '—'}
          </span>
        ),
      },
      {
        key: 'created-by',
        header: 'Created by',
        thClassName: 'w-[clamp(6rem,10vw,9rem)]',
        tdClassName: 'px-3 py-2 text-muted-foreground',
        render: order => (
          <span className="block truncate" title={order.createdByName || undefined}>
            {order.createdByName || '—'}
          </span>
        ),
      },
      {
        key: 'lines',
        header: 'Lines',
        thClassName: 'text-right',
        tdClassName: 'px-3 py-2 text-right whitespace-nowrap',
        render: order => order.lines.length,
      }
    )

    if (statusFilter === 'WAREHOUSE') {
      cols.push(
        {
          key: 'ordered',
          header: 'Cartons Ordered',
          thClassName: 'text-right',
          tdClassName: 'px-3 py-2 text-right font-semibold whitespace-nowrap',
          render: order => sumLineCartons(order.lines).toLocaleString(),
        },
        {
          key: 'received',
          header: 'Cartons Received',
          thClassName: 'text-right',
          tdClassName: 'px-3 py-2 text-right font-semibold whitespace-nowrap',
          render: order => sumReceivedQuantities(order.lines).toLocaleString(),
        },
        {
          key: 'warehouse',
          header: 'Warehouse',
          tdClassName: 'px-3 py-2 whitespace-nowrap',
          render: order => (
            <div className="min-w-[140px]">
              <div className="text-sm font-medium text-foreground">{order.warehouseCode || '—'}</div>
              {order.warehouseName && (
                <div className="text-xs text-muted-foreground truncate">{order.warehouseName}</div>
              )}
            </div>
          ),
        },
        {
          key: 'received-date',
          header: 'Received Date',
          tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
          render: order => (
            <div className="min-w-[140px]">
              <div className="text-sm text-foreground">
                {formatDateDisplay(order.receivedDate ?? null)}
              </div>
              <div className="text-xs text-muted-foreground">
                Customs: {formatDateDisplay(order.customsClearedDate ?? null)}
              </div>
            </div>
          ),
        }
      )
    } else {
      cols.push({
        key: 'quantity',
        header: 'Units',
        thClassName: 'text-right',
        tdClassName: 'px-3 py-2 text-right font-semibold whitespace-nowrap',
        render: order => sumLineUnits(order.lines).toLocaleString(),
      })
    }

    switch (statusFilter) {
      case 'DRAFT': {
        cols.push(
          {
            key: 'cargo-ready',
            header: 'Cargo Ready',
            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
            render: order => formatDateDisplay(order.expectedDate),
          },
          {
            key: 'ready',
            header: 'Ready?',
            tdClassName: 'px-3 py-2 whitespace-nowrap',
            render: order => {
              const missing = getDraftMissingFields(order)
              if (missing.length === 0) {
                return (
                  <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Ready
                  </Badge>
                )
              }

              return (
                <Badge
                  variant="outline"
                  title={`Missing: ${missing.join(', ')}`}
                  className="text-muted-foreground"
                >
                  Missing {missing.length}
                </Badge>
              )
            },
          }
        )
        break
      }
      case 'ISSUED': {
        cols.push(
          {
            key: 'cargo-ready',
            header: 'Cargo Ready',
            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
            render: order => formatDateDisplay(order.expectedDate),
          },
          {
            key: 'incoterms',
            header: 'Incoterms',
            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
            render: order => order.incoterms || '—',
          },
          {
            key: 'payment-terms',
            header: 'Payment Terms',
            tdClassName: 'px-3 py-2 text-muted-foreground',
            render: order => (
              <span className="block max-w-[160px] truncate" title={order.paymentTerms || undefined}>
                {order.paymentTerms || '—'}
              </span>
            ),
          }
        )
        break
      }
      case 'MANUFACTURING': {
        cols.push(
          {
            key: 'supplier-ref',
            header: 'PI #',
            tdClassName: 'px-3 py-2',
            render: order => (
              <span className="block min-w-[180px] text-sm font-medium text-foreground">
                {order.proformaInvoiceNumber || '—'}
              </span>
            ),
          },
          {
            key: 'expected-completion',
            header: 'Exp. Complete',
            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
            render: order => formatDateDisplay(order.expectedCompletionDate ?? null),
          }
        )
        break
      }
      case 'OCEAN': {
        cols.push(
          {
            key: 'shipment',
            header: 'Shipment',
            tdClassName: 'px-3 py-2',
            render: order => {
              const vessel = order.vesselName || '—'
              const voyage = order.voyageNumber ? ` • ${order.voyageNumber}` : ''
              const route =
                order.portOfLoading || order.portOfDischarge
                  ? `${order.portOfLoading || '—'} → ${order.portOfDischarge || '—'}`
                  : '—'

              return (
                <div className="min-w-[220px]">
                  <div className="text-sm font-medium text-foreground">
                    {vessel}
                    {voyage}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{route}</div>
                </div>
              )
            },
          },
          {
            key: 'eta',
            header: 'ETA',
            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
            render: order => formatDateDisplay(order.estimatedArrival ?? null),
          }
        )
        break
      }
      case 'REJECTED':
      case 'CANCELLED': {
        cols.push({
          key: 'notes',
          header: 'Notes',
          tdClassName: 'px-3 py-2 text-muted-foreground',
          render: order => (
            <span className="block max-w-[320px] truncate">{order.notes || '—'}</span>
          ),
        })
        break
      }
    }

    cols.push({
      key: 'updated',
      header: 'Updated',
      tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
      render: order => formatDateDisplay(order.updatedAt),
    })

    return cols
  }, [statusFilter, typeFilter])

	  return (
	    <div className="flex min-h-0 flex-col gap-4">
	      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
	          <div>
	            <h2 className="text-lg font-semibold text-foreground">Purchase Orders</h2>
	          </div>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{statusCounts.draftCount}</span> draft
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.issuedCount}</span>{' '}
              issued
            </span>
            <span>
              <span className="font-semibold text-foreground">
                {statusCounts.manufacturingCount}
              </span>{' '}
              manufacturing
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.oceanCount}</span> in
              transit
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.warehouseCount}</span>{' '}
              at warehouse
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.rejectedCount}</span>{' '}
              rejected
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.cancelledCount}</span>{' '}
              cancelled
            </span>
          </div>
        </div>
      </div>

	      <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card shadow-soft">
	        <div className="overflow-hidden">
	          <table className="w-full table-fixed text-sm">
	            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
	              <tr>
	                {columns.map(column => (
	                  <th
	                    key={column.key}
	                    className={`px-3 py-2 text-left font-semibold ${column.thClassName ?? ''}`}
	                  >
	                    {column.header}
	                  </th>
	                ))}
	              </tr>
	            </thead>
	            <tbody>
	              {loading ? (
	                <tr>
	                  <td colSpan={columns.length} className="px-4 py-6 text-center text-muted-foreground">
	                    Loading purchase orders…
	                  </td>
	                </tr>
	              ) : visibleOrders.length === 0 ? (
	                <tr>
	                  <td colSpan={columns.length} className="px-4 py-6 text-center text-muted-foreground">
	                    No purchase orders found for this stage.
	                  </td>
	                </tr>
	              ) : (
	                visibleOrders.map(order => {
	                  return (
	                    <tr key={order.id} className="odd:bg-muted/20">
	                      {columns.map(column => (
	                        <td
	                          key={`${order.id}-${column.key}`}
	                          className={column.tdClassName ?? 'px-3 py-2 whitespace-nowrap'}
	                        >
	                          {column.render(order)}
	                        </td>
	                      ))}
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
