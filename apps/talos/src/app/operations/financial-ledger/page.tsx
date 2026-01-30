'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '@/hooks/usePortalSession'
import { useRouter } from 'next/navigation'
import { PageContainer, PageContent, PageHeaderSection } from '@/components/layout/page-container'
import { PageLoading } from '@/components/ui/loading-spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from 'react-hot-toast'
import { formatCurrency } from '@/lib/utils'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'
import { BarChart3, Filter } from '@/lib/lucide-icons'

type FinancialLedgerEntryRow = {
  id: string
  category: string
  costName: string
  warehouseCode: string
  warehouseName: string
  skuCode: string | null
  skuDescription: string | null
  batchLot: string | null
  amount: number
  currency: string
  effectiveAt: string
  createdByName: string
}

type FinancialLedgerResponse = {
  data: FinancialLedgerEntryRow[]
  summary: {
    totals: Record<string, number>
    total: number
  }
}

type WarehouseOption = {
  code: string
  name: string
}

const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const defaultEndDate = new Date().toISOString().slice(0, 10)

export default function FinancialLedgerPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<FinancialLedgerEntryRow[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])

  const [filters, setFilters] = useState({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    warehouseCode: '',
    category: '',
  })

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      redirectToPortal('/login', `${window.location.origin}${withBasePath('/operations/financial-ledger')}`)
      return
    }
    if (!['staff', 'admin'].includes(session.user.role)) {
      router.push('/dashboard')
      return
    }
  }, [session, status, router])

  const loadWarehouses = useCallback(async () => {
    try {
      const response = await fetch('/api/warehouses')
      if (!response.ok) return
      const payload: unknown = await response.json().catch(() => null)
      const listCandidate: unknown =
        payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload
          ? (payload as { data?: unknown }).data
          : payload

      if (!Array.isArray(listCandidate)) return
      const parsed = listCandidate
        .map((item): WarehouseOption | null => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null
          const record = item as Record<string, unknown>
          const code = record.code
          const name = record.name
          if (typeof code !== 'string' || typeof name !== 'string') return null
          if (!code.trim() || !name.trim()) return null
          return { code: code.trim(), name: name.trim() }
        })
        .filter((value): value is WarehouseOption => value !== null)

      setWarehouses(parsed)
    } catch {
      // Non-blocking
    }
  }, [])

  const fetchLedger = useCallback(async () => {
    try {
      setLoading(true)

      const query = new URLSearchParams()
      query.set('startDate', filters.startDate)
      query.set('endDate', filters.endDate)
      if (filters.warehouseCode.trim()) query.set('warehouseCode', filters.warehouseCode.trim())
      if (filters.category.trim()) query.set('category', filters.category.trim())
      query.set('limit', '500')

      const response = await fetch(`/api/finance/financial-ledger?${query.toString()}`)
      if (!response.ok) {
        toast.error('Failed to load financial ledger')
        setEntries([])
        return
      }

      const payload = (await response.json().catch(() => null)) as FinancialLedgerResponse | null
      if (!payload) {
        setEntries([])
        return
      }

      setEntries(Array.isArray(payload.data) ? payload.data : [])
    } catch {
      toast.error('Failed to load financial ledger')
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    if (status === 'authenticated') {
      void loadWarehouses()
      void fetchLedger()
    }
  }, [fetchLedger, loadWarehouses, status])

  const categories = useMemo(() => {
    const set = new Set(entries.map(row => row.category).filter(Boolean))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [entries])

  if (status === 'loading') {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeaderSection title="Financial Ledger" description="Operations" icon={BarChart3} />
      <PageContent className="flex-1 overflow-hidden px-4 py-6 sm:px-6 lg:px-8 flex flex-col">
        <div className="flex flex-col gap-6 flex-1 min-h-0">
          <div className="flex items-center justify-between gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-4" align="start">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">Start</div>
                      <Input
                        type="date"
                        value={filters.startDate}
                        onChange={event => setFilters(prev => ({ ...prev, startDate: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">End</div>
                      <Input
                        type="date"
                        value={filters.endDate}
                        onChange={event => setFilters(prev => ({ ...prev, endDate: event.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Warehouse</div>
                    <select
                      value={filters.warehouseCode}
                      onChange={event => setFilters(prev => ({ ...prev, warehouseCode: event.target.value }))}
                      className="w-full h-10 px-3 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                    >
                      <option value="">All warehouses</option>
                      {warehouses.map(w => (
                        <option key={w.code} value={w.code}>
                          {w.code} — {w.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Category</div>
                    <select
                      value={filters.category}
                      onChange={event => setFilters(prev => ({ ...prev, category: event.target.value }))}
                      className="w-full h-10 px-3 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                    >
                      <option value="">All categories</option>
                      {categories.map(category => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button type="button" onClick={() => void fetchLedger()} disabled={loading}>
                    Apply
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex min-h-0 flex-col rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-x-auto flex-1">
            <div className="relative min-h-0 overflow-y-auto scrollbar-gutter-stable flex-1">
              <table className="w-full min-w-[1200px] table-auto text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                    <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs w-36">Date</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs w-28">Category</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs w-56">Cost</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs w-52">Warehouse</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs w-44">SKU / Batch</th>
                    <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs w-32">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(row => (
                    <tr key={row.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                      <td className="px-3 py-2 whitespace-nowrap">{row.effectiveAt.slice(0, 10)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.category}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{row.costName}</div>
                        <div className="text-xs text-muted-foreground">{row.createdByName}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{row.warehouseCode}</div>
                        <div className="text-xs text-muted-foreground">{row.warehouseName}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {row.skuCode ?? '—'}
                          {row.batchLot ? ` — ${row.batchLot}` : ''}
                        </div>
                        {row.skuDescription && (
                          <div className="text-xs text-muted-foreground">{row.skuDescription}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(row.amount)}</td>
                    </tr>
                  ))}
                  {!loading && entries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        No financial ledger entries found for the selected filters.
                      </td>
                    </tr>
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

