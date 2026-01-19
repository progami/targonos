'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '@/hooks/usePortalSession'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import {
  Search,
  Building,
  Package,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  BookOpen,
} from '@/lib/lucide-icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner, PageLoading } from '@/components/ui/loading-spinner'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'
import {
  useInventoryFilters,
  type InventoryBalance,
  type SortKey,
} from '@/hooks/useInventoryFilters'
import { getMovementTypeFromTransaction, getMovementMultiplier } from '@/lib/utils/movement-types'
import { usePageState } from '@/lib/store'

const LEDGER_TIME_FORMAT = 'PPP p'

function formatLedgerTimestamp(value: string | Date | null | undefined) {
  if (!value) {
    return null
  }
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return format(date, LEDGER_TIME_FORMAT)
}

interface InventorySummary {
  totalSkuCount: number
  totalBatchCount: number
  batchesWithInventory: number
  batchesOutOfStock: number
}

interface InventoryResponse {
  data: InventoryBalance[]
  pagination?: {
    totalCount: number
  }
  summary?: InventorySummary
}

const PAGE_KEY = '/operations/inventory'

function InventoryPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [balances, setBalances] = useState<InventoryBalance[]>([])
  const [summary, setSummary] = useState<InventorySummary | null>(null)
  const pageState = usePageState(PAGE_KEY)
  const [hydrated, setHydrated] = useState(false)
  const [showZeroStock, setShowZeroStock] = useState(false)

  // Use the inventory filters hook for filtering, sorting, and persistence
  const {
    columnFilters,
    sortConfig,
    handleSort,
    updateColumnFilter,
    toggleMultiValueFilter,
    clearColumnFilter,
    isFilterActive,
    uniqueWarehouseOptions,
    uniqueSkuOptions,
    uniqueBatchOptions,
    processedBalances,
  } = useInventoryFilters({
    pageKey: PAGE_KEY,
    balances,
    formatTimestamp: formatLedgerTimestamp,
  })

  useEffect(() => {
    setHydrated(true)
    const persisted = pageState.custom?.showZeroStock
    if (typeof persisted === 'boolean') {
      setShowZeroStock(persisted)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hydrated) {
      pageState.setCustom('showZeroStock', showZeroStock)
    }
  }, [hydrated, showZeroStock]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      redirectToPortal('/login', `${window.location.origin}${withBasePath('/operations/inventory')}`)
      return
    }
    if (!['staff', 'admin'].includes(session.user.role)) {
      router.push('/dashboard')
      return
    }
  }, [session, status, router])

  const fetchBalances = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        showZeroStock: showZeroStock ? 'true' : 'false',
      })

      const response = await fetch(`/api/inventory/balances?${params}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        toast.error(`Failed to load inventory balances: ${errorData.error || response.statusText}`)
        return
      }

      const payload: InventoryResponse | InventoryBalance[] = await response.json()

      if (Array.isArray(payload)) {
        setBalances(payload)
        setSummary(null)
      } else {
        setBalances(payload.data || [])
        setSummary(payload.summary ?? null)
      }
    } catch (_error) {
      toast.error('Failed to load inventory balances')
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [showZeroStock])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchBalances()
    }
  }, [fetchBalances, status])

  const headerActions = useMemo(
    () => (
      <label className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer">
        <input
          type="checkbox"
          checked={showZeroStock}
          onChange={event => setShowZeroStock(event.target.checked)}
          className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
        />
        Show zero stock
      </label>
    ),
    [showZeroStock]
  )

  const tableTotals = useMemo(() => {
    return processedBalances.reduce(
      (acc, balance) => {
        const multiplier = getMovementMultiplier(balance.lastTransactionType)
        const baseCartons = Math.abs(balance.currentCartons)
        const basePallets = Math.abs(balance.currentPallets)
        const baseUnits = Math.abs(balance.currentUnits)

        acc.cartons += multiplier === 0 ? balance.currentCartons : multiplier * baseCartons
        acc.pallets += multiplier === 0 ? balance.currentPallets : multiplier * basePallets
        acc.units += multiplier === 0 ? balance.currentUnits : multiplier * baseUnits
        return acc
      },
      { cartons: 0, pallets: 0, units: 0 }
    )
  }, [processedBalances])

  const getSortIcon = useCallback(
    (key: SortKey) => {
      if (!sortConfig || sortConfig.key !== key) {
        return <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
      }

      return sortConfig.direction === 'asc' ? (
        <ArrowUp className="h-4 w-4 text-primary" />
      ) : (
        <ArrowDown className="h-4 w-4 text-primary" />
      )
    },
    [sortConfig]
  )

  const metrics = useMemo(() => {
    const totalCartons = balances.reduce((sum, balance) => sum + balance.currentCartons, 0)
    const totalPallets = balances.reduce((sum, balance) => sum + balance.currentPallets, 0)
    const uniqueWarehouses = new Set(balances.map(balance => balance.warehouse.code)).size
    const uniqueSkusFallback = new Set(balances.map(balance => balance.sku.skuCode)).size
    const batchesWithInventoryFallback = balances.filter(
      balance => balance.currentCartons > 0
    ).length
    const totalBatchCountFallback = balances.length
    const batchesOutOfStockFallback = Math.max(
      totalBatchCountFallback - batchesWithInventoryFallback,
      0
    )

    return {
      totalCartons,
      totalPallets,
      uniqueWarehouses,
      summary: {
        totalSkuCount: summary?.totalSkuCount ?? uniqueSkusFallback,
        totalBatchCount: summary?.totalBatchCount ?? totalBatchCountFallback,
        batchesWithInventory: summary?.batchesWithInventory ?? batchesWithInventoryFallback,
        batchesOutOfStock: summary?.batchesOutOfStock ?? batchesOutOfStockFallback,
      },
    }
  }, [balances, summary])

  const baseFilterInputClass =
    'w-full rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary'

  if (status === 'loading') {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeaderSection
        title="Inventory Ledger"
        description="Operations"
        icon={BookOpen}
        actions={headerActions}
      />
      <PageContent className="flex-1 overflow-hidden px-4 py-6 sm:px-6 lg:px-8 flex flex-col">
        <div className="flex flex-col gap-6 flex-1 min-h-0">
          <StatsCardGrid cols={3}>
            <StatsCard
              title="Total Cartons"
              value={metrics.totalCartons}
              subtitle={`${metrics.uniqueWarehouses} ${metrics.uniqueWarehouses === 1 ? 'warehouse' : 'warehouses'}`}
              icon={Package}
              variant="info"
            />
            <StatsCard
              title="Total Pallets"
              value={metrics.totalPallets}
              subtitle="Calculated from cartons"
              icon={Building}
              variant="default"
            />
            <StatsCard
              title="Active SKUs"
              value={metrics.summary.totalSkuCount}
              subtitle="Reporting inventory"
              icon={Search}
              variant="default"
            />
          </StatsCardGrid>

          <div className="flex min-h-0 flex-col rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-x-auto flex-1">
            {/* Scrollable table area */}
            <div className="relative min-h-0 overflow-y-auto scrollbar-gutter-stable flex-1">
              <table className="w-full min-w-[1200px] table-auto text-sm">
                <thead>
                  <tr className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left font-semibold w-48">
                      <span>Source</span>
                    </th>
                    <th className="px-3 py-2 text-left font-semibold w-56">
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          className="flex flex-1 items-center gap-1 text-left hover:text-primary focus:outline-none"
                          onClick={() => handleSort('warehouse')}
                        >
                          Warehouse
                          {getSortIcon('warehouse')}
                        </button>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label="Filter warehouses"
                              className={cn(
                                'inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors',
                                isFilterActive(['warehouse'])
                                  ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
                                  : 'hover:bg-muted hover:text-primary'
                              )}
                            >
                              <Filter className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-64 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">
                                Warehouse filter
                              </span>
                              <button
                                type="button"
                                className="text-xs font-medium text-primary hover:underline"
                                onClick={() => clearColumnFilter(['warehouse'])}
                              >
                                Clear
                              </button>
                            </div>
                            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                              {uniqueWarehouseOptions.map(option => (
                                <label
                                  key={option.value}
                                  className="flex items-center gap-2 text-sm text-foreground"
                                >
                                  <input
                                    type="checkbox"
                                    checked={columnFilters.warehouse.includes(option.value)}
                                    onChange={() =>
                                      toggleMultiValueFilter('warehouse', option.value)
                                    }
                                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                  />
                                  <span className="flex-1 text-sm">{option.label}</span>
                                </label>
                              ))}
                              {uniqueWarehouseOptions.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                  No warehouse options available.
                                </p>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left font-semibold w-40">
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          className="flex flex-1 items-center gap-1 text-left hover:text-primary focus:outline-none"
                          onClick={() => handleSort('sku')}
                        >
                          SKU
                          {getSortIcon('sku')}
                        </button>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label="Filter SKUs"
                              className={cn(
                                'inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors',
                                isFilterActive(['sku'])
                                  ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
                                  : 'hover:bg-muted hover:text-primary'
                              )}
                            >
                              <Filter className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-64 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">
                                SKU filter
                              </span>
                              <button
                                type="button"
                                className="text-xs font-medium text-primary hover:underline"
                                onClick={() => clearColumnFilter(['sku'])}
                              >
                                Clear
                              </button>
                            </div>
                            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                              {uniqueSkuOptions.map(option => (
                                <label
                                  key={option.value}
                                  className="flex items-center gap-2 text-sm text-foreground"
                                >
                                  <input
                                    type="checkbox"
                                    checked={columnFilters.sku.includes(option.value)}
                                    onChange={() => toggleMultiValueFilter('sku', option.value)}
                                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                  />
                                  <span className="flex-1 text-sm">{option.label}</span>
                                </label>
                              ))}
                              {uniqueSkuOptions.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                  No SKU options available.
                                </p>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left font-semibold w-64">
                      <div className="flex items-center gap-1">
                        <span>SKU Description</span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label="Filter SKU descriptions"
                              className={cn(
                                'inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors',
                                isFilterActive(['skuDescription'])
                                  ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
                                  : 'hover:bg-muted hover:text-primary'
                              )}
                            >
                              <Filter className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-64 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">
                                SKU description filter
                              </span>
                              <button
                                type="button"
                                className="text-xs font-medium text-primary hover:underline"
                                onClick={() => clearColumnFilter(['skuDescription'])}
                              >
                                Clear
                              </button>
                            </div>
                            <input
                              type="text"
                              value={columnFilters.skuDescription}
                              onChange={event =>
                                updateColumnFilter('skuDescription', event.target.value)
                              }
                              placeholder="Search SKU description"
                              className={baseFilterInputClass}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left font-semibold w-40">
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          className="flex flex-1 items-center gap-1 text-left hover:text-primary focus:outline-none"
                          onClick={() => handleSort('batch')}
                        >
                          Batch
                          {getSortIcon('batch')}
                        </button>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label="Filter batch values"
                              className={cn(
                                'inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors',
                                isFilterActive(['batch'])
                                  ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
                                  : 'hover:bg-muted hover:text-primary'
                              )}
                            >
                              <Filter className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-64 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">
                                Batch filter
                              </span>
                              <button
                                type="button"
                                className="text-xs font-medium text-primary hover:underline"
                                onClick={() => clearColumnFilter(['batch'])}
                              >
                                Clear
                              </button>
                            </div>
                            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                              {uniqueBatchOptions.map(option => (
                                <label
                                  key={option.value}
                                  className="flex items-center gap-2 text-sm text-foreground"
                                >
                                  <input
                                    type="checkbox"
                                    checked={columnFilters.batch.includes(option.value)}
                                    onChange={() => toggleMultiValueFilter('batch', option.value)}
                                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                  />
                                  <span className="flex-1 text-sm">{option.label}</span>
                                </label>
                              ))}
                              {uniqueBatchOptions.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                  No batch options available.
                                </p>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left font-semibold w-40">
                      <span>Reference ID</span>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      <button
                        type="button"
                        className="flex w-full items-center justify-end gap-1 hover:text-primary focus:outline-none"
                        onClick={() => handleSort('cartons')}
                      >
                        Cartons
                        {getSortIcon('cartons')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      <button
                        type="button"
                        className="flex w-full items-center justify-end gap-1 hover:text-primary focus:outline-none"
                        onClick={() => handleSort('pallets')}
                      >
                        Pallets
                        {getSortIcon('pallets')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      <button
                        type="button"
                        className="flex w-full items-center justify-end gap-1 hover:text-primary focus:outline-none"
                        onClick={() => handleSort('units')}
                      >
                        Units
                        {getSortIcon('units')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">Movement Type</th>
                    <th className="px-3 py-2 text-left font-semibold">
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          className="flex flex-1 items-center gap-1 text-left hover:text-primary focus:outline-none"
                          onClick={() => handleSort('lastTransaction')}
                        >
                          Transaction Date
                          {getSortIcon('lastTransaction')}
                        </button>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label="Filter latest transactions"
                              className={cn(
                                'inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors',
                                isFilterActive(['lastTransaction'])
                                  ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
                                  : 'hover:bg-muted hover:text-primary'
                              )}
                            >
                              <Filter className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-64 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">
                                Transaction filter
                              </span>
                              <button
                                type="button"
                                className="text-xs font-medium text-primary hover:underline"
                                onClick={() => clearColumnFilter(['lastTransaction'])}
                              >
                                Clear
                              </button>
                            </div>
                            <input
                              type="text"
                              value={columnFilters.lastTransaction}
                              onChange={event =>
                                updateColumnFilter('lastTransaction', event.target.value)
                              }
                              placeholder="Search type or date"
                              className={baseFilterInputClass}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {loading && processedBalances.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <LoadingSpinner size="sm" />
                          Loading inventory…
                        </span>
                      </td>
                    </tr>
                  )}

                  {!loading && processedBalances.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-4 py-6 text-center text-muted-foreground">
                        {showZeroStock
                          ? 'No inventory balances match the current filters.'
                          : "No on-hand inventory. Enable 'Show zero stock' to view history for items currently at 0."}
                      </td>
                    </tr>
                  )}

                  {processedBalances.map(balance => {
                    const lastTransactionDisplay = formatLedgerTimestamp(
                      balance.lastTransactionDate
                    )
                    const movementType = getMovementTypeFromTransaction(balance.lastTransactionType)
                    const movementMultiplier = getMovementMultiplier(balance.lastTransactionType)
                    const signedCartons =
                      movementMultiplier === 0
                        ? balance.currentCartons
                        : movementMultiplier * Math.abs(balance.currentCartons)
                    const signedPallets =
                      movementMultiplier === 0
                        ? balance.currentPallets
                        : movementMultiplier * Math.abs(balance.currentPallets)
                    const signedUnits =
                      movementMultiplier === 0
                        ? balance.currentUnits
                        : movementMultiplier * Math.abs(balance.currentUnits)
                    const movementLabel =
                      movementType === 'positive'
                        ? 'Inbound'
                        : movementType === 'negative'
                          ? 'Outbound'
                          : 'Flat'
                    const movementBadgeVariant =
                      movementType === 'positive'
                        ? ('success' as const)
                        : movementType === 'negative'
                          ? ('danger' as const)
                          : ('neutral' as const)

                    const sourceNumber =
                      balance.fulfillmentOrderNumber ?? balance.purchaseOrderNumber ?? null
                    const sourceHref = balance.fulfillmentOrderId
                      ? `/operations/fulfillment-orders/${balance.fulfillmentOrderId}`
                      : balance.purchaseOrderId
                        ? `/operations/purchase-orders/${balance.purchaseOrderId}`
                        : null
                    const sourceDisplay = sourceNumber ?? (sourceHref ? 'View' : '—')
                    const firstReceiveMeta = balance.receiveTransaction
                      ? `First receive: ${formatLedgerTimestamp(balance.receiveTransaction.transactionDate) ?? '—'} by ${balance.receiveTransaction.createdBy?.fullName ?? 'Unknown'}`
                      : null

                    return (
                      <tr key={balance.id} className="odd:bg-muted/20">
                        <td
                          className="px-3 py-2 text-sm font-semibold text-foreground whitespace-nowrap"
                          title={
                            [sourceNumber, firstReceiveMeta].filter(Boolean).join('\n') || undefined
                          }
                        >
                          {sourceHref ? (
                            <Link
                              href={sourceHref}
                              className="text-primary hover:underline"
                              prefetch={false}
                            >
                              {sourceDisplay}
                            </Link>
                          ) : (
                            sourceDisplay
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm font-medium text-foreground whitespace-nowrap">
                          {balance.warehouse.code || balance.warehouse.name || '—'}
                        </td>
                        <td className="px-3 py-2 text-sm font-semibold text-foreground whitespace-nowrap">
                          {balance.sku.skuCode}
                        </td>
                        <td
                          className="px-3 py-2 text-sm text-muted-foreground max-w-[16rem] truncate"
                          title={balance.sku.description || undefined}
                        >
                          {balance.sku.description || '—'}
                        </td>
                        <td
                          className="px-3 py-2 text-xs text-muted-foreground uppercase whitespace-nowrap max-w-[10rem] truncate"
                          title={balance.batchLot}
                        >
                          {balance.batchLot}
                        </td>
                        <td
                          className="px-3 py-2 text-sm text-muted-foreground whitespace-nowrap max-w-[10rem] truncate"
                          title={
                            [balance.lastTransactionReference, balance.lastTransactionId]
                              .filter(Boolean)
                              .join('\n') || undefined
                          }
                        >
                          {balance.lastTransactionId ? (
                            <Link
                              href={`/operations/transactions/${balance.lastTransactionId}`}
                              className="text-primary hover:underline"
                              prefetch={false}
                            >
                              {balance.lastTransactionReference ?? 'View'}
                            </Link>
                          ) : (
                            (balance.lastTransactionReference ?? '—')
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold text-primary whitespace-nowrap">
                          {signedCartons.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right text-sm whitespace-nowrap">
                          {signedPallets.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right text-sm whitespace-nowrap">
                          {signedUnits.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-sm whitespace-nowrap">
                          <Badge variant={movementBadgeVariant} className="uppercase">
                            {movementLabel}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-sm text-muted-foreground whitespace-nowrap">
                          {lastTransactionDisplay ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Totals bar - fixed at bottom outside scroll area */}
            <div className="border-t bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/60 flex-shrink-0">
              <div className="min-w-[1200px]">
                <div className="grid grid-cols-[repeat(11,minmax(0,1fr))] text-xs uppercase tracking-wide text-muted-foreground">
                  <div className="col-span-6 px-3 py-2 font-semibold text-left">Totals</div>
                  <div className="col-span-1 px-3 py-2 text-right font-semibold text-primary whitespace-nowrap">
                    {tableTotals.cartons.toLocaleString()}
                  </div>
                  <div className="col-span-1 px-3 py-2 text-right font-semibold whitespace-nowrap">
                    {tableTotals.pallets.toLocaleString()}
                  </div>
                  <div className="col-span-1 px-3 py-2 text-right font-semibold whitespace-nowrap">
                    {tableTotals.units.toLocaleString()}
                  </div>
                  <div className="col-span-2" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </PageContent>
    </PageContainer>
  )
}

export default InventoryPage
