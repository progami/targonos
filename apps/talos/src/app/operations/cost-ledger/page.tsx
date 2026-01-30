'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useSession } from '@/hooks/usePortalSession'
import { useRouter } from 'next/navigation'
import {
  DollarSign,
  BarChart3,
  Filter,
  Download,
  Truck,
  Box,
  Package,
} from '@/lib/lucide-icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card'
import { Button } from '@/components/ui/button'
import { PageLoading } from '@/components/ui/loading-spinner'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'react-hot-toast'
import type { CostLedgerBucketTotals, CostLedgerGroupResult } from '@targon/ledger'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'
import { usePageState } from '@/lib/store'

const baseFilterInputClass =
  'w-full rounded-md border border-muted px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary'

interface CostLedgerResponse {
  groups: CostLedgerGroupResult[]
  totals: CostLedgerBucketTotals
  groupBy: 'week' | 'month'
}

interface FilterState {
  warehouse: string
  startDate: string
  endDate: string
}

const defaultFilters: FilterState = {
  warehouse: '',
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  endDate: new Date().toISOString().split('T')[0],
}

const PAGE_KEY = '/operations/cost-ledger'

const defaultColumnFilters = {
  weekEnding: '',
  storageMin: '',
  storageMax: '',
  inboundMin: '',
  inboundMax: '',
  outboundMin: '',
  outboundMax: '',
  forwardingMin: '',
  forwardingMax: '',
  otherMin: '',
  otherMax: '',
  totalMin: '',
  totalMax: '',
}

export default function CostLedgerPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [_loading, setLoading] = useState(true)
  const [ledgerData, setLedgerData] = useState<CostLedgerGroupResult[]>([])
  const [totals, setTotals] = useState<CostLedgerBucketTotals | null>(null)
  const [filters] = useState<FilterState>(defaultFilters)
  const [exporting, setExporting] = useState(false)

  // Use persisted page state for column filters
  const pageState = usePageState(PAGE_KEY)
  const [hydrated, setHydrated] = useState(false)

  // Initialize column filters from persisted state after hydration
  const [columnFilters, setColumnFilters] = useState(defaultColumnFilters)

  useEffect(() => {
    setHydrated(true)
    // Restore column filters from persisted state
    const persisted = pageState.custom?.columnFilters as typeof defaultColumnFilters | undefined
    if (persisted) {
      setColumnFilters(prev => ({ ...prev, ...persisted }))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist column filters when they change (after hydration)
  useEffect(() => {
    if (hydrated) {
      pageState.setCustom('columnFilters', columnFilters)
    }
  }, [columnFilters, hydrated]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      redirectToPortal('/login', `${window.location.origin}${withBasePath('/operations/cost-ledger')}`)
      return
    }
    if (!['staff', 'admin'].includes(session.user.role)) {
      router.push('/dashboard')
      return
    }
  }, [session, status, router])

  const fetchCostLedger = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        startDate: filters.startDate,
        endDate: filters.endDate,
        groupBy: 'week',
      })
      if (filters.warehouse) {
        params.append('warehouseCode', filters.warehouse)
      }

      const response = await fetch(`/api/finance/cost-ledger?${params}`)
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Unknown error' }))
        toast.error(
          `Failed to load cost ledger: ${errorData.error || response.statusText}`,
        )
        return
      }

      const data: CostLedgerResponse = await response.json()
      setLedgerData(data.groups ?? [])
      setTotals(data.totals ?? null)
    } catch (_error) {
      toast.error('Failed to load cost ledger')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchCostLedger()
    }
  }, [fetchCostLedger, status])

  const renderNumericFilter = (
    label: string,
    minKey: keyof typeof columnFilters,
    maxKey: keyof typeof columnFilters,
  ) => (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Filter ${label}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-muted/30 hover:text-primary"
        >
          <Filter className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">
            {label} range
          </span>
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => setColumnFilters(prev => ({ ...prev, [minKey]: '', [maxKey]: '' }))}
          >
            Clear
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={columnFilters[minKey] as string}
            onChange={(event) =>
              setColumnFilters(prev => ({ ...prev, [minKey]: event.target.value }))
            }
            placeholder="Min"
            className={`${baseFilterInputClass} text-right`}
          />
          <input
            type="number"
            inputMode="numeric"
            value={columnFilters[maxKey] as string}
            onChange={(event) =>
              setColumnFilters(prev => ({ ...prev, [maxKey]: event.target.value }))
            }
            placeholder="Max"
            className={`${baseFilterInputClass} text-right`}
          />
        </div>
      </PopoverContent>
    </Popover>
  )

  const filteredLedgerData = useMemo(() => {
    const parseNumber = (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return null
      const parsed = Number(trimmed)
      return Number.isNaN(parsed) ? null : parsed
    }

    const storageMin = parseNumber(columnFilters.storageMin)
    const storageMax = parseNumber(columnFilters.storageMax)
    const inboundMin = parseNumber(columnFilters.inboundMin)
    const inboundMax = parseNumber(columnFilters.inboundMax)
    const outboundMin = parseNumber(columnFilters.outboundMin)
    const outboundMax = parseNumber(columnFilters.outboundMax)
    const forwardingMin = parseNumber(columnFilters.forwardingMin)
    const forwardingMax = parseNumber(columnFilters.forwardingMax)
    const otherMin = parseNumber(columnFilters.otherMin)
    const otherMax = parseNumber(columnFilters.otherMax)
    const totalMin = parseNumber(columnFilters.totalMin)
    const totalMax = parseNumber(columnFilters.totalMax)

    const matchesRange = (
      value: number | null | undefined,
      min: number | null,
      max: number | null,
    ) => {
      const actual = value ?? 0
      if (min !== null && actual < min) return false
      if (max !== null && actual > max) return false
      return true
    }

    return ledgerData.filter(group => {
      const weekEndingLabel = format(new Date(group.rangeEnd), 'PP')
      if (
        columnFilters.weekEnding &&
        !weekEndingLabel.toLowerCase().includes(columnFilters.weekEnding.toLowerCase())
      ) {
        return false
      }

      if (
        !matchesRange(group.costs.storage, storageMin, storageMax) ||
        !matchesRange(group.costs.inbound, inboundMin, inboundMax) ||
        !matchesRange(group.costs.outbound, outboundMin, outboundMax) ||
        !matchesRange(group.costs.forwarding, forwardingMin, forwardingMax) ||
        !matchesRange(group.costs.other, otherMin, otherMax) ||
        !matchesRange(group.costs.total, totalMin, totalMax)
      ) {
        return false
      }

      return true
    })
  }, [columnFilters, ledgerData])

  const handleExport = useCallback(async () => {
    try {
      setExporting(true)
      const params = new URLSearchParams({
        startDate: filters.startDate,
        endDate: filters.endDate,
        groupBy: 'week',
      })
      if (filters.warehouse) {
        params.append('warehouseCode', filters.warehouse)
      }

      const response = await fetch(`/api/finance/export/cost-ledger?${params}`)
      if (!response.ok) {
        toast.error('Failed to export cost ledger')
        return
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `cost-ledger-${filters.startDate}-to-${filters.endDate}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (_error) {
      toast.error('Failed to export cost ledger')
    } finally {
      setExporting(false)
    }
  }, [filters])

  const summaryCards = useMemo(() => {
    if (!totals) return []

    return [
      {
        title: 'Total',
        value: formatCurrency(totals.total ?? 0),
        subtitle: 'All cost buckets',
        icon: DollarSign,
        variant: 'default' as const,
      },
      {
        title: 'Inbound',
        value: formatCurrency(totals.inbound ?? 0),
        subtitle: 'Inbound handling',
        icon: Package,
        variant: 'default' as const,
      },
      {
        title: 'Outbound',
        value: formatCurrency(totals.outbound ?? 0),
        subtitle: 'Outbound handling',
        icon: Truck,
        variant: 'default' as const,
      },
      {
        title: 'Storage',
        value: formatCurrency(totals.storage ?? 0),
        subtitle: 'Storage fees',
        icon: Box,
        variant: 'default' as const,
      },
    ]
  }, [totals])

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
        title="Cost Ledger"
        description="Operations"
        icon={BarChart3}
        actions={
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={handleExport}
            disabled={exporting}
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        }
      />
      <PageContent>
        <div className="flex flex-col gap-6">
          <StatsCardGrid cols={4}>
            {summaryCards.map(card => (
              <StatsCard key={card.title} {...card} />
            ))}
          </StatsCardGrid>

          <div className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="h-4 w-4" />
                <span>Showing {filteredLedgerData.length} weeks of cost activity</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full table-auto text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                    <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left">
                      <div className="flex items-center justify-between gap-1">
                        <span>Week Ending</span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label="Filter week ending"
                              className={cn(
                                'inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors',
                                columnFilters.weekEnding
                                  ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
                                  : 'hover:bg-muted/30 hover:text-primary',
                              )}
                            >
                              <Filter className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-64 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">
                                Week ending filter
                              </span>
                              <button
                                type="button"
                                className="text-xs font-medium text-primary hover:underline"
                                onClick={() =>
                                  setColumnFilters(prev => ({ ...prev, weekEnding: '' }))
                                }
                              >
                                Clear
                              </button>
                            </div>
                            <input
                              type="text"
                              value={columnFilters.weekEnding}
                              onChange={event =>
                                setColumnFilters(prev => ({
                                  ...prev,
                                  weekEnding: event.target.value,
                                }))
                              }
                              placeholder="Search week ending"
                              className={baseFilterInputClass}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </th>
                    <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span>Inbound</span>
                        {renderNumericFilter('Inbound', 'inboundMin', 'inboundMax')}
                      </div>
                    </th>
                    <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span>Outbound</span>
                        {renderNumericFilter('Outbound', 'outboundMin', 'outboundMax')}
                      </div>
                    </th>
                    <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span>Forwarding</span>
                        {renderNumericFilter(
                          'Forwarding',
                          'forwardingMin',
                          'forwardingMax',
                        )}
                      </div>
                    </th>
                    <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span>Storage</span>
                        {renderNumericFilter('Storage', 'storageMin', 'storageMax')}
                      </div>
                    </th>
                    <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span>Other</span>
                        {renderNumericFilter('Other', 'otherMin', 'otherMax')}
                      </div>
                    </th>
                    <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span>Total</span>
                        {renderNumericFilter('Total', 'totalMin', 'totalMax')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLedgerData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center">
                        <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                          <Package className="h-10 w-10 text-muted-foreground/60" />
                          <h3 className="text-sm font-semibold text-foreground">
                            No results
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Adjust your filters to see cost ledger activity.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredLedgerData.map(group => (
                      <tr key={group.rangeEnd} className="border-t">
                        <td className="px-3 py-2 font-medium text-foreground">
                          {format(new Date(group.rangeEnd), 'PP')}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCurrency(group.costs.inbound ?? 0)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCurrency(group.costs.outbound ?? 0)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCurrency(group.costs.forwarding ?? 0)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCurrency(group.costs.storage ?? 0)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCurrency(group.costs.other ?? 0)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                          {formatCurrency(group.costs.total ?? 0)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </PageContent>
    </PageContainer>
  )
}
