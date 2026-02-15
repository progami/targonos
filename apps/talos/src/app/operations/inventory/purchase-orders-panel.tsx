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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ChevronRight, Eye, Filter, Search } from '@/lib/lucide-icons'
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
  | 'CLOSED'
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
  grnNumber?: string | null
  splitGroupId?: string | null
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
  onCountsLoaded?: (counts: Record<string, number>) => void
  globalSearch?: string
  lifecycleTrigger?: number
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
    matches(order.grnNumber) ||
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
  onCountsLoaded,
  globalSearch,
  lifecycleTrigger,
}: PurchaseOrdersPanelProps) {
  const [allOrders, setAllOrders] = useState<PurchaseOrderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [searchFilter, setSearchFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState(FILTER_ALL)
  const [receiveTypeFilter, setReceiveTypeFilter] = useState(FILTER_ALL)
  const [lifecycleOrderId, setLifecycleOrderId] = useState<string | null>(null)
  const [lifecycleMembers, setLifecycleMembers] = useState<PurchaseOrderSummary[]>([])
  const [lifecycleLoading, setLifecycleLoading] = useState(false)

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(withBasePath('/api/purchase-orders'), { credentials: 'include' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        toast.error(payload?.error ?? 'Failed to load purchase orders')
        return
      }
      const payload = await response.json().catch(() => null)
      setAllOrders(Array.isArray(payload?.data) ? (payload.data as PurchaseOrderSummary[]) : [])
    } catch (_error) {
      toast.error('Failed to load purchase orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const orders = allOrders

  useEffect(() => {
    if (statusFilter !== 'WAREHOUSE') {
      setReceiveTypeFilter(FILTER_ALL)
    }
  }, [statusFilter])

  // Count orders by stage — filtered by global search when active, so tab counts reflect matches
  const statusCounts = useMemo(() => {
    const globalNeedle = typeof globalSearch === 'string' ? globalSearch.trim() : ''
    const source = globalNeedle.length > 0
      ? allOrders.filter(o => {
          const matchesType = typeFilter ? o.type === typeFilter : true
          return matchesType && orderMatchesSearch(o, globalNeedle)
        })
      : allOrders
    return source.reduce(
      (acc, order) => {
        if (order.status === 'ISSUED') acc.issuedCount += 1
        if (order.status === 'MANUFACTURING') acc.manufacturingCount += 1
        if (order.status === 'OCEAN') acc.oceanCount += 1
        if (order.status === 'WAREHOUSE') acc.warehouseCount += 1
        if (order.status === 'CLOSED') acc.closedCount += 1
        return acc
      },
      {
        issuedCount: 0,
        manufacturingCount: 0,
        oceanCount: 0,
        warehouseCount: 0,
        closedCount: 0,
      }
    )
  }, [allOrders, globalSearch, typeFilter])

  useEffect(() => {
    onCountsLoaded?.({
      ISSUED: statusCounts.issuedCount,
      MANUFACTURING: statusCounts.manufacturingCount,
      OCEAN: statusCounts.oceanCount,
      WAREHOUSE: statusCounts.warehouseCount,
      CLOSED: statusCounts.closedCount,
    })
  }, [statusCounts, onCountsLoaded])

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
    const globalNeedle = typeof globalSearch === 'string' ? globalSearch.trim() : ''

    return visibleOrders.filter(order => {
      if (globalNeedle.length > 0 && !orderMatchesSearch(order, globalNeedle)) return false

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
  }, [globalSearch, receiveTypeFilter, searchFilter, statusFilter, supplierFilter, visibleOrders])

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

  const openLifecycle = useCallback(async (order: PurchaseOrderSummary) => {
    setLifecycleOrderId(order.id)

    if (order.splitGroupId) {
      // Fetch all split group members (may include cross-tenant POs)
      setLifecycleLoading(true)
      const localMembers = allOrders.filter(o => o.splitGroupId === order.splitGroupId)

      try {
        const endpoint = withBasePath(`/api/purchase-orders?splitGroupId=${encodeURIComponent(order.splitGroupId)}`)
        const response = await fetch(endpoint, { credentials: 'include' })
        if (response.ok) {
          const payload = await response.json().catch(() => null)
          const remote = Array.isArray(payload?.data) ? (payload.data as PurchaseOrderSummary[]) : []
          // Merge: use remote data, but also include any local-only entries
          const remoteIds = new Set(remote.map(r => r.id))
          setLifecycleMembers([...remote, ...localMembers.filter(l => !remoteIds.has(l.id))])
        } else {
          setLifecycleMembers(localMembers)
        }
      } catch {
        setLifecycleMembers(localMembers)
      } finally {
        setLifecycleLoading(false)
      }
    } else {
      setLifecycleMembers([order])
    }
  }, [allOrders])

  const lifecycleOrder = useMemo(
    () => (lifecycleOrderId ? allOrders.find(o => o.id === lifecycleOrderId) ?? lifecycleMembers.find(o => o.id === lifecycleOrderId) ?? null : null),
    [lifecycleOrderId, allOrders, lifecycleMembers]
  )

  // React to lifecycle trigger from the page-level "View Lifecycle" button
  useEffect(() => {
    if (!lifecycleTrigger || !globalSearch) return
    const needle = globalSearch.trim()
    if (!needle) return
    const match = allOrders.find(o => orderMatchesSearch(o, needle))
    if (match) openLifecycle(match)
  }, [lifecycleTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const columns = useMemo<TableColumn[]>(() => {
    const cols: TableColumn[] = []
    const getOrderHref = (order: PurchaseOrderSummary) =>
      order.tenantCode
        ? `/operations/purchase-orders/${order.id}?tenant=${encodeURIComponent(order.tenantCode)}`
        : `/operations/purchase-orders/${order.id}`

    const getPoReference = (order: PurchaseOrderSummary) => order.poNumber ?? order.orderNumber

    const isTransitStage = statusFilter === 'OCEAN'
    const isWarehouseStage = statusFilter === 'WAREHOUSE'
    const primaryIdentifierLabel = isTransitStage ? 'CI #' : isWarehouseStage ? 'GRN #' : 'PO #'

    cols.push({
      key: isTransitStage ? 'primary-ci-number' : isWarehouseStage ? 'primary-grn-number' : 'primary-po-number',
      header: buildColumnHeader(
        primaryIdentifierLabel,
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
                placeholder="Reference #, supplier, notes…"
                className="h-9 px-2 text-sm font-normal normal-case tracking-normal"
                autoFocus
              />
            </div>
          </PopoverContent>
        </Popover>
      ),
      fit: true,
      thClassName: 'w-[126px]',
      tdClassName: 'px-2 py-2 font-medium text-foreground min-w-0',
      render: order => {
        const primaryValue = isTransitStage
          ? order.stageData.ocean.commercialInvoiceNumber
          : isWarehouseStage
            ? order.grnNumber
            : getPoReference(order)

        return (
          <Link
            href={getOrderHref(order)}
            className="block max-w-full truncate text-primary hover:underline"
            title={typeof primaryValue === 'string' ? primaryValue : undefined}
            prefetch={false}
          >
            {isTransitStage || isWarehouseStage ? formatTextOrDash(primaryValue) : getPoReference(order)}
          </Link>
        )
      },
    })

    if (isTransitStage) {
      cols.push({
        key: 'po-number',
        header: buildColumnHeader('PO #'),
        fit: true,
        thClassName: 'w-[126px]',
        tdClassName: 'px-2 py-2 font-medium text-foreground min-w-0',
        render: order => (
          <Link
            href={getOrderHref(order)}
            className="block max-w-full truncate text-primary hover:underline"
            prefetch={false}
          >
            {getPoReference(order)}
          </Link>
        ),
      })
    }

    if (isWarehouseStage) {
      cols.push(
        {
          key: 'ci-number',
          header: buildColumnHeader('CI #'),
          fit: true,
          thClassName: 'w-[126px]',
          tdClassName: 'px-2 py-2 font-medium text-foreground min-w-0',
          render: order => (
            <Link
              href={getOrderHref(order)}
              className="block max-w-full truncate text-primary hover:underline"
              title={order.stageData.ocean.commercialInvoiceNumber ?? undefined}
              prefetch={false}
            >
              {formatTextOrDash(order.stageData.ocean.commercialInvoiceNumber)}
            </Link>
          ),
        },
        {
          key: 'po-number',
          header: buildColumnHeader('PO #'),
          fit: true,
          thClassName: 'w-[126px]',
          tdClassName: 'px-2 py-2 font-medium text-foreground min-w-0',
          render: order => (
            <Link
              href={getOrderHref(order)}
              className="block max-w-full truncate text-primary hover:underline"
              prefetch={false}
            >
              {getPoReference(order)}
            </Link>
          ),
        }
      )
    }

    if (!typeFilter) {
      cols.push({
        key: 'type',
        header: buildColumnHeader('Type'),
        fit: true,
        thClassName: 'w-[88px]',
        tdClassName: 'px-2 py-2 whitespace-nowrap',
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
      tdClassName: 'px-2 py-2 min-w-0 text-muted-foreground',
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
            tdClassName: 'px-2 py-2 whitespace-nowrap text-muted-foreground tabular-nums',
            render: order => formatDateDisplay(order.expectedDate),
          },
          {
            key: 'incoterms',
            header: buildColumnHeader('Incoterms'),
            fit: true,
            thClassName: 'w-[96px]',
            tdClassName: 'px-2 py-2 whitespace-nowrap font-medium text-foreground',
            render: order => formatTextOrDash(order.incoterms),
          },
          {
            key: 'units',
            header: buildColumnHeader('Units'),
            align: 'right',
            fit: true,
            thClassName: 'w-[88px]',
            tdClassName: 'px-2 py-2 text-right whitespace-nowrap font-semibold tabular-nums text-foreground',
            render: order => sumLineUnits(order.lines).toLocaleString(),
          },
          {
            key: 'lines',
            header: buildColumnHeader('Lines'),
            align: 'right',
            fit: true,
            thClassName: 'w-[72px]',
            tdClassName: 'px-2 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
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
            tdClassName: 'px-2 py-2 min-w-0 whitespace-nowrap font-medium text-foreground',
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
            tdClassName: 'px-2 py-2 min-w-0 text-muted-foreground',
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
            tdClassName: 'px-2 py-2 whitespace-nowrap text-muted-foreground tabular-nums',
            render: order => formatDateDisplay(order.stageData.manufacturing.expectedCompletionDate),
          },
          {
            key: 'cartons',
            header: buildColumnHeader('Cartons'),
            align: 'right',
            fit: true,
            thClassName: 'w-[88px]',
            tdClassName: 'px-2 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
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
            tdClassName: 'px-2 py-2 min-w-0 font-medium text-foreground',
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
            tdClassName: 'px-2 py-2 min-w-0 text-muted-foreground',
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
	            tdClassName: 'px-2 py-2 whitespace-nowrap text-muted-foreground tabular-nums',
	            render: order => formatDateDisplay(order.stageData.ocean.estimatedDeparture),
	          },
	          {
	            key: 'eta',
	            header: buildColumnHeader('ETA'),
	            fit: true,
	            thClassName: 'w-[96px]',
	            tdClassName: 'px-2 py-2 whitespace-nowrap text-muted-foreground tabular-nums',
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
            tdClassName: 'px-2 py-2 whitespace-nowrap font-medium text-foreground',
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
            tdClassName: 'px-2 py-2 min-w-0 text-muted-foreground',
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
            tdClassName: 'px-2 py-2 min-w-0 text-muted-foreground',
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
            tdClassName: 'px-2 py-2 whitespace-nowrap text-muted-foreground tabular-nums',
            render: order => formatDateDisplay(order.stageData.warehouse.customsClearedDate),
          },
          {
            key: 'received-date',
            header: buildColumnHeader('Received'),
            fit: true,
            thClassName: 'w-[88px]',
            tdClassName: 'px-2 py-2 whitespace-nowrap text-muted-foreground tabular-nums',
            render: order => formatDateDisplay(order.stageData.warehouse.receivedDate),
          },
          {
            key: 'cartons-ordered',
            header: buildColumnHeader('Cartons'),
            align: 'right',
            fit: true,
            thClassName: 'w-[78px]',
            tdClassName: 'px-2 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
            render: order => sumLineCartons(order.lines).toLocaleString(),
          },
          {
            key: 'cartons-received',
            header: buildColumnHeader('Recvd'),
            align: 'right',
            fit: true,
            thClassName: 'w-[78px]',
            tdClassName: 'px-2 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
            render: order => sumReceivedQuantities(order.lines).toLocaleString(),
          }
        )
        break
      }
      case 'CLOSED': {
        cols.push(
          {
            key: 'notes',
            header: buildColumnHeader('Notes'),
            tdClassName: 'px-2 py-2 min-w-0 text-muted-foreground',
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
            tdClassName: 'px-2 py-2 text-right whitespace-nowrap font-semibold tabular-nums text-foreground',
            render: order => sumLineUnits(order.lines).toLocaleString(),
          },
          {
            key: 'lines',
            header: buildColumnHeader('Lines'),
            align: 'right',
            fit: true,
            thClassName: 'w-[72px]',
            tdClassName: 'px-2 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground',
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
        tdClassName: 'px-2 py-2 whitespace-nowrap text-muted-foreground',
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
        tdClassName: 'px-2 py-2 whitespace-nowrap text-muted-foreground tabular-nums',
        render: order => formatDateDisplay(order.createdAt),
      },
      {
        key: 'lifecycle',
        header: buildColumnHeader(''),
        fit: true,
        thClassName: 'w-[40px]',
        tdClassName: 'px-1 py-2',
        render: order => (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="View lifecycle"
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              openLifecycle(order)
            }}
          >
            <Eye className="h-4 w-4 text-muted-foreground" />
          </Button>
        ),
      }
    )

    return cols
  }, [
    openLifecycle,
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
	          hasActiveFilters ? (
	            <Button type="button" variant="outline" size="sm" className="h-8" onClick={clearFilters}>
	              Clear filters
	            </Button>
	          ) : undefined
	        }
        className="max-h-full"
      >
        <table className="w-full text-sm">
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
                    <td key={`${order.id}-${column.key}`} className={column.tdClassName ?? 'px-2 py-2 whitespace-nowrap'}>
                      {column.render(order)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTableContainer>

      {/* Lifecycle Dialog */}
      <Dialog open={lifecycleOrderId !== null} onOpenChange={open => { if (!open) setLifecycleOrderId(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>PO Lifecycle</DialogTitle>
            <DialogDescription>
              {lifecycleOrder
                ? `Journey of ${lifecycleOrder.poNumber ?? lifecycleOrder.orderNumber}`
                : 'Loading…'}
            </DialogDescription>
          </DialogHeader>
          {lifecycleLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading lifecycle…</p>
          ) : lifecycleOrder ? (
            <LifecycleTree order={lifecycleOrder} members={lifecycleMembers} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ---------- Lifecycle tree helpers ---------- */

const STAGE_ORDER: PurchaseOrderStatusOption[] = ['ISSUED', 'MANUFACTURING', 'OCEAN', 'WAREHOUSE', 'CLOSED']

const STAGE_LABEL: Record<string, string> = {
  ISSUED: 'Issued',
  MANUFACTURING: 'Manufacturing',
  OCEAN: 'Transit',
  WAREHOUSE: 'Warehouse',
  CLOSED: 'Closed',
}

function stageIndex(status: PurchaseOrderStatusOption) {
  const idx = STAGE_ORDER.indexOf(status)
  return idx >= 0 ? idx : 0
}

function LifecycleTree({ order, members }: { order: PurchaseOrderSummary; members: PurchaseOrderSummary[] }) {
  const poRef = order.poNumber ?? order.orderNumber
  const isSplitGroup = members.length > 1

  // Build stage progression for the parent PO
  const currentIdx = stageIndex(order.status)
  const passedStages = STAGE_ORDER.filter((_s, i) => i <= currentIdx && i < STAGE_ORDER.length - 1)

  return (
    <div className="space-y-4 py-2">
      {/* Stage progression */}
      <div className="flex items-center gap-1 text-xs">
        {passedStages.map((stage, i) => (
          <span key={stage} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            <Badge
              className={
                stage === order.status
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }
            >
              {STAGE_LABEL[stage] ?? stage}
            </Badge>
          </span>
        ))}
        {order.status === 'CLOSED' && (
          <span className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <Badge className="bg-destructive/10 text-destructive border border-destructive/20">Closed</Badge>
          </span>
        )}
      </div>

      {/* Tree of children */}
      <div className="rounded-md border border-border p-3 space-y-3">
        <p className="text-sm font-semibold text-foreground">
          PO# {poRef}
        </p>
        {isSplitGroup ? (
          <div className="ml-3 space-y-2 border-l-2 border-border pl-3">
            {members.map(member => (
              <LifecycleNode key={member.id} order={member} />
            ))}
          </div>
        ) : (
          <div className="ml-3 border-l-2 border-border pl-3">
            <LifecycleNode order={order} />
          </div>
        )}
      </div>
    </div>
  )
}

function LifecycleNode({ order }: { order: PurchaseOrderSummary }) {
  const ci = order.stageData.ocean.commercialInvoiceNumber
  const grn = order.grnNumber
  const tenant = order.tenantCode

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {ci ? (
        <span className="font-medium text-foreground">CI# {ci}</span>
      ) : (
        <span className="text-muted-foreground italic">No CI</span>
      )}
      <ChevronRight className="h-3 w-3 text-muted-foreground" />
      {grn ? (
        <span className="font-medium text-foreground">GRN# {grn}</span>
      ) : (
        <span className="text-muted-foreground italic">No GRN</span>
      )}
      {tenant && (
        <Badge variant="outline" className="text-xs">{tenant.toUpperCase()}</Badge>
      )}
      <Badge
        className={
          order.status === 'CLOSED'
            ? 'bg-destructive/10 text-destructive border border-destructive/20'
            : order.status === 'WAREHOUSE'
              ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20'
              : 'bg-muted text-muted-foreground'
        }
      >
        {STAGE_LABEL[order.status] ?? order.status}
      </Badge>
    </div>
  )
}
