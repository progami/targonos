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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Filter, Search } from '@/lib/lucide-icons'
import {
  PO_TYPE_BADGE_CLASSES,
  type POType,
} from '@/lib/constants/status-mappings'
import { withBasePath } from '@/lib/utils/base-path'

export type PurchaseOrderTypeOption = 'PURCHASE' | 'ADJUSTMENT' | 'FULFILLMENT'
export type PurchaseOrderStatusOption =
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
  lotRef: string | null
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
  tenantCode?: string | null
  matchedSkuCodes?: string[]
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
  return format(parsed, 'P')
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

function formatTextOrEmpty(value: string | null | undefined) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : ''
}

function formatNumberDisplay(value: number | null | undefined, options?: { maximumFractionDigits?: number }) {
  if (value === null || value === undefined) return '—'
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, { maximumFractionDigits: options?.maximumFractionDigits })
}

type TableColumn = {
  key: string
  header: ReactNode
  align?: 'left' | 'center' | 'right'
  fit?: boolean
  thClassName?: string
  tdClassName?: string
  render: (order: PurchaseOrderSummary) => ReactNode
}

const FILTER_ALL = '__all__'
const FIT_CELL_CLASSES = 'w-[1%]'

const RECEIVE_TYPE_LABELS: Record<string, string> = {
  LCL: 'LCL',
  CONTAINER_20: "20'",
  CONTAINER_40: "40'",
  CONTAINER_40_HQ: "40' HQ",
  CONTAINER_45_HQ: "45' HQ",
}

function formatReceiveTypeDisplay(value: string | null | undefined) {
  if (typeof value !== 'string') return '—'
  const trimmed = value.trim()
  if (!trimmed) return '—'
  return RECEIVE_TYPE_LABELS[trimmed] ?? trimmed
}

function buildColumnHeader(label: ReactNode, control?: ReactNode) {
  return (
    <div className="flex h-7 min-w-0 items-center justify-between gap-2">
      <div className="min-w-0 truncate leading-none">{label}</div>
      {control ? <div className="flex shrink-0 items-center">{control}</div> : null}
    </div>
  )
}

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
  statusFilter = 'ISSUED',
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
      const endpoint = withBasePath(
        statusFilter === 'MANUFACTURING'
          ? '/api/purchase-orders/manufacturing'
          : '/api/purchase-orders'
      )
      const response = await fetch(endpoint, { credentials: 'include' })
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
  }, [statusFilter])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    if (statusFilter !== 'WAREHOUSE') {
      setReceiveTypeFilter(FILTER_ALL)
    }
  }, [statusFilter])

  // Count orders by new 5-stage statuses
  const statusCounts = useMemo(() => {
    return orders.reduce(
      (acc, order) => {
        if (order.status === 'ISSUED') acc.issuedCount += 1
        if (order.status === 'MANUFACTURING') acc.manufacturingCount += 1
        if (order.status === 'OCEAN') acc.oceanCount += 1
        if (order.status === 'WAREHOUSE') acc.warehouseCount += 1
        if (order.status === 'REJECTED') acc.rejectedCount += 1
        if (order.status === 'CANCELLED') acc.cancelledCount += 1
        return acc
      },
      {
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

    if (supplierFilter !== FILTER_ALL) {
      const trimmed = supplierFilter.trim()
      if (trimmed.length > 0) {
        values.push(trimmed)
      }
    }

    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
  }, [supplierFilter, visibleOrders])

  const receiveTypeOptions = useMemo(() => {
    const values = visibleOrders
      .map(order => (typeof order.receiveType === 'string' ? order.receiveType.trim() : ''))
      .filter(name => name.length > 0)

    if (receiveTypeFilter !== FILTER_ALL) {
      const trimmed = receiveTypeFilter.trim()
      if (trimmed.length > 0) {
        values.push(trimmed)
      }
    }

    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
  }, [receiveTypeFilter, visibleOrders])

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

  const hasActiveFilters = useMemo(() => {
    return (
      searchFilter.trim().length > 0 ||
      supplierFilter !== FILTER_ALL ||
      (statusFilter === 'WAREHOUSE' && receiveTypeFilter !== FILTER_ALL)
    )
  }, [receiveTypeFilter, searchFilter, statusFilter, supplierFilter])

  const clearFilters = useCallback(() => {
    setSearchFilter('')
    setSupplierFilter(FILTER_ALL)
    setReceiveTypeFilter(FILTER_ALL)
  }, [])

  const columns = useMemo<TableColumn[]>(() => {
    const cols: TableColumn[] = []

    cols.push({
      key: 'po-number',
      header: buildColumnHeader(
        'PO #',
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Search"
            >
              <Search
                className={[
                  'h-4 w-4',
                  searchFilter.trim().length > 0 ? 'text-primary' : 'text-muted-foreground',
                ].join(' ')}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3">
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Search
              </p>
              <Input
                value={searchFilter}
                onChange={event => setSearchFilter(event.target.value)}
                placeholder="Order #, supplier, notes…"
                className="h-9 px-2 text-sm font-normal normal-case tracking-normal"
                autoFocus
              />
            </div>
          </PopoverContent>
        </Popover>
      ),
      fit: true,
      thClassName: 'w-[116px]',
      tdClassName: 'px-3 py-2 font-medium text-foreground min-w-0',
      render: order => (
        <Link
          href={
            order.tenantCode
              ? `/operations/purchase-orders/${order.id}?tenant=${encodeURIComponent(order.tenantCode)}`
              : `/operations/purchase-orders/${order.id}`
          }
          className="block max-w-full truncate text-primary hover:underline"
          prefetch={false}
        >
          {order.poNumber ?? order.orderNumber}
        </Link>
      ),
    })

    if (!typeFilter) {
      cols.push({
        key: 'type',
        header: buildColumnHeader('Type'),
        fit: true,
        thClassName: 'w-[88px]',
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
      header: buildColumnHeader(
        'Supplier',
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Filter suppliers"
            >
              <Filter
                className={[
                  'h-4 w-4',
                  supplierFilter !== FILTER_ALL ? 'text-primary' : 'text-muted-foreground',
                ].join(' ')}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3">
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Supplier
              </p>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="h-9 w-full px-2 text-sm font-normal normal-case tracking-normal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>All</SelectItem>
                  {supplierOptions.map(option => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>
      ),
      thClassName: 'w-[clamp(170px,22vw,240px)]',
      tdClassName: 'px-3 py-2 min-w-0 text-muted-foreground',
      render: order => (
        <span className="block max-w-full truncate" title={order.counterpartyName ?? undefined}>
          {formatTextOrDash(order.counterpartyName)}
        </span>
      ),
    })

    switch (statusFilter) {
      case 'ISSUED': {
        cols.push(
		          {
		            key: 'cargo-ready',
		            header: buildColumnHeader('Cargo Ready'),
	            fit: true,
	            thClassName: 'w-[112px]',
	            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums',
	            render: order => formatDateDisplay(order.expectedDate),
	          },
	          {
	            key: 'incoterms',
	            header: buildColumnHeader('Incoterms'),
	            fit: true,
	            thClassName: 'w-[96px]',
	            tdClassName: 'px-3 py-2 whitespace-nowrap font-medium text-foreground',
	            render: order => formatTextOrDash(order.incoterms),
	          },
	          {
	            key: 'units',
	            header: buildColumnHeader('Units'),
	            align: 'right',
	            fit: true,
	            thClassName: 'w-[88px]',
	            tdClassName: 'px-3 py-2 text-right whitespace-nowrap font-semibold tabular-nums text-foreground',
	            render: order => sumLineUnits(order.lines).toLocaleString(),
	          },
	          {
	            key: 'lines',
	            header: buildColumnHeader('Lines'),
	            align: 'right',
	            fit: true,
	            thClassName: 'w-[72px]',
	            tdClassName: 'px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
	            render: order => order.lines.length.toLocaleString(),
	          }
        )
        break
      }
      case 'ISSUED': {
        cols.push(
	          {
	            key: 'cargo-ready',
	            header: buildColumnHeader('Cargo Ready'),
	            fit: true,
	            thClassName: 'w-[112px]',
	            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums',
	            render: order => formatDateDisplay(order.expectedDate),
	          },
	          {
	            key: 'pi-number',
	            header: buildColumnHeader('PI #'),
	            fit: true,
	            thClassName: 'w-[140px]',
	            tdClassName: 'px-3 py-2 min-w-0 whitespace-nowrap font-medium text-foreground',
	            render: order => (
              <span
                className="block max-w-full truncate"
                title={order.stageData.manufacturing.proformaInvoiceNumber ?? undefined}
              >
                {formatTextOrDash(order.stageData.manufacturing.proformaInvoiceNumber)}
              </span>
            ),
          },
          {
            key: 'factory',
            header: buildColumnHeader('Factory'),
            thClassName: 'w-[clamp(160px,18vw,220px)]',
            tdClassName: 'px-3 py-2 min-w-0 text-muted-foreground',
            render: order => (
              <span
                className="block max-w-full truncate"
                title={order.stageData.manufacturing.factoryName ?? undefined}
              >
                {formatTextOrDash(order.stageData.manufacturing.factoryName)}
              </span>
            ),
          },
	          {
	            key: 'units',
	            header: buildColumnHeader('Units'),
	            align: 'right',
	            fit: true,
	            thClassName: 'w-[88px]',
	            tdClassName: 'px-3 py-2 text-right whitespace-nowrap font-semibold tabular-nums text-foreground',
	            render: order => sumLineUnits(order.lines).toLocaleString(),
	          },
	          {
	            key: 'lines',
	            header: buildColumnHeader('Lines'),
	            align: 'right',
	            fit: true,
	            thClassName: 'w-[72px]',
	            tdClassName: 'px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
	            render: order => order.lines.length.toLocaleString(),
	          }
        )
        break
      }
      case 'MANUFACTURING': {
        cols.push(
	          {
	            key: 'pi-number',
	            header: buildColumnHeader('PI #'),
	            fit: true,
	            thClassName: 'w-[140px]',
	            tdClassName: 'px-3 py-2 min-w-0 whitespace-nowrap font-medium text-foreground',
	            render: order => (
              <span
                className="block max-w-full truncate"
                title={order.stageData.manufacturing.proformaInvoiceNumber ?? undefined}
              >
                {formatTextOrDash(order.stageData.manufacturing.proformaInvoiceNumber)}
              </span>
            ),
          },
          {
            key: 'factory',
            header: buildColumnHeader('Factory'),
            thClassName: 'w-[clamp(160px,18vw,220px)]',
            tdClassName: 'px-3 py-2 min-w-0 text-muted-foreground',
            render: order => (
              <span
                className="block max-w-full truncate"
                title={order.stageData.manufacturing.factoryName ?? undefined}
              >
                {formatTextOrDash(order.stageData.manufacturing.factoryName)}
              </span>
            ),
          },
	          {
	            key: 'expected-completion',
	            header: buildColumnHeader('Exp. Complete'),
	            fit: true,
	            thClassName: 'w-[120px]',
	            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums',
	            render: order => formatDateDisplay(order.stageData.manufacturing.expectedCompletionDate),
	          },
	          {
	            key: 'cartons',
	            header: buildColumnHeader('Cartons'),
	            align: 'right',
	            fit: true,
	            thClassName: 'w-[88px]',
	            tdClassName: 'px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
	            render: order => formatNumberDisplay(order.stageData.manufacturing.totalCartons),
	          }
        )
        break
      }
      case 'OCEAN': {
        cols.push(
          {
            key: 'hbl',
            header: buildColumnHeader('HBL'),
            thClassName: 'w-[clamp(130px,17vw,190px)]',
            tdClassName: 'px-3 py-2 min-w-0 font-medium text-foreground',
            render: order => {
              const value = formatTextOrDash(order.stageData.ocean.houseBillOfLading)
              return (
                <span
                  className="block max-w-full truncate"
                  title={order.stageData.ocean.houseBillOfLading ?? undefined}
                >
                  {value}
                </span>
              )
            },
          },
          {
            key: 'route',
            header: buildColumnHeader('Route'),
            thClassName: 'w-[clamp(140px,18vw,220px)]',
            tdClassName: 'px-3 py-2 min-w-0 text-muted-foreground',
            render: order => {
              const pol = formatTextOrEmpty(order.stageData.ocean.portOfLoading)
              const pod = formatTextOrEmpty(order.stageData.ocean.portOfDischarge)

              let value = '—'
              if (pol.length > 0 && pod.length > 0) {
                value = `${pol} → ${pod}`
              } else if (pol.length > 0) {
                value = pol
              } else if (pod.length > 0) {
                value = pod
              }

              return (
                <span className="block max-w-full truncate" title={value}>
                  {value}
                </span>
              )
            },
          },
	          {
	            key: 'etd',
	            header: buildColumnHeader('ETD'),
	            fit: true,
	            thClassName: 'w-[96px]',
	            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums',
	            render: order => formatDateDisplay(order.stageData.ocean.estimatedDeparture),
	          },
	          {
	            key: 'eta',
	            header: buildColumnHeader('ETA'),
	            fit: true,
	            thClassName: 'w-[96px]',
	            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums',
	            render: order => formatDateDisplay(order.stageData.ocean.estimatedArrival),
	          }
        )
        break
      }
      case 'WAREHOUSE': {
        cols.push(
          {
            key: 'warehouse',
            header: buildColumnHeader(<span title="Warehouse">WH</span>),
            fit: true,
            thClassName: 'w-[64px]',
            tdClassName: 'px-3 py-2 whitespace-nowrap font-medium text-foreground',
            render: order => (
              <span
                className="block max-w-full truncate"
                title={order.stageData.warehouse.warehouseName ?? undefined}
              >
                {formatTextOrDash(order.stageData.warehouse.warehouseCode)}
              </span>
            ),
          },
          {
            key: 'receiving',
            header: buildColumnHeader(
              'Receiving',
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Filter receiving type"
                  >
                    <Filter
                      className={[
                        'h-4 w-4',
                        receiveTypeFilter !== FILTER_ALL ? 'text-primary' : 'text-muted-foreground',
                      ].join(' ')}
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-3">
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      Receiving
                    </p>
                    <Select value={receiveTypeFilter} onValueChange={setReceiveTypeFilter}>
                      <SelectTrigger className="h-9 w-full px-2 text-sm font-normal normal-case tracking-normal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={FILTER_ALL}>All</SelectItem>
                        {receiveTypeOptions.map(option => (
                          <SelectItem key={option} value={option}>
                            {formatReceiveTypeDisplay(option)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </PopoverContent>
              </Popover>
            ),
            fit: true,
            thClassName: 'w-[96px]',
            tdClassName: 'px-3 py-2 min-w-0 text-muted-foreground',
            render: order => (
              <span className="block max-w-full truncate" title={order.receiveType ?? undefined}>
                {formatReceiveTypeDisplay(order.receiveType)}
              </span>
            ),
          },
          {
            key: 'customs-entry',
            header: buildColumnHeader('Entry #'),
            thClassName: 'w-[120px]',
            tdClassName: 'px-3 py-2 min-w-0 text-muted-foreground',
            render: order => (
              <span
                className="block max-w-full truncate"
                title={order.stageData.warehouse.customsEntryNumber ?? undefined}
              >
                {formatTextOrDash(order.stageData.warehouse.customsEntryNumber)}
              </span>
            ),
          },
          {
            key: 'customs-cleared',
            header: buildColumnHeader('Cleared'),
            fit: true,
            thClassName: 'w-[88px]',
            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums',
            render: order => formatDateDisplay(order.stageData.warehouse.customsClearedDate),
          },
          {
            key: 'received-date',
            header: buildColumnHeader('Received'),
            fit: true,
            thClassName: 'w-[88px]',
            tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums',
            render: order => formatDateDisplay(order.stageData.warehouse.receivedDate),
          },
          {
            key: 'cartons-ordered',
            header: buildColumnHeader('Cartons'),
            align: 'right',
            fit: true,
            thClassName: 'w-[78px]',
            tdClassName: 'px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
            render: order => sumLineCartons(order.lines).toLocaleString(),
          },
          {
            key: 'cartons-received',
            header: buildColumnHeader('Recvd'),
            align: 'right',
            fit: true,
            thClassName: 'w-[78px]',
            tdClassName: 'px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
            render: order => sumReceivedQuantities(order.lines).toLocaleString(),
          }
        )
        break
      }
      case 'REJECTED':
      case 'CANCELLED': {
        cols.push(
          {
            key: 'notes',
            header: buildColumnHeader('Notes'),
            tdClassName: 'px-3 py-2 min-w-0 text-muted-foreground',
            render: order => (
              <span className="block max-w-full truncate" title={order.notes ?? undefined}>
                {formatTextOrDash(order.notes)}
              </span>
            ),
          },
          {
            key: 'units',
            header: buildColumnHeader('Units'),
            align: 'right',
            fit: true,
            thClassName: 'w-[88px]',
            tdClassName: 'px-3 py-2 text-right whitespace-nowrap font-semibold tabular-nums text-foreground',
            render: order => sumLineUnits(order.lines).toLocaleString(),
          },
          {
            key: 'lines',
            header: buildColumnHeader('Lines'),
            align: 'right',
            fit: true,
            thClassName: 'w-[72px]',
            tdClassName: 'px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
            render: order => order.lines.length.toLocaleString(),
          }
        )
        break
      }
      default: {
        // No stage-specific columns for unknown statuses (ex: legacy / shipped)
      }
    }

    cols.push(
      {
        key: 'created-by',
        header: buildColumnHeader('Created By'),
        fit: true,
        thClassName: 'w-[120px]',
        tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground',
        render: order => (
          <span className="block max-w-full truncate" title={order.createdByName ?? undefined}>
            {formatTextOrDash(order.createdByName)}
          </span>
        ),
      },
      {
        key: 'created',
        header: buildColumnHeader('Created'),
        fit: true,
        thClassName: 'w-[96px]',
        tdClassName: 'px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums',
        render: order => formatDateDisplay(order.createdAt),
      }
    )

    return cols
  }, [
    receiveTypeFilter,
    receiveTypeOptions,
    searchFilter,
    statusFilter,
    supplierFilter,
    supplierOptions,
    typeFilter,
  ])

	  return (
	    <div className="flex min-h-0 flex-1 flex-col gap-4">
	      <DataTableContainer
	        title="Purchase Orders"
	        headerContent={
	          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
	            <span>
	              <span className="font-semibold text-foreground">{statusCounts.issuedCount}</span> Issued
	            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.manufacturingCount}</span>{' '}
              Manufacturing
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.oceanCount}</span> Transit
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.warehouseCount}</span> Warehouse
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.rejectedCount}</span> Rejected
            </span>
            <span>
              <span className="font-semibold text-foreground">{statusCounts.cancelledCount}</span> Cancelled
            </span>
            {hasActiveFilters && (
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        }
        className="flex-1"
      >
        <table className="w-full table-fixed text-sm">
          <DataTableHead>
            <tr className="border-b border-border">
              {columns.map(column => (
                <DataTableHeaderCell
                  key={column.key}
                  align={column.align}
                  className={['min-w-0 overflow-hidden', column.fit ? FIT_CELL_CLASSES : null, column.thClassName]
                    .filter(Boolean)
                    .join(' ')}
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
