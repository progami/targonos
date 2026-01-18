'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { useSession } from '@/hooks/usePortalSession'
import { redirectToPortal } from '@/lib/portal'
import { calculateSizeTier } from '@/lib/amazon/fees'
import { resolveDimensionTripletCm } from '@/lib/sku-dimensions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer, PageContent, PageHeaderSection } from '@/components/layout/page-container'
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Loader2,
  RefreshCw,
  Search,
  X,
  XCircle,
} from '@/lib/lucide-icons'

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
  return `${s1} x ${s2} x ${s3} in`
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

function StatusBadge({ status }: { status: AlertStatus }) {
  const config: Record<AlertStatus, { label: string; variant: 'success' | 'danger' | 'warning' | 'neutral' }> = {
    MATCH: { label: 'Match', variant: 'success' },
    MISMATCH: { label: 'Mismatch', variant: 'danger' },
    NO_ASIN: { label: 'No ASIN', variant: 'warning' },
    MISSING_REFERENCE: { label: 'No Ref', variant: 'warning' },
    ERROR: { label: 'Error', variant: 'neutral' },
    UNKNOWN: { label: 'Pending', variant: 'neutral' },
  }

  const { label, variant } = config[status]

  return (
    <Badge variant={variant} className="gap-1.5">
      <StatusIcon status={status} />
      {label}
    </Badge>
  )
}

export default function AmazonFbaFeeDiscrepanciesPage() {
  const router = useRouter()
  const { data: session, status } = useSession()

  const [loading, setLoading] = useState(false)
  const [skus, setSkus] = useState<ApiSkuRow[]>([])
  const [currencyCode, setCurrencyCode] = useState<string>('USD')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'ALL'>('ALL')
  const [selectedSkuIds, setSelectedSkuIds] = useState<string[]>([])

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

  const selectedSkuSet = useMemo(() => new Set(selectedSkuIds), [selectedSkuIds])

  useEffect(() => {
    if (skus.length === 0) return
    const ids = new Set(skus.map(sku => sku.id))
    setSelectedSkuIds(prev => prev.filter(id => ids.has(id)))
  }, [skus])

  const filteredRows = useMemo(() => {
    if (statusFilter === 'ALL') return computedRows
    return computedRows.filter(row => row.comparison.status === statusFilter)
  }, [computedRows, statusFilter])

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

  const selectedRows = useMemo(() => {
    return computedRows.filter(row => selectedSkuSet.has(row.sku.id))
  }, [computedRows, selectedSkuSet])

  const anySelectedMissingReference = useMemo(() => {
    return selectedRows.some(row => row.comparison.status === 'MISSING_REFERENCE')
  }, [selectedRows])

  const toggleSelected = useCallback((skuId: string) => {
    setSelectedSkuIds(prev => {
      if (prev.includes(skuId)) return prev.filter(id => id !== skuId)
      return [...prev, skuId]
    })
  }, [])

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
        actions={
          <Button variant="outline" size="sm" onClick={() => fetchRows()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
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

        {selectedRows.length > 0 ? (
          <div className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Comparison</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedRows.length} selected · Status based on FBA fee match (size tier shown for context)
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedSkuIds([])}
                className="h-8 px-3 text-xs"
              >
                Clear selection
              </Button>
            </div>

            {anySelectedMissingReference ? (
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
            ) : null}

            <div className="overflow-x-auto p-4">
              <table className="min-w-[900px] w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-3 sticky left-0 bg-slate-50/80 dark:bg-slate-900/80">Attribute</th>
                    {selectedRows.map(row => (
                      <th key={row.sku.id} className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <span className="text-slate-700 dark:text-slate-300">{row.sku.skuCode}</span>
                          <button
                            type="button"
                            onClick={() => toggleSelected(row.sku.id)}
                            className="rounded p-1 text-slate-400 hover:text-slate-600"
                            aria-label={`Remove ${row.sku.skuCode} from comparison`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td
                      colSpan={selectedRows.length + 1}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-cyan-600 dark:bg-cyan-700 text-white"
                    >
                      User Provided / Ground Truth
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">ASIN</td>
                    {selectedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center font-mono text-xs text-slate-600 dark:text-slate-400">
                        {row.sku.asin ?? '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">Item package dimensions</td>
                    {selectedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {formatDimensionsIn(row.comparison.reference.triplet)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">Item package weight</td>
                    {selectedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {formatWeightLb(row.comparison.reference.shipping.unitWeightLb, 3)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">Dimensional Weight</td>
                    {selectedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {formatWeightLb(row.comparison.reference.shipping.dimensionalWeightLb, 3)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">Shipping Weight</td>
                    {selectedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {formatWeightLb(row.comparison.reference.shipping.shippingWeightLb, 2)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">Size Tier</td>
                    {selectedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center text-slate-700 dark:text-slate-300">
                        {row.comparison.reference.sizeTier ?? '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">Expected Fee (Ref)</td>
                    {selectedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {formatFee(row.comparison.reference.expectedFee, currencyCode)}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td
                      colSpan={selectedRows.length + 1}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-slate-600 dark:bg-slate-700 text-white"
                    >
                      Amazon Data (Imported)
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">Listing Price</td>
                    {selectedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {formatFee(row.sku.amazonListingPrice, currencyCode)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">Item package dimensions</td>
                    {selectedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {formatDimensionsIn(row.comparison.amazon.triplet)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">Item package weight</td>
                    {selectedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {formatWeightLb(row.comparison.amazon.shipping.unitWeightLb, 3)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">Dimensional Weight</td>
                    {selectedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {formatWeightLb(row.comparison.amazon.shipping.dimensionalWeightLb, 3)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">Shipping Weight</td>
                    {selectedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {formatWeightLb(row.comparison.amazon.shipping.shippingWeightLb, 2)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">Size Tier</td>
                    {selectedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center text-slate-700 dark:text-slate-300">
                        {row.comparison.amazon.sizeTier ?? '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">FBA Fee (Amazon)</td>
                    {selectedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {formatFee(row.comparison.amazon.fee, currencyCode)}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td
                      colSpan={selectedRows.length + 1}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                    >
                      Comparison
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">FBA Fee Match?</td>
                    {selectedRows.map(row => {
                      const s = row.comparison.status
                      const cellStyle =
                        s === 'MATCH'
                          ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                          : s === 'MISMATCH'
                            ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            : s === 'NO_ASIN' || s === 'MISSING_REFERENCE'
                              ? 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'

                      const label =
                        s === 'MATCH'
                          ? '✓ Match'
                          : s === 'MISMATCH'
                            ? '✗ Mismatch'
                            : s === 'MISSING_REFERENCE'
                              ? '— Missing reference'
                              : s === 'NO_ASIN'
                                ? '— No ASIN'
                                : s === 'ERROR'
                                  ? '— Error'
                                  : 'Pending'

                      return (
                        <td key={row.sku.id} className={`px-4 py-2 text-center font-medium ${cellStyle}`}>
                          {label}
                        </td>
                      )
                    })}
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">Fee Difference</td>
                    {selectedRows.map(row => (
                      <td key={row.sku.id} className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300">
                        {row.comparison.feeDifference === null
                          ? '—'
                          : formatFee(row.comparison.feeDifference, currencyCode)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800">Status</td>
                    {selectedRows.map(row => {
                      const s = row.comparison.status
                      const cellStyle =
                        s === 'MATCH'
                          ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                          : s === 'MISMATCH'
                            ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            : s === 'NO_ASIN' || s === 'MISSING_REFERENCE'
                              ? 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'

                      const label =
                        s === 'MATCH'
                          ? '✓ Correct'
                          : s === 'MISMATCH'
                            ? 'Fee mismatch'
                            : s === 'MISSING_REFERENCE'
                              ? 'Fill reference fields'
                            : s === 'NO_ASIN'
                              ? 'Add ASIN'
                                : s === 'ERROR'
                                  ? 'Review Amazon data'
                                  : 'Pending'

                      return (
                        <td key={row.sku.id} className={`px-4 py-2 text-center font-medium ${cellStyle}`}>
                          {label}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft overflow-hidden">
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
              Select SKUs to compare ·{' '}
              <Link href="/config/products" className="text-cyan-600 hover:underline">
                Products
              </Link>
            </div>
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="px-6 py-16">
              <EmptyState title="No SKUs found" description="Try adjusting your search or filter." icon={DollarSign} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-3 w-10"></th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">ASIN</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Amazon</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredRows.map(({ sku, comparison }) => {
                    const isSelected = selectedSkuSet.has(sku.id)
                    const isMismatch = comparison.status === 'MISMATCH'

                    return (
                      <tr
                        key={sku.id}
                        className={`transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-700/50 ${isMismatch ? 'bg-slate-100/50 dark:bg-slate-700/30' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelected(sku.id)}
                            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500 dark:bg-slate-700"
                            aria-label={`Select ${sku.skuCode} for comparison`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <div className="font-medium text-slate-900 dark:text-slate-100">{sku.skuCode}</div>
                            {sku.latestBatchCode ? (
                              <div className="text-xs text-slate-500 dark:text-slate-400">Batch: {sku.latestBatchCode}</div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {sku.asin ? (
                            <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{sku.asin}</span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <div className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                              {formatFee(comparison.reference.expectedFee, currencyCode)}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{comparison.reference.sizeTier ?? '—'}</div>
                            {comparison.reference.missingFields.length > 0 ? (
                              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                Missing: {comparison.reference.missingFields.join(', ')}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <div className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                              {formatFee(comparison.amazon.fee, currencyCode)}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{comparison.amazon.sizeTier ?? '—'}</div>
                            {sku.amazonListingPrice ? (
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                Price: {formatFee(sku.amazonListingPrice, currencyCode)}
                              </div>
                            ) : null}
                            {comparison.amazon.missingFields.length > 0 ? (
                              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                Missing: {comparison.amazon.missingFields.join(', ')}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={comparison.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button asChild size="sm" variant="outline" className="h-8 px-3 text-xs">
                            <Link href={`/config/products?editSkuId=${encodeURIComponent(sku.id)}`}>
                              Edit
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
