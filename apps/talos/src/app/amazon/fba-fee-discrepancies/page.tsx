'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { useSession } from '@/hooks/usePortalSession'
import {
  type AlertStatus,
  type ApiSkuRow,
  computeComparison,
  getComparisonStatusLabel,
} from '@/lib/amazon/fba-fee-discrepancies'
import { redirectToPortal } from '@/lib/portal'
import type { TenantCode } from '@/lib/tenant/constants'
import { formatDimensionTripletDisplayFromCm, formatWeightDisplayFromKg, getDefaultUnitSystem } from '@/lib/measurements'
import { usePageState } from '@/lib/store/page-state'
import { withBasePath } from '@/lib/utils/base-path'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer, PageContent, PageHeaderSection } from '@/components/layout/page-container'
import { AmazonWorkspaceSwitcher } from '@/components/amazon/amazon-workspace-switcher'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Loader2,
  Search,
  XCircle,
} from '@/lib/lucide-icons'

const PAGE_KEY = '/amazon/fba-fee-discrepancies'
const SKUS_PER_PAGE = 10

const ALLOWED_ROLES = ['admin', 'staff'] as const
function formatFee(value: unknown, currency: string) {
  if (value === null || value === undefined || value === '') return '—'
  let amount = Number.NaN
  if (typeof value === 'number') {
    amount = value
  } else if (typeof value === 'string') {
    amount = Number.parseFloat(value)
  } else if (typeof value === 'object' && value !== null && 'toString' in value) {
    amount = Number.parseFloat(String(value))
  }
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

function StatusIcon({ status }: { status: AlertStatus }) {
  switch (status) {
    case 'MATCH':
      return <CheckCircle2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
    case 'MISMATCH':
      return <XCircle className="h-4 w-4 text-slate-600 dark:text-slate-400" />
    case 'NO_ASIN':
    case 'MISSING_REFERENCE':
      return <AlertTriangle className="h-4 w-4 text-slate-500 dark:text-slate-400" />
    case 'ERROR':
      return <XCircle className="h-4 w-4 text-slate-400 dark:text-slate-500" />
    default:
      return <Clock className="h-4 w-4 text-slate-300 dark:text-slate-600" />
  }
}

export default function AmazonFbaFeeDiscrepanciesPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const pageState = usePageState(PAGE_KEY)
  const tenantCode: TenantCode = session?.user?.region ?? 'US'
  const unitSystem = getDefaultUnitSystem(tenantCode)

  const [loading, setLoading] = useState(false)
  const [skus, setSkus] = useState<ApiSkuRow[]>([])
  const [currencyCode, setCurrencyCode] = useState<string>('USD')
  const [totalRows, setTotalRows] = useState(0)
  const search = pageState.search ?? ''
  const setSearch = pageState.setSearch
  const statusFilter = (pageState.custom?.statusFilter as AlertStatus | 'ALL') ?? 'ALL'
  const setStatusFilter = (value: AlertStatus | 'ALL') => pageState.setCustom('statusFilter', value)
  const currentPage = pageState.pagination?.page ?? 1
  const setCurrentPage = (page: number) => pageState.setPagination(page, SKUS_PER_PAGE)

  const isAllowed = useMemo(() => {
    if (!session) return false
    type AllowedRole = (typeof ALLOWED_ROLES)[number]
    return ALLOWED_ROLES.includes(session.user.role as AllowedRole)
  }, [session])

  useEffect(() => {
    if (status === 'loading') return

    if (!session) {
      redirectToPortal('/login', `${window.location.origin}${withBasePath('/amazon/fba-fee-discrepancies')}`)
      return
    }

    if (!isAllowed) {
      toast.error('You are not authorised to view this page')
      router.push('/dashboard')
    }
  }, [isAllowed, router, session, status])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      params.set('page', String(currentPage))
      params.set('pageSize', String(SKUS_PER_PAGE))

      const response = await fetch(withBasePath(`/api/amazon/fba-fee-discrepancies?${params.toString()}`), {
        credentials: 'include',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to load fee discrepancies')
      }

      const payload = await response.json()
      setCurrencyCode(payload?.currencyCode ?? 'USD')
      setSkus(Array.isArray(payload?.skus) ? payload.skus : [])
      setTotalRows(typeof payload?.total === 'number' ? payload.total : 0)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load fee discrepancies')
      setSkus([])
      setTotalRows(0)
    } finally {
      setLoading(false)
    }
  }, [currentPage, search])

  useEffect(() => {
    if (status !== 'loading' && session && isAllowed) {
      void fetchRows()
    }
  }, [fetchRows, isAllowed, session, status])

  useEffect(() => {
    pageState.setPagination(1, SKUS_PER_PAGE)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset on search change
  }, [search])

  useEffect(() => {
    pageState.setPagination(1, SKUS_PER_PAGE)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset on filter change
  }, [statusFilter])

  const computedRows = useMemo(() => {
    return skus.map(sku => ({
      sku,
      comparison: computeComparison(sku, tenantCode),
    }))
  }, [skus, tenantCode])

  const pageRows = useMemo(() => {
    if (statusFilter === 'ALL') return computedRows
    return computedRows.filter(row => row.comparison.status === statusFilter)
  }, [computedRows, statusFilter])
  const totalPages = Math.max(1, Math.ceil(totalRows / SKUS_PER_PAGE))

  const summary = useMemo(() => {
    const counts = { mismatch: 0, match: 0, warning: 0, pending: 0 }
    for (const row of computedRows) {
      const s = row.comparison.status
      if (s === 'MISMATCH') counts.mismatch += 1
      else if (s === 'MATCH') counts.match += 1
      else if (s === 'NO_ASIN' || s === 'MISSING_REFERENCE' || s === 'ERROR') counts.warning += 1
      else counts.pending += 1
    }
    return counts
  }, [computedRows])

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
          <span className="text-sm text-slate-500">Loading...</span>
        </div>
      </div>
    )
  }

  if (!session || !isAllowed) return null

  return (
    <PageContainer>
      <PageHeaderSection
        title="FBA Fee Discrepancies"
        description="Amazon"
        icon={DollarSign}
        backHref="/dashboard"
        backLabel="Dashboard"
        metadata={<AmazonWorkspaceSwitcher currentHref="/amazon/fba-fee-discrepancies" />}
      />

      <PageContent className="space-y-6">
        <div className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-hidden">
          {/* Header with search and filter */}
          <div className="flex flex-col gap-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search SKU or ASIN..."
                  className="w-64 pl-9 h-9 text-sm"
                />
              </div>
              <select
                value={statusFilter}
                onChange={event => setStatusFilter(event.target.value as AlertStatus | 'ALL')}
                className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:focus:ring-cyan-900"
              >
                <option value="ALL">All statuses</option>
                <option value="MISMATCH">Any discrepancy</option>
                <option value="MATCH">Correct</option>
                <option value="MISSING_REFERENCE">No ref</option>
                <option value="NO_ASIN">No ASIN</option>
                <option value="ERROR">Error</option>
                <option value="UNKNOWN">Pending</option>
              </select>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {pageRows.length} shown · {totalRows} total SKUs · Page {currentPage} of {totalPages}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300">
                {summary.mismatch} discrepancies
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
                {summary.match} matches
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300">
                {summary.warning} warnings
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {summary.pending} pending
              </span>
            </div>
          </div>

          {/* Main comparison table */}
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : pageRows.length === 0 ? (
            <div className="px-6 py-16">
              <EmptyState title="No SKUs found" description="Try adjusting your search, page, or filter." icon={DollarSign} />
            </div>
          ) : (
            <div className="overflow-x-auto p-4">
              <table className="min-w-[900px] w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-3 sticky left-0 bg-slate-50/80 dark:bg-slate-900/80 z-10">Attribute</th>
                    {pageRows.map(row => (
                      <th key={row.sku.id} className="px-4 py-3 text-center whitespace-nowrap min-w-[140px]">
                        <Link 
                          href={`/config/products?editSkuId=${encodeURIComponent(row.sku.id)}`}
                          className="text-slate-700 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                        >
                          {row.sku.skuCode}
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {/* Reference section header */}
                  <tr>
                    <td
                      colSpan={pageRows.length + 1}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-cyan-600 dark:bg-cyan-700 text-white"
                    >
                      Reference Data
                    </td>
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">ASIN</td>
                    {pageRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center font-mono text-xs text-slate-600 dark:text-slate-400">
                        {row.sku.asin ?? '—'}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Package Dimensions</td>
                    {pageRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatDimensionTripletDisplayFromCm(row.comparison.reference.triplet, unitSystem)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Package Weight</td>
                    {pageRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatWeightDisplayFromKg(row.comparison.reference.shipping.unitWeightKg, unitSystem, 3)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Dimensional Weight</td>
                    {pageRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatWeightDisplayFromKg(row.comparison.reference.shipping.dimensionalWeightKg, unitSystem, 3)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Shipping Weight</td>
                    {pageRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatWeightDisplayFromKg(row.comparison.reference.shipping.shippingWeightKg, unitSystem, 2)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Size Tier</td>
                    {pageRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center text-slate-700 dark:text-slate-300 text-xs">
                        {row.comparison.reference.sizeTier ?? '—'}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Expected Fee</td>
                    {pageRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 font-medium">
                        {formatFee(row.comparison.reference.expectedFee, currencyCode)}
                      </td>
                    ))}
                  </tr>

                  {/* Amazon section header */}
                  <tr>
                    <td
                      colSpan={pageRows.length + 1}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-slate-600 dark:bg-slate-700 text-white"
                    >
                      Amazon Data
                    </td>
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Listing Price</td>
                    {pageRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatFee(row.sku.amazonListingPrice, currencyCode)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Package Dimensions</td>
                    {pageRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatDimensionTripletDisplayFromCm(row.comparison.amazon.triplet, unitSystem)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Package Weight</td>
                    {pageRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatWeightDisplayFromKg(row.comparison.amazon.shipping.unitWeightKg, unitSystem, 3)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Dimensional Weight</td>
                    {pageRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatWeightDisplayFromKg(row.comparison.amazon.shipping.dimensionalWeightKg, unitSystem, 3)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Shipping Weight</td>
                    {pageRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatWeightDisplayFromKg(row.comparison.amazon.shipping.shippingWeightKg, unitSystem, 2)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Size Tier</td>
                    {pageRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center text-slate-700 dark:text-slate-300 text-xs">
                        {row.comparison.amazon.sizeTier ?? '—'}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">FBA Fee</td>
                    {pageRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 font-medium">
                        {formatFee(row.comparison.amazon.fee, currencyCode)}
                      </td>
                    ))}
                  </tr>

                  {/* Comparison section header */}
                  <tr>
                    <td
                      colSpan={pageRows.length + 1}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                    >
                      Comparison
                    </td>
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Fee Difference</td>
                    {pageRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {row.comparison.feeDifference === null
                          ? '—'
                          : formatFee(row.comparison.feeDifference, currencyCode)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Status</td>
                    {pageRows.map(row => {
                      const s = row.comparison.status
                      const cellStyle =
                        s === 'MATCH'
                          ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                          : s === 'MISMATCH'
                            ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                            : s === 'NO_ASIN' || s === 'MISSING_REFERENCE'
                              ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'

                      const label = getComparisonStatusLabel(row.comparison)

                      return (
                        <td key={row.sku.id} className={`px-4 py-2 text-center text-xs font-medium ${cellStyle}`}>
                          <span className="inline-flex items-center gap-1.5">
                            <StatusIcon status={s} />
                            {label}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Showing {((currentPage - 1) * SKUS_PER_PAGE) + 1}–{Math.min((currentPage - 1) * SKUS_PER_PAGE + pageRows.length, totalRows)} of {totalRows} SKUs
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="h-8 px-3"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="h-8 px-3"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400">
          Currency: {currencyCode} · {pageRows.length} SKUs loaded on this page
        </p>
      </PageContent>
    </PageContainer>
  )
}
