'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { useSession } from '@/hooks/usePortalSession'
import { redirectToPortal } from '@/lib/portal'
import { calculateSizeTier } from '@/lib/amazon/fees'
import { resolveDimensionTripletCm } from '@/lib/sku-dimensions'
import { usePageState } from '@/lib/store/page-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer, PageContent, PageHeaderSection } from '@/components/layout/page-container'
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card'
import {
  AlertTriangle,
  AlertCircle,
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

type AlertStatus =
  | 'UNKNOWN'
  | 'MATCH'
  | 'MISMATCH'
  | 'NO_ASIN'
  | 'MISSING_REFERENCE'
  | 'ERROR'

type ApiSkuRow = {
  id: string
  skuCode: string
  description: string
  asin: string | null
  fbaFulfillmentFee: number | string | null
  amazonFbaFulfillmentFee: number | string | null
  amazonListingPrice: number | string | null
  amazonSizeTier: string | null
  referenceItemPackageDimensionsCm: string | null
  referenceItemPackageSide1Cm: number | string | null
  referenceItemPackageSide2Cm: number | string | null
  referenceItemPackageSide3Cm: number | string | null
  referenceItemPackageWeightKg: number | string | null
  amazonItemPackageDimensionsCm: string | null
  amazonItemPackageSide1Cm: number | string | null
  amazonItemPackageSide2Cm: number | string | null
  amazonItemPackageSide3Cm: number | string | null
  amazonItemPackageWeightKg: number | string | null
  itemDimensionsCm: string | null
  itemSide1Cm: number | string | null
  itemSide2Cm: number | string | null
  itemSide3Cm: number | string | null
  itemWeightKg: number | string | null
  latestBatchCode?: string | null
}

const ALLOWED_ROLES = ['admin', 'staff'] as const

type DimensionTriplet = { side1Cm: number; side2Cm: number; side3Cm: number }

type ShippingWeights = {
  unitWeightLb: number | null
  dimensionalWeightLb: number | null
  shippingWeightLb: number | null
}

type Comparison = {
  status: AlertStatus
  reference: {
    triplet: DimensionTriplet | null
    shipping: ShippingWeights
    sizeTier: string | null
    expectedFee: number | null
    missingFields: string[]
  }
  amazon: {
    triplet: DimensionTriplet | null
    shipping: ShippingWeights
    sizeTier: string | null
    fee: number | null
    missingFields: string[]
  }
  feeDifference: number | null
}

function stripTrailingZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value
}

function formatNumber(value: number, decimals: number): string {
  return stripTrailingZeros(value.toFixed(decimals))
}

function parseDecimalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    const parsed = Number.parseFloat(String(value))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function formatFee(value: number | string | null | undefined, currency: string) {
  if (value === null || value === undefined || value === '') return '—'
  const amount = typeof value === 'number' ? value : Number.parseFloat(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

function usesMinWidthHeight(sizeTier: string | null): boolean {
  if (!sizeTier) return false
  if (sizeTier === 'Small Bulky') return true
  if (sizeTier === 'Large Bulky') return true
  if (sizeTier === 'Overmax 0 to 150 lb') return true
  if (sizeTier.startsWith('Extra-Large')) return true
  return false
}

function computeDimensionalWeightLbWithMinWidthHeight(triplet: DimensionTriplet, applyMinWidthHeightIn: boolean): number {
  const dimsIn = [triplet.side1Cm / 2.54, triplet.side2Cm / 2.54, triplet.side3Cm / 2.54].sort((a, b) => b - a)
  const longestIn = dimsIn[0]
  let medianIn = dimsIn[1]
  let shortestIn = dimsIn[2]

  if (applyMinWidthHeightIn) {
    medianIn = Math.max(medianIn, 2)
    shortestIn = Math.max(shortestIn, 2)
  }

  const volumeIn3 = longestIn * medianIn * shortestIn
  return volumeIn3 / 139
}

function computeShippingWeights(
  triplet: DimensionTriplet | null,
  unitWeightKg: number | null,
  sizeTier: string | null
): ShippingWeights {
  const unitWeightLb = unitWeightKg === null ? null : unitWeightKg * 2.20462
  const dimensionalWeightLb =
    triplet === null ? null : computeDimensionalWeightLbWithMinWidthHeight(triplet, usesMinWidthHeight(sizeTier))

  let chargeableWeightLb: number | null = null
  let usesUnitOnly = false
  if (sizeTier === 'Small Standard-Size') usesUnitOnly = true
  if (sizeTier === 'Extra-Large 150+ lb') usesUnitOnly = true

  if (usesUnitOnly) {
    if (unitWeightLb !== null) chargeableWeightLb = unitWeightLb
  } else if (unitWeightLb !== null && dimensionalWeightLb !== null) {
    chargeableWeightLb = Math.max(unitWeightLb, dimensionalWeightLb)
  } else if (unitWeightLb !== null) {
    chargeableWeightLb = unitWeightLb
  } else if (dimensionalWeightLb !== null) {
    chargeableWeightLb = dimensionalWeightLb
  }

  if (chargeableWeightLb === null) {
    return { unitWeightLb, dimensionalWeightLb, shippingWeightLb: null }
  }

  let roundedWeightLb = chargeableWeightLb
  if (chargeableWeightLb < 1) {
    const ounces = chargeableWeightLb * 16
    const roundedOunces = Math.ceil(ounces)
    roundedWeightLb = roundedOunces / 16
  } else {
    let roundToWholePounds = false
    if (sizeTier === 'Small Bulky') roundToWholePounds = true
    if (sizeTier === 'Large Bulky') roundToWholePounds = true
    if (sizeTier === 'Extra-Large 150+ lb') roundToWholePounds = true
    if (sizeTier === 'Overmax 0 to 150 lb') roundToWholePounds = true
    if (sizeTier && sizeTier.startsWith('Extra-Large')) roundToWholePounds = true

    if (roundToWholePounds) {
      roundedWeightLb = Math.ceil(chargeableWeightLb)
    } else {
      const quarterPounds = 0.25
      const roundedSteps = Math.ceil(chargeableWeightLb / quarterPounds)
      roundedWeightLb = roundedSteps * quarterPounds
    }
  }

  return { unitWeightLb, dimensionalWeightLb, shippingWeightLb: roundedWeightLb }
}

function formatDimensionsIn(triplet: DimensionTriplet | null): string {
  if (!triplet) return '—'
  const s1 = formatNumber(triplet.side1Cm / 2.54, 2)
  const s2 = formatNumber(triplet.side2Cm / 2.54, 2)
  const s3 = formatNumber(triplet.side3Cm / 2.54, 2)
  return `${s1} × ${s2} × ${s3} in`
}

function formatWeightLb(weightLb: number | null, decimals: number): string {
  if (weightLb === null) return '—'
  if (weightLb < 1) {
    return `${formatNumber(weightLb * 16, decimals)} oz`
  }
  return `${formatNumber(weightLb, decimals)} lb`
}

function computeComparison(row: ApiSkuRow): Comparison {
  const referenceTriplet = resolveDimensionTripletCm({
    side1Cm: row.referenceItemPackageSide1Cm,
    side2Cm: row.referenceItemPackageSide2Cm,
    side3Cm: row.referenceItemPackageSide3Cm,
    legacy: row.referenceItemPackageDimensionsCm,
  })
  const referenceWeightKg = parseDecimalNumber(row.referenceItemPackageWeightKg)
  const referenceSizeTier =
    referenceTriplet && referenceWeightKg !== null
      ? calculateSizeTier(
          referenceTriplet.side1Cm,
          referenceTriplet.side2Cm,
          referenceTriplet.side3Cm,
          referenceWeightKg
        )
      : null
  const referenceShipping = computeShippingWeights(referenceTriplet, referenceWeightKg, referenceSizeTier)

  const amazonTriplet = resolveDimensionTripletCm({
    side1Cm: row.amazonItemPackageSide1Cm,
    side2Cm: row.amazonItemPackageSide2Cm,
    side3Cm: row.amazonItemPackageSide3Cm,
    legacy: row.amazonItemPackageDimensionsCm,
  })
  const amazonWeightKg = parseDecimalNumber(row.amazonItemPackageWeightKg)
  let amazonSizeTier: string | null = null
  if (typeof row.amazonSizeTier === 'string') {
    const trimmed = row.amazonSizeTier.trim()
    if (trimmed) amazonSizeTier = trimmed
  }
  const amazonShipping = computeShippingWeights(amazonTriplet, amazonWeightKg, amazonSizeTier)

  const expectedFee = parseDecimalNumber(row.fbaFulfillmentFee)
  const amazonFee = parseDecimalNumber(row.amazonFbaFulfillmentFee)
  const feeDifference =
    expectedFee === null || amazonFee === null ? null : amazonFee - expectedFee

  const referenceMissingFields: string[] = []
  if (expectedFee === null) referenceMissingFields.push('Reference FBA fulfillment fee')
  if (referenceTriplet === null) referenceMissingFields.push('Item package dimensions (cm)')
  if (referenceWeightKg === null) referenceMissingFields.push('Item package weight (kg)')

  const amazonMissingFields: string[] = []
  if (amazonFee === null) amazonMissingFields.push('Amazon FBA fulfillment fee')
  if (amazonSizeTier === null) amazonMissingFields.push('Amazon size tier')
  if (amazonTriplet === null) amazonMissingFields.push('Amazon item package dimensions (cm)')
  if (amazonWeightKg === null) amazonMissingFields.push('Amazon item package weight (kg)')

  let status: AlertStatus = 'UNKNOWN'
  if (!row.asin) {
    status = 'NO_ASIN'
  } else if (referenceMissingFields.length > 0) {
    status = 'MISSING_REFERENCE'
  } else if (amazonFee === null) {
    status = 'ERROR'
  } else {
    const expectedRounded = expectedFee === null ? null : Number(expectedFee.toFixed(2))
    const amazonRounded = amazonFee === null ? null : Number(amazonFee.toFixed(2))
    if (expectedRounded !== null && amazonRounded !== null && expectedRounded === amazonRounded) {
      status = 'MATCH'
    } else if (expectedRounded !== null && amazonRounded !== null) {
      status = 'MISMATCH'
    }
  }

  return {
    status,
    reference: {
      triplet: referenceTriplet,
      shipping: referenceShipping,
      sizeTier: referenceSizeTier,
      expectedFee,
      missingFields: referenceMissingFields,
    },
    amazon: {
      triplet: amazonTriplet,
      shipping: amazonShipping,
      sizeTier: amazonSizeTier,
      fee: amazonFee,
      missingFields: amazonMissingFields,
    },
    feeDifference,
  }
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

  const [loading, setLoading] = useState(false)
  const [skus, setSkus] = useState<ApiSkuRow[]>([])
  const [currencyCode, setCurrencyCode] = useState<string>('USD')
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
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
      redirectToPortal('/login', `${window.location.origin}${basePath}/amazon/fba-fee-discrepancies`)
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

      const response = await fetch(`/api/amazon/fba-fee-discrepancies?${params.toString()}`, {
        credentials: 'include',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to load fee discrepancies')
      }

      const payload = await response.json()
      setCurrencyCode(payload?.currencyCode ?? 'USD')
      setSkus(Array.isArray(payload?.skus) ? payload.skus : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load fee discrepancies')
      setSkus([])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    if (status !== 'loading' && session && isAllowed) {
      void fetchRows()
    }
  }, [fetchRows, isAllowed, session, status])

  const computedRows = useMemo(() => {
    return skus.map(sku => ({
      sku,
      comparison: computeComparison(sku),
    }))
  }, [skus])

  const filteredRows = useMemo(() => {
    if (statusFilter === 'ALL') return computedRows
    return computedRows.filter(row => row.comparison.status === statusFilter)
  }, [computedRows, statusFilter])

  // Reset to page 1 when filter changes
  useEffect(() => {
    pageState.setPagination(1, SKUS_PER_PAGE)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset on filter change
  }, [statusFilter])

  const totalPages = Math.ceil(filteredRows.length / SKUS_PER_PAGE)
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * SKUS_PER_PAGE
    return filteredRows.slice(start, start + SKUS_PER_PAGE)
  }, [filteredRows, currentPage])

  const summary = useMemo(() => {
    const counts = { total: computedRows.length, mismatch: 0, match: 0, warning: 0, pending: 0 }

    for (const row of computedRows) {
      const s = row.comparison.status
      if (s === 'MISMATCH') counts.mismatch += 1
      else if (s === 'MATCH') counts.match += 1
      else if (s === 'NO_ASIN' || s === 'MISSING_REFERENCE' || s === 'ERROR') counts.warning += 1
      else counts.pending += 1
    }

    return counts
  }, [computedRows])

  const anyMissingReference = useMemo(() => {
    return paginatedRows.some(row => row.comparison.status === 'MISSING_REFERENCE')
  }, [paginatedRows])

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
        description="Compare FBA fulfillment fees between reference and Amazon"
        icon={DollarSign}
      />

      <PageContent className="space-y-6">
        <StatsCardGrid cols={4} gap="gap-4">
          <StatsCard
            title="Mismatches"
            value={summary.mismatch}
            icon={XCircle}
            variant="danger"
            size="sm"
          />
          <StatsCard
            title="Matches"
            value={summary.match}
            icon={CheckCircle2}
            variant="success"
            size="sm"
          />
          <StatsCard
            title="Warnings"
            value={summary.warning}
            icon={AlertCircle}
            variant="warning"
            size="sm"
          />
          <StatsCard
            title="Pending"
            value={summary.pending}
            icon={Clock}
            variant="default"
            size="sm"
          />
        </StatsCardGrid>

        <div className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-hidden">
          {/* Header with search and filter */}
          <div className="flex flex-col gap-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
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
                <option value="MISMATCH">Mismatch</option>
                <option value="MATCH">Match</option>
                <option value="MISSING_REFERENCE">Missing reference</option>
                <option value="NO_ASIN">No ASIN</option>
                <option value="ERROR">Error</option>
                <option value="UNKNOWN">Pending</option>
              </select>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {filteredRows.length} SKUs · Page {currentPage} of {totalPages || 1}
            </div>
          </div>

          {/* Missing reference alert */}
          {anyMissingReference && (
            <div className="px-4 pt-4">
              <Alert className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                <AlertTriangle className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <AlertTitle className="text-slate-900 dark:text-slate-100">Missing reference data</AlertTitle>
                <AlertDescription className="text-slate-600 dark:text-slate-400">
                  <p>
                    Fill the latest batch <span className="font-medium">Item package dimensions</span> +{' '}
                    <span className="font-medium">Item package weight</span> and the SKU{' '}
                    <span className="font-medium">Reference FBA fulfillment fee</span>.
                    Go to{' '}
                    <Link href="/config/products" className="text-cyan-600 dark:text-cyan-400 hover:underline">
                      Products
                    </Link>{' '}
                    → Edit SKU → View Batches (latest).
                  </p>
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Main comparison table */}
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : paginatedRows.length === 0 ? (
            <div className="px-6 py-16">
              <EmptyState title="No SKUs found" description="Try adjusting your search or filter." icon={DollarSign} />
            </div>
          ) : (
            <div className="overflow-x-auto p-4">
              <table className="min-w-[900px] w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-3 sticky left-0 bg-slate-50/80 dark:bg-slate-900/80 z-10">Attribute</th>
                    {paginatedRows.map(row => (
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
                      colSpan={paginatedRows.length + 1}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-cyan-600 dark:bg-cyan-700 text-white"
                    >
                      Reference Data
                    </td>
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">ASIN</td>
                    {paginatedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center font-mono text-xs text-slate-600 dark:text-slate-400">
                        {row.sku.asin ?? '—'}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Package Dimensions</td>
                    {paginatedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatDimensionsIn(row.comparison.reference.triplet)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Package Weight</td>
                    {paginatedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatWeightLb(row.comparison.reference.shipping.unitWeightLb, 3)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Dimensional Weight</td>
                    {paginatedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatWeightLb(row.comparison.reference.shipping.dimensionalWeightLb, 3)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Shipping Weight</td>
                    {paginatedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatWeightLb(row.comparison.reference.shipping.shippingWeightLb, 2)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Size Tier</td>
                    {paginatedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center text-slate-700 dark:text-slate-300 text-xs">
                        {row.comparison.reference.sizeTier ?? '—'}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Expected Fee</td>
                    {paginatedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 font-medium">
                        {formatFee(row.comparison.reference.expectedFee, currencyCode)}
                      </td>
                    ))}
                  </tr>

                  {/* Amazon section header */}
                  <tr>
                    <td
                      colSpan={paginatedRows.length + 1}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-slate-600 dark:bg-slate-700 text-white"
                    >
                      Amazon Data
                    </td>
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Listing Price</td>
                    {paginatedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatFee(row.sku.amazonListingPrice, currencyCode)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Package Dimensions</td>
                    {paginatedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatDimensionsIn(row.comparison.amazon.triplet)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Package Weight</td>
                    {paginatedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatWeightLb(row.comparison.amazon.shipping.unitWeightLb, 3)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Dimensional Weight</td>
                    {paginatedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatWeightLb(row.comparison.amazon.shipping.dimensionalWeightLb, 3)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Shipping Weight</td>
                    {paginatedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs">
                        {formatWeightLb(row.comparison.amazon.shipping.shippingWeightLb, 2)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Size Tier</td>
                    {paginatedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center text-slate-700 dark:text-slate-300 text-xs">
                        {row.comparison.amazon.sizeTier ?? '—'}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">FBA Fee</td>
                    {paginatedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 font-medium">
                        {formatFee(row.comparison.amazon.fee, currencyCode)}
                      </td>
                    ))}
                  </tr>

                  {/* Comparison section header */}
                  <tr>
                    <td
                      colSpan={paginatedRows.length + 1}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                    >
                      Comparison
                    </td>
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Fee Difference</td>
                    {paginatedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {row.comparison.feeDifference === null
                          ? '—'
                          : formatFee(row.comparison.feeDifference, currencyCode)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">Status</td>
                    {paginatedRows.map(row => {
                      const s = row.comparison.status
                      const cellStyle =
                        s === 'MATCH'
                          ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                          : s === 'MISMATCH'
                            ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                            : s === 'NO_ASIN' || s === 'MISSING_REFERENCE'
                              ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'

                      const label =
                        s === 'MATCH'
                          ? 'Match'
                          : s === 'MISMATCH'
                            ? 'Mismatch'
                            : s === 'MISSING_REFERENCE'
                              ? 'No ref'
                              : s === 'NO_ASIN'
                                ? 'No ASIN'
                                : s === 'ERROR'
                                  ? 'Error'
                                  : 'Pending'

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
                Showing {((currentPage - 1) * SKUS_PER_PAGE) + 1}–{Math.min(currentPage * SKUS_PER_PAGE, filteredRows.length)} of {filteredRows.length} SKUs
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
          Currency: {currencyCode} · {skus.length} SKUs loaded
        </p>
      </PageContent>
    </PageContainer>
  )
}
