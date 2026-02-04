'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DataTableContainer,
  DataTableEmpty,
  DataTableHead,
  DataTableHeaderCell,
} from '@/components/ui/data-table-container'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  PO_TYPE_BADGE_CLASSES,
  type POType,
} from '@/lib/constants/status-mappings'

export type PurchaseOrderTypeOption = 'PURCHASE' | 'ADJUSTMENT' | 'FULFILLMENT'
export type PurchaseOrderStatusOption =
  | 'RFQ'
  | 'ISSUED'
  | 'MANUFACTURING'
  | 'OCEAN'
  | 'WAREHOUSE'
  | 'SHIPPED'
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

type PurchaseOrderStageData = {
  manufacturing: {
    proformaInvoiceNumber: string | null
    factoryName: string | null
    manufacturingStartDate: string | null
    expectedCompletionDate: string | null
    totalCartons: number | null
    totalPallets: number | null
    totalWeightKg: number | null
    totalVolumeCbm: number | null
  }
  ocean: {
    houseBillOfLading: string | null
    masterBillOfLading: string | null
    commercialInvoiceNumber: string | null
    packingListRef: string | null
    vesselName: string | null
    voyageNumber: string | null
    portOfLoading: string | null
    portOfDischarge: string | null
    estimatedDeparture: string | null
    estimatedArrival: string | null
  }
  warehouse: {
    warehouseCode: string | null
    warehouseName: string | null
    customsEntryNumber: string | null
    customsClearedDate: string | null
    receivedDate: string | null
    dutyAmount: number | null
    dutyCurrency: string | null
  }
  shipped: {
    shipToName: string | null
    shippingCarrier: string | null
    trackingNumber: string | null
    shippedDate: string | null
    deliveredDate: string | null
  }
}

export interface PurchaseOrderSummary {
  id: string
  orderNumber: string
  poNumber: string | null
  type: PurchaseOrderTypeOption
  status: PurchaseOrderStatusOption
  counterpartyName: string | null
  incoterms: string | null
  paymentTerms: string | null
  notes: string | null
  expectedDate: string | null
  receiveType: string | null
  stageData: PurchaseOrderStageData
  createdAt: string
  createdByName: string | null
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

function formatTextOrDash(value: string | null | undefined) {
  if (typeof value !== 'string') return '—'
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : '—'
}

function formatNumberDisplay(value: number | null | undefined, options?: { maximumFractionDigits?: number }) {
  if (value === null || value === undefined) return '—'
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, { maximumFractionDigits: options?.maximumFractionDigits })
}

type TableColumn = {
  key: string
  header: string
  align?: 'left' | 'center' | 'right'
  thClassName?: string
  tdClassName?: string
  render: (order: PurchaseOrderSummary) => ReactNode
}

const FILTER_ALL = '__all__'

function normalizeForMatch(value: string | null | undefined) {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

function orderMatchesSearch(order: PurchaseOrderSummary, term: string) {
  const needle = term.trim().toLowerCase()
  if (needle.length === 0) return true

  const matches = (value: string | null | undefined) => {
    if (typeof value !== 'string') return false
    return value.toLowerCase().includes(needle)
  }

  return (
    matches(order.orderNumber) ||
    matches(order.poNumber) ||
    matches(order.counterpartyName) ||
    matches(order.incoterms) ||
    matches(order.paymentTerms) ||
    matches(order.notes) ||
    matches(order.receiveType) ||
    matches(order.createdByName) ||
    matches(order.stageData.manufacturing.proformaInvoiceNumber) ||
    matches(order.stageData.manufacturing.factoryName) ||
    matches(order.stageData.ocean.houseBillOfLading) ||
    matches(order.stageData.ocean.masterBillOfLading) ||
    matches(order.stageData.ocean.commercialInvoiceNumber) ||
    matches(order.stageData.ocean.packingListRef) ||
    matches(order.stageData.ocean.vesselName) ||
    matches(order.stageData.ocean.voyageNumber) ||
    matches(order.stageData.ocean.portOfLoading) ||
    matches(order.stageData.ocean.portOfDischarge) ||
    matches(order.stageData.warehouse.warehouseCode) ||
    matches(order.stageData.warehouse.warehouseName) ||
    matches(order.stageData.warehouse.customsEntryNumber)
  )
}

export function PurchaseOrdersPanel({
  onPosted: _onPosted,
  statusFilter = 'RFQ',
  typeFilter,
}: PurchaseOrdersPanelProps) {
  const [orders, setOrders] = useState<PurchaseOrderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [searchFilter, setSearchFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState(FILTER_ALL)
  const [receiveTypeFilter, setReceiveTypeFilter] = useState(FILTER_ALL)

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
        if (order.status === 'RFQ') acc.rfqCount += 1
        if (order.status === 'ISSUED') acc.issuedCount += 1
        if (order.status === 'MANUFACTURING') acc.manufacturingCount += 1
        if (order.status === 'OCEAN') acc.oceanCount += 1
        if (order.status === 'WAREHOUSE') acc.warehouseCount += 1
        if (order.status === 'REJECTED') acc.rejectedCount += 1
        if (order.status === 'CANCELLED') acc.cancelledCount += 1
        return acc
      },
      {
        rfqCount: 0,
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
        const matchesType = typeFilter ? order.type === typeFilter : true
        return matchesStatus && matchesType
      }),
    [orders, statusFilter, typeFilter]
  )

  const supplierOptions = useMemo(() => {
    const values = visibleOrders
      .map(order => (typeof order.counterpartyName === 'string' ? order.counterpartyName.trim() : ''))
      .filter(name => name.length > 0)

    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
  }, [visibleOrders])

  const receiveTypeOptions = useMemo(() => {
    const values = visibleOrders
      .map(order => (typeof order.receiveType === 'string' ? order.receiveType.trim() : ''))
      .filter(name => name.length > 0)

    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
  }, [visibleOrders])

  const filteredOrders = useMemo(() => {
    const supplierNeedle = supplierFilter === FILTER_ALL ? '' : normalizeForMatch(supplierFilter)
    const receiveTypeNeedle = receiveTypeFilter === FILTER_ALL ? '' : normalizeForMatch(receiveTypeFilter)
    const isWarehouseStage = statusFilter === 'WAREHOUSE'

    return visibleOrders.filter(order => {
      if (supplierNeedle.length > 0) {
        const supplier = normalizeForMatch(order.counterpartyName)
        if (supplier !== supplierNeedle) return false
      }

      if (isWarehouseStage && receiveTypeNeedle.length > 0) {
        const receiveType = normalizeForMatch(order.receiveType)
        if (receiveType !== receiveTypeNeedle) return false
      }

      return orderMatchesSearch(order, searchFilter)
    })
  }, [receiveTypeFilter, searchFilter, statusFilter, supplierFilter, visibleOrders])

  const clearFilters = useCallback(() => {
    setSearchFilter('')
    setSupplierFilter(FILTER_ALL)
    setReceiveTypeFilter(FILTER_ALL)
  }, [])

  const columns = useMemo<TableColumn[]>(() => {
    const cols: TableColumn[] = []

    cols.push({
      key: 'po-number',
      header: statusFilter === 'RFQ' ? 'RFQ #' : 'PO #',
      tdClassName: 'px-3 py-2 font-medium text-foreground whitespace-nowrap',
      render: order => (
        <Link
          href={`/operations/purchase-orders/${order.id}`}
          className="text-primary hover:underline"
          prefetch={false}
        >
          {order.status === 'RFQ' ? order.orderNumber : (order.poNumber ?? order.orderNumber)}
        </Link>
      ),
    })

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

    cols.push({
      key: 'supplier',
      header: 'Supplier',
      tdClassName: 'px-3 py-2 text-muted-foreground',
      render: order => (
        <span className="block max-w-[220px] truncate" title={order.counterpartyName ?? undefined}>
          {formatTextOrDash(order.counterpartyName)}
        </span>
      ),
    })

    const createdColumn: TableColumn = {
      key: 'created',
      header: 'Created',
      tdClassName: 'px-3 py-2 whitespace-nowrap',
      render: order => (
        <div className="min-w-[140px]">
          <div className="text-sm text-foreground">{formatDateDisplay(order.createdAt)}</div>
          <div className="text-xs text-muted-foreground">
            {order.createdByName ? `by ${order.createdByName}` : '—'}
          </div>
        </div>
      ),
    }

    switch (statusFilter) {
      case 'RFQ': {
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
            render: order => formatTextOrDash(order.incoterms),
          },
          {
            key: 'payment-terms',
            header: 'Payment Terms',
            tdClassName: 'px-3 py-2 text-muted-foreground',
            render: order => (
              <span className="block max-w-[180px] truncate" title={order.paymentTerms ?? undefined}>
                {formatTextOrDash(order.paymentTerms)}
              </span>
            ),
          },
          {
            key: 'lines',
            header: 'Lines',
            align: 'right',
            tdClassName: 'px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
            render: order => order.lines.length,
          },
          {
            key: 'units',
            header: 'Units',
            align: 'right',
            tdClassName: 'px-3 py-2 text-right font-semibold whitespace-nowrap tabular-nums',
            render: order => sumLineUnits(order.lines).toLocaleString(),
          },
          createdColumn
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
            render: order => formatTextOrDash(order.incoterms),
          },
          {
            key: 'payment-terms',
            header: 'Payment Terms',
            tdClassName: 'px-3 py-2 text-muted-foreground',
            render: order => (
              <span className="block max-w-[180px] truncate" title={order.paymentTerms ?? undefined}>
                {formatTextOrDash(order.paymentTerms)}
              </span>
            ),
          },
          {
            key: 'pi-number',
            header: 'PI #',
            tdClassName: 'px-3 py-2',
            render: order => (
              <div className="min-w-[180px]">
                <div className="text-sm font-medium text-foreground">
                  {formatTextOrDash(order.stageData.manufacturing.proformaInvoiceNumber)}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {formatTextOrDash(order.stageData.manufacturing.factoryName)}
                </div>
              </div>
            ),
          },
          {
            key: 'lines',
            header: 'Lines',
            align: 'right',
            tdClassName: 'px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
            render: order => order.lines.length,
          },
          {
            key: 'units',
            header: 'Units',
            align: 'right',
            tdClassName: 'px-3 py-2 text-right font-semibold whitespace-nowrap tabular-nums',
            render: order => sumLineUnits(order.lines).toLocaleString(),
          },
          createdColumn
        )
        break
      }
      case 'MANUFACTURING': {
        cols.push(
          {
            key: 'pi-number',
            header: 'PI #',
            tdClassName: 'px-3 py-2',
            render: order => (
              <div className="min-w-[200px]">
                <div className="text-sm font-medium text-foreground">
                  {formatTextOrDash(order.stageData.manufacturing.proformaInvoiceNumber)}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {formatTextOrDash(order.stageData.manufacturing.factoryName)}
                </div>
              </div>
            ),
          },
          {
            key: 'mfg-start',
            header: 'Mfg Start',
            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
            render: order => formatDateDisplay(order.stageData.manufacturing.manufacturingStartDate),
          },
          {
            key: 'expected-completion',
            header: 'Exp. Complete',
            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
            render: order => formatDateDisplay(order.stageData.manufacturing.expectedCompletionDate),
          },
          {
            key: 'cartons',
            header: 'Cartons',
            align: 'right',
            tdClassName: 'px-3 py-2 text-right whitespace-nowrap',
            render: order => {
              const ordered = sumLineCartons(order.lines)
              return (
                <div className="min-w-[140px] text-right">
                  <div className="text-sm font-semibold text-foreground tabular-nums">
                    {formatNumberDisplay(order.stageData.manufacturing.totalCartons)}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    Ordered: {ordered.toLocaleString()}
                  </div>
                </div>
              )
            },
          },
          {
            key: 'pallets',
            header: 'Pallets',
            align: 'right',
            tdClassName: 'px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
            render: order => formatNumberDisplay(order.stageData.manufacturing.totalPallets),
          },
          {
            key: 'weight',
            header: 'KG',
            align: 'right',
            tdClassName: 'px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
            render: order =>
              formatNumberDisplay(order.stageData.manufacturing.totalWeightKg, {
                maximumFractionDigits: 2,
              }),
          },
          {
            key: 'volume',
            header: 'CBM',
            align: 'right',
            tdClassName: 'px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
            render: order =>
              formatNumberDisplay(order.stageData.manufacturing.totalVolumeCbm, {
                maximumFractionDigits: 3,
              }),
          },
          createdColumn
        )
        break
      }
      case 'OCEAN': {
        cols.push(
          {
            key: 'bill-of-lading',
            header: 'B/L',
            tdClassName: 'px-3 py-2',
            render: order => (
              <div className="min-w-[200px]">
                <div className="text-sm font-medium text-foreground">
                  {formatTextOrDash(order.stageData.ocean.houseBillOfLading)}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {formatTextOrDash(order.stageData.ocean.masterBillOfLading)}
                </div>
              </div>
            ),
          },
          {
            key: 'docs',
            header: 'Docs',
            tdClassName: 'px-3 py-2',
            render: order => (
              <div className="min-w-[220px]">
                <div className="text-sm font-medium text-foreground">
                  {formatTextOrDash(order.stageData.ocean.commercialInvoiceNumber)}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {formatTextOrDash(order.stageData.ocean.packingListRef)}
                </div>
              </div>
            ),
          },
          {
            key: 'vessel',
            header: 'Vessel',
            tdClassName: 'px-3 py-2 whitespace-nowrap',
            render: order => {
              const vessel = formatTextOrDash(order.stageData.ocean.vesselName)
              const voyage = order.stageData.ocean.voyageNumber
              return (
                <span className="block min-w-[200px] text-sm font-medium text-foreground">
                  {voyage ? `${vessel} • ${voyage}` : vessel}
                </span>
              )
            },
          },
          {
            key: 'route',
            header: 'Route',
            tdClassName: 'px-3 py-2 text-muted-foreground',
            render: order => {
              const pol = formatTextOrDash(order.stageData.ocean.portOfLoading)
              const pod = formatTextOrDash(order.stageData.ocean.portOfDischarge)
              const title = `${pol} → ${pod}`
              return (
                <span className="block min-w-[220px] truncate" title={title}>
                  {title}
                </span>
              )
            },
          },
          {
            key: 'etd',
            header: 'ETD',
            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
            render: order => formatDateDisplay(order.stageData.ocean.estimatedDeparture),
          },
          {
            key: 'eta',
            header: 'ETA',
            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
            render: order => formatDateDisplay(order.stageData.ocean.estimatedArrival),
          },
          createdColumn
        )
        break
      }
      case 'WAREHOUSE': {
        cols.push(
          {
            key: 'warehouse',
            header: 'Warehouse',
            tdClassName: 'px-3 py-2 whitespace-nowrap',
            render: order => (
              <div className="min-w-[160px]">
                <div className="text-sm font-medium text-foreground">
                  {formatTextOrDash(order.stageData.warehouse.warehouseCode)}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {formatTextOrDash(order.stageData.warehouse.warehouseName)}
                </div>
              </div>
            ),
          },
          {
            key: 'receive-type',
            header: 'Receive Type',
            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
            render: order => formatTextOrDash(order.receiveType),
          },
          {
            key: 'customs-entry',
            header: 'Import Entry #',
            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
            render: order => formatTextOrDash(order.stageData.warehouse.customsEntryNumber),
          },
          {
            key: 'customs-cleared',
            header: 'Customs Cleared',
            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
            render: order => formatDateDisplay(order.stageData.warehouse.customsClearedDate),
          },
          {
            key: 'received',
            header: 'Received',
            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
            render: order => formatDateDisplay(order.stageData.warehouse.receivedDate),
          },
          {
            key: 'duty',
            header: 'Duty',
            align: 'right',
            tdClassName: 'px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
            render: order => {
              const amount = order.stageData.warehouse.dutyAmount
              if (amount === null || amount === undefined) return '—'
              const currency = order.stageData.warehouse.dutyCurrency
              const suffix = currency && currency.trim().length > 0 ? ` ${currency.trim()}` : ''
              return `${amount.toLocaleString()}${suffix}`
            },
          },
          {
            key: 'cartons',
            header: 'Cartons',
            align: 'right',
            tdClassName: 'px-3 py-2 text-right whitespace-nowrap',
            render: order => (
              <div className="min-w-[140px] text-right">
                <div className="text-sm font-semibold text-foreground tabular-nums">
                  {sumReceivedQuantities(order.lines).toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  / {sumLineCartons(order.lines).toLocaleString()}
                </div>
              </div>
            ),
          },
          createdColumn
        )
        break
      }
      case 'REJECTED':
      case 'CANCELLED': {
        cols.push(
          {
            key: 'notes',
            header: 'Notes',
            tdClassName: 'px-3 py-2 text-muted-foreground',
            render: order => (
              <span className="block max-w-[360px] truncate">{formatTextOrDash(order.notes)}</span>
            ),
          },
          {
            key: 'lines',
            header: 'Lines',
            align: 'right',
            tdClassName: 'px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
            render: order => order.lines.length,
          },
          {
            key: 'units',
            header: 'Units',
            align: 'right',
            tdClassName: 'px-3 py-2 text-right font-semibold whitespace-nowrap tabular-nums',
            render: order => sumLineUnits(order.lines).toLocaleString(),
          },
          createdColumn
        )
        break
      }
      default: {
        cols.push(createdColumn)
      }
    }

    return cols
  }, [statusFilter, typeFilter])

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <DataTableContainer
        title="Purchase Orders"
        headerContent={
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{statusCounts.rfqCount}</span> RFQ
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.issuedCount}</span> Issued
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.manufacturingCount}</span>{' '}
              Manufacturing
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.oceanCount}</span> In Transit
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.warehouseCount}</span> At Warehouse
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.rejectedCount}</span> Rejected
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.cancelledCount}</span> Cancelled
            </span>
          </div>
        }
      >
        <div className="flex flex-wrap items-end gap-3 border-b border-border bg-background px-4 py-3">
          <div className="flex flex-1 flex-wrap items-end gap-3">
            <div className="min-w-[220px] max-w-[360px] flex-1">
              <Input
                value={searchFilter}
                onChange={event => setSearchFilter(event.target.value)}
                placeholder="Search PO / RFQ #, supplier, docs…"
              />
            </div>
            <div className="min-w-[220px]">
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>All suppliers</SelectItem>
                  {supplierOptions.map(option => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {statusFilter === 'WAREHOUSE' && (
              <div className="min-w-[220px]">
                <Select value={receiveTypeFilter} onValueChange={setReceiveTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Receive Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FILTER_ALL}>All receive types</SelectItem>
                    {receiveTypeOptions.map(option => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden text-sm text-muted-foreground sm:block">
              <span className="font-semibold text-foreground">{filteredOrders.length}</span> shown
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearFilters}
              disabled={
                searchFilter.length === 0 &&
                supplierFilter === FILTER_ALL &&
                (statusFilter !== 'WAREHOUSE' || receiveTypeFilter === FILTER_ALL)
              }
            >
              Clear
            </Button>
          </div>
        </div>
        <table className="w-full table-auto text-sm">
          <DataTableHead>
            <tr className="border-b border-border">
              {columns.map(column => (
                <DataTableHeaderCell
                  key={column.key}
                  align={column.align}
                  className={column.thClassName}
                >
                  {column.header}
                </DataTableHeaderCell>
              ))}
            </tr>
          </DataTableHead>
          <tbody>
            {loading ? (
              <DataTableEmpty colSpan={columns.length} message="Loading purchase orders…" />
            ) : filteredOrders.length === 0 ? (
              <DataTableEmpty colSpan={columns.length} message="No purchase orders found for this stage." />
            ) : (
              filteredOrders.map(order => (
                <tr key={order.id} className="border-t border-border hover:bg-muted/30">
                  {columns.map(column => (
                    <td key={`${order.id}-${column.key}`} className={column.tdClassName ?? 'px-3 py-2 whitespace-nowrap'}>
                      {column.render(order)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTableContainer>
    </div>
  )
}
