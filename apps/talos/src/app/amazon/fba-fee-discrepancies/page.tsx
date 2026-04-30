'use client'

import { Suspense, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { useSession } from '@/hooks/usePortalSession'
import {
  buildComparisonSummaryItems,
  COMPARISON_WARNING_STATUSES,
  type AlertStatus,
  type ApiSkuRow,
  computeComparison,
  getComparisonStatusLabel,
  summarizeComparisonStatuses,
} from '@/lib/amazon/fba-fee-discrepancies'
import { buildAppCallbackUrl, redirectToPortal } from '@/lib/portal'
import type { TenantCode } from '@/lib/tenant/constants'
import {
  formatDimensionTripletDisplayFromCm,
  formatLengthFromCm,
  formatWeightDisplayFromKg,
  formatWeightFromKg,
  getDefaultUnitSystem,
  getLengthUnitLabel,
  getWeightUnitLabel,
  type UnitSystem,
} from '@/lib/measurements'
import { getSizeTierOptionsForTenant } from '@/lib/amazon/fees'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import { usePageState, usePageStateStore } from '@/lib/store/page-state'
import { withBasePath } from '@/lib/utils/base-path'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer, PageContent, PageHeaderSection } from '@/components/layout/page-container'
import { PortalModal } from '@/components/ui/portal-modal'
import { AmazonImportButton } from '@/app/amazon/fba-fee-discrepancies/amazon-import-button'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  Loader2,
  Package,
  Search,
  XCircle,
} from '@/lib/lucide-icons'

const PAGE_KEY = '/amazon/fba-fee-discrepancies'
const SKUS_PER_PAGE = 10

const ALLOWED_ROLES = ['admin', 'staff'] as const
const STATUS_FILTER_VALUES = [
  'ALL',
  'MISMATCH',
  'MATCH',
  'MISSING_REFERENCE',
  'MISSING_AMAZON',
  'NO_ASIN',
  'UNKNOWN',
] as const
type StatusFilter = (typeof STATUS_FILTER_VALUES)[number]

function readStatusFilter(value: unknown): StatusFilter {
  if (STATUS_FILTER_VALUES.includes(value as StatusFilter)) return value as StatusFilter
  return 'ALL'
}

function StatusIcon({ status }: { status: AlertStatus }) {
  switch (status) {
    case 'MATCH':
      return <CheckCircle2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
    case 'MISMATCH':
      return <XCircle className="h-4 w-4 text-slate-600 dark:text-slate-400" />
    case 'NO_ASIN':
    case 'MISSING_REFERENCE':
    case 'MISSING_AMAZON':
      return <AlertTriangle className="h-4 w-4 text-slate-500 dark:text-slate-400" />
    default:
      return <Clock className="h-4 w-4 text-slate-300 dark:text-slate-600" />
  }
}

type ComputedRow = {
  sku: ApiSkuRow
  comparison: ReturnType<typeof computeComparison>
}

type ReferenceFormState = {
  unitSide1: string
  unitSide2: string
  unitSide3: string
  unitWeight: string
  sizeTier: string
}

function parseFiniteNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function formatLengthInput(valueCm: number | null, unitSystem: UnitSystem): string {
  if (valueCm === null) return ''
  return formatLengthFromCm(valueCm, unitSystem)
}

function formatWeightInput(valueKg: number | null, unitSystem: UnitSystem): string {
  if (valueKg === null) return ''
  return formatWeightFromKg(valueKg, unitSystem)
}

function buildReferenceForm(row: ComputedRow, unitSystem: UnitSystem): ReferenceFormState {
  const triplet = row.comparison.reference.triplet
  return {
    unitSide1: formatLengthInput(triplet ? triplet.side1Cm : null, unitSystem),
    unitSide2: formatLengthInput(triplet ? triplet.side2Cm : null, unitSystem),
    unitSide3: formatLengthInput(triplet ? triplet.side3Cm : null, unitSystem),
    unitWeight: formatWeightInput(row.comparison.reference.shipping.unitWeightKg, unitSystem),
    sizeTier: row.comparison.reference.sizeTier ?? '',
  }
}

function UnitNumberInput({
  id,
  value,
  onChange,
  placeholder,
  unit,
  step,
  min,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  unit: string
  step: string
  min: number
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        className="pr-12"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 dark:text-slate-400">
        {unit}
      </span>
    </div>
  )
}

function ReferenceRowLabel({ children, editable = false }: { children: ReactNode; editable?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {editable ? (
        <Edit2 className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </div>
  )
}

function EditableReferenceValue({
  row,
  ariaLabelPrefix,
  children,
  onEdit,
}: {
  row: ComputedRow
  ariaLabelPrefix: string
  children: ReactNode
  onEdit: (row: ComputedRow) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onEdit(row)}
      className="inline-flex max-w-full items-center justify-center rounded-md px-2 py-1 text-center text-xs leading-tight text-slate-700 transition-colors hover:bg-slate-100 hover:text-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-cyan-300"
      aria-label={`${ariaLabelPrefix} ${row.sku.skuCode}`}
    >
      {children}
    </button>
  )
}

function AmazonFbaFeeDiscrepanciesPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const pageState = usePageState(PAGE_KEY)
  const setPageSearch = usePageStateStore(state => state.setSearch)
  const setPageCustom = usePageStateStore(state => state.setCustom)
  const setPagePagination = usePageStateStore(state => state.setPagination)
  const tenantCode: TenantCode = session?.user?.region ?? 'US'
  const unitSystem = getDefaultUnitSystem(tenantCode)
  const lengthUnit = getLengthUnitLabel(unitSystem)
  const weightUnit = getWeightUnitLabel(unitSystem)
  const sizeTierOptions = useMemo(() => getSizeTierOptionsForTenant(tenantCode), [tenantCode])

  const [loading, setLoading] = useState(false)
  const [skus, setSkus] = useState<ApiSkuRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [referenceEditorRow, setReferenceEditorRow] = useState<ComputedRow | null>(null)
  const [referenceForm, setReferenceForm] = useState<ReferenceFormState>(() => ({
    unitSide1: '',
    unitSide2: '',
    unitSide3: '',
    unitWeight: '',
    sizeTier: '',
  }))
  const [referenceSaving, setReferenceSaving] = useState(false)
  const appliedUrlSearch = useRef(false)
  const openedUrlEditSkuId = useRef<string | null>(null)
  const search = pageState.search ?? ''
  const setSearch = useCallback((value: string) => setPageSearch(PAGE_KEY, value), [setPageSearch])
  const statusFilter = readStatusFilter(pageState.custom?.statusFilter)
  const setStatusFilter = useCallback(
    (value: StatusFilter) => setPageCustom(PAGE_KEY, 'statusFilter', value),
    [setPageCustom]
  )
  const currentPage = pageState.pagination?.page ?? 1
  const setCurrentPage = useCallback(
    (page: number) => setPagePagination(PAGE_KEY, page, SKUS_PER_PAGE),
    [setPagePagination]
  )

  const isAllowed = useMemo(() => {
    if (!session) return false
    type AllowedRole = (typeof ALLOWED_ROLES)[number]
    return ALLOWED_ROLES.includes(session.user.role as AllowedRole)
  }, [session])

  useEffect(() => {
    if (status === 'loading') return

    if (!session) {
      redirectToPortal('/login', buildAppCallbackUrl('/amazon/fba-fee-discrepancies'))
      return
    }

    if (!isAllowed) {
      toast.error('You are not authorised to view this page')
      router.push('/dashboard')
    }
  }, [isAllowed, router, session, status])

  useEffect(() => {
    if (appliedUrlSearch.current) return
    appliedUrlSearch.current = true
    const urlSearch = searchParams.get('search')
    if (!urlSearch) return
    setSearch(urlSearch)
    setCurrentPage(1)
  }, [searchParams, setCurrentPage, setSearch])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      params.set('page', String(currentPage))
      params.set('pageSize', String(SKUS_PER_PAGE))

      const response = await fetch(
        withBasePath(`/api/amazon/fba-fee-discrepancies?${params.toString()}`),
        {
          credentials: 'include',
        }
      )
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to load SKU info')
      }

      const payload = await response.json()
      setSkus(Array.isArray(payload?.skus) ? payload.skus : [])
      setTotalRows(typeof payload?.total === 'number' ? payload.total : 0)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load SKU info')
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

  const openReferenceEditor = useCallback(
    (row: ComputedRow) => {
      setReferenceEditorRow(row)
      setReferenceForm(buildReferenceForm(row, unitSystem))
    },
    [unitSystem]
  )

  useEffect(() => {
    const editSkuId = searchParams.get('editSkuId')
    if (!editSkuId) return
    if (openedUrlEditSkuId.current === editSkuId) return

    const row = computedRows.find(candidate => candidate.sku.id === editSkuId)
    if (!row) return

    openedUrlEditSkuId.current = editSkuId
    openReferenceEditor(row)
  }, [computedRows, openReferenceEditor, searchParams])

  const pageRows = useMemo(() => {
    if (statusFilter === 'ALL') return computedRows
    return computedRows.filter(row => row.comparison.status === statusFilter)
  }, [computedRows, statusFilter])
  const totalPages = Math.max(1, Math.ceil(totalRows / SKUS_PER_PAGE))

  const summary = useMemo(() => summarizeComparisonStatuses(computedRows), [computedRows])
  const summaryItems = useMemo(() => buildComparisonSummaryItems(summary), [summary])

  const submitReferenceUpdate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!referenceEditorRow) return
    if (referenceSaving) return

    const side1Input = parseFiniteNumber(referenceForm.unitSide1)
    const side2Input = parseFiniteNumber(referenceForm.unitSide2)
    const side3Input = parseFiniteNumber(referenceForm.unitSide3)
    const dimensionInputs = [side1Input, side2Input, side3Input]
    const dimensionRawValues = [
      referenceForm.unitSide1.trim(),
      referenceForm.unitSide2.trim(),
      referenceForm.unitSide3.trim(),
    ]
    const hasAnyDimension = dimensionRawValues.some(value => value.length > 0)
    const hasAllDimensions = dimensionRawValues.every(value => value.length > 0)

    if (hasAnyDimension && !hasAllDimensions) {
      toast.error('Reference package sides require side 1, side 2, and side 3')
      return
    }

    if (hasAnyDimension && dimensionInputs.some(value => value === null || value <= 0)) {
      toast.error('Reference package sides must be positive numbers')
      return
    }

    const weightInput = parseFiniteNumber(referenceForm.unitWeight)
    if (referenceForm.unitWeight.trim() && (weightInput === null || weightInput <= 0)) {
      toast.error(`Reference package weight (${weightUnit}) must be a positive number`)
      return
    }

    const payload = {
      skuId: referenceEditorRow.sku.id,
      inputUnitSystem: unitSystem,
      unitSide1: side1Input,
      unitSide2: side2Input,
      unitSide3: side3Input,
      unitWeight: weightInput,
      sizeTier: referenceForm.sizeTier.trim() ? referenceForm.sizeTier.trim() : null,
    }

    setReferenceSaving(true)
    try {
      const response = await fetchWithCSRF('/api/amazon/fba-fee-discrepancies', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to save reference data')
      }

      toast.success('Reference data updated')
      setReferenceEditorRow(null)
      await fetchRows()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save reference data')
    } finally {
      setReferenceSaving(false)
    }
  }

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
        title="SKU Info"
        description="Amazon"
        icon={Package}
        backHref="/dashboard"
        backLabel="Dashboard"
        actions={<AmazonImportButton onImportComplete={() => void fetchRows()} />}
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
                  onChange={event => setStatusFilter(event.target.value as StatusFilter)}
                  className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:focus:ring-cyan-900"
                >
                  <option value="ALL">All statuses</option>
                  <option value="MISMATCH">Size tier mismatch</option>
                  <option value="MATCH">Size tier match</option>
                  <option value="MISSING_REFERENCE">No reference tier</option>
                  <option value="MISSING_AMAZON">No Amazon tier</option>
                  <option value="NO_ASIN">No ASIN</option>
                  <option value="UNKNOWN">Pending</option>
                </select>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {pageRows.length} shown · {totalRows} total SKUs · Page {currentPage} of{' '}
                {totalPages}
              </div>
            </div>
            {summaryItems.length > 0 ? (
              <div className="flex w-fit items-center gap-2 rounded-md border border-slate-200 bg-white/60 px-3 py-1.5 text-xs text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                {summaryItems.map((item, index) => (
                  <span key={item.key} className="inline-flex items-center gap-2">
                    <span>
                      <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                        {item.count}
                      </span>{' '}
                      {item.label}
                    </span>
                    {index < summaryItems.length - 1 ? (
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* Main comparison table */}
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : pageRows.length === 0 ? (
            <div className="px-6 py-16">
              <EmptyState
                title="No SKUs found"
                description="Try adjusting your search, page, or filter."
                icon={Package}
              />
            </div>
          ) : (
            <div className="overflow-x-auto p-4">
              <table className="min-w-[900px] w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-3 sticky left-0 bg-slate-50/80 dark:bg-slate-900/80 z-10">
                      Attribute
                    </th>
                    {pageRows.map(row => (
                      <th
                        key={row.sku.id}
                        className="px-4 py-3 text-center whitespace-nowrap min-w-[140px]"
                      >
                        <button
                          type="button"
                          onClick={() => openReferenceEditor(row)}
                          className="text-slate-700 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                        >
                          {row.sku.skuCode}
                        </button>
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
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">
                      ASIN
                    </td>
                    {pageRows.map(row => (
                      <td
                        key={row.sku.id}
                        className="px-4 py-2 text-center font-mono text-xs text-slate-600 dark:text-slate-400"
                      >
                        {row.sku.asin ?? '—'}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">
                      <ReferenceRowLabel editable>Package Sides</ReferenceRowLabel>
                    </td>
                    {pageRows.map(row => (
                      <td
                        key={row.sku.id}
                        className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs"
                      >
                        <EditableReferenceValue
                          row={row}
                          ariaLabelPrefix="Edit package sides for"
                          onEdit={openReferenceEditor}
                        >
                          {formatDimensionTripletDisplayFromCm(
                            row.comparison.reference.triplet,
                            unitSystem
                          )}
                        </EditableReferenceValue>
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">
                      <ReferenceRowLabel editable>Package Weight</ReferenceRowLabel>
                    </td>
                    {pageRows.map(row => (
                      <td
                        key={row.sku.id}
                        className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs"
                      >
                        <EditableReferenceValue
                          row={row}
                          ariaLabelPrefix="Edit package weight for"
                          onEdit={openReferenceEditor}
                        >
                          {formatWeightDisplayFromKg(
                            row.comparison.reference.shipping.unitWeightKg,
                            unitSystem,
                            2
                          )}
                        </EditableReferenceValue>
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">
                      Dimensional Weight
                    </td>
                    {pageRows.map(row => (
                      <td
                        key={row.sku.id}
                        className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs"
                      >
                        {formatWeightDisplayFromKg(
                          row.comparison.reference.shipping.dimensionalWeightKg,
                          unitSystem,
                          2
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">
                      Shipping Weight
                    </td>
                    {pageRows.map(row => (
                      <td
                        key={row.sku.id}
                        className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs"
                      >
                        {formatWeightDisplayFromKg(
                          row.comparison.reference.shipping.shippingWeightKg,
                          unitSystem,
                          2
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">
                      <ReferenceRowLabel editable>Size Tier</ReferenceRowLabel>
                    </td>
                    {pageRows.map(row => (
                      <td
                        key={row.sku.id}
                        className="px-4 py-2 text-center text-slate-700 dark:text-slate-300 text-xs"
                      >
                        <EditableReferenceValue
                          row={row}
                          ariaLabelPrefix="Edit size tier for"
                          onEdit={openReferenceEditor}
                        >
                          {row.comparison.reference.sizeTier ?? '—'}
                        </EditableReferenceValue>
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
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">
                      Package Sides
                    </td>
                    {pageRows.map(row => (
                      <td
                        key={row.sku.id}
                        className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs"
                      >
                        {formatDimensionTripletDisplayFromCm(
                          row.comparison.amazon.triplet,
                          unitSystem
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">
                      Package Weight
                    </td>
                    {pageRows.map(row => (
                      <td
                        key={row.sku.id}
                        className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs"
                      >
                        {formatWeightDisplayFromKg(
                          row.comparison.amazon.shipping.unitWeightKg,
                          unitSystem,
                          2
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">
                      Dimensional Weight
                    </td>
                    {pageRows.map(row => (
                      <td
                        key={row.sku.id}
                        className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs"
                      >
                        {formatWeightDisplayFromKg(
                          row.comparison.amazon.shipping.dimensionalWeightKg,
                          unitSystem,
                          2
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">
                      Shipping Weight
                    </td>
                    {pageRows.map(row => (
                      <td
                        key={row.sku.id}
                        className="px-4 py-2 text-center tabular-nums text-slate-700 dark:text-slate-300 text-xs"
                      >
                        {formatWeightDisplayFromKg(
                          row.comparison.amazon.shipping.shippingWeightKg,
                          unitSystem,
                          2
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white dark:bg-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">
                      Size Tier
                    </td>
                    {pageRows.map(row => (
                      <td
                        key={row.sku.id}
                        className="px-4 py-2 text-center text-slate-700 dark:text-slate-300 text-xs"
                      >
                        {row.comparison.amazon.sizeTier ?? '—'}
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
                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-800 z-10">
                      Status
                    </td>
                    {pageRows.map(row => {
                      const s = row.comparison.status
                      const cellStyle =
                        s === 'MATCH'
                          ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                          : s === 'MISMATCH'
                            ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                            : COMPARISON_WARNING_STATUSES.has(s)
                              ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'

                      const label = getComparisonStatusLabel(row.comparison)

                      return (
                        <td
                          key={row.sku.id}
                          className={`px-4 py-2 text-center text-xs font-medium ${cellStyle}`}
                        >
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
                Showing {(currentPage - 1) * SKUS_PER_PAGE + 1}–
                {Math.min((currentPage - 1) * SKUS_PER_PAGE + pageRows.length, totalRows)} of{' '}
                {totalRows} SKUs
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

        <PortalModal
          open={referenceEditorRow !== null}
          className="items-center"
          onClose={() => {
            if (referenceSaving) return
            setReferenceEditorRow(null)
          }}
        >
          <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Edit Reference Data
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {referenceEditorRow?.sku.skuCode ?? ''}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => setReferenceEditorRow(null)}
                disabled={referenceSaving}
              >
                Close
              </Button>
            </div>

            <form onSubmit={submitReferenceUpdate}>
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label>Reference package sides ({lengthUnit})</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="referenceSide1" className="text-xs text-slate-500">
                        Side 1 (shortest, {lengthUnit})
                      </Label>
                      <UnitNumberInput
                        id="referenceSide1"
                        step="0.01"
                        min={0.01}
                        value={referenceForm.unitSide1}
                        onChange={value =>
                          setReferenceForm(prev => ({ ...prev, unitSide1: value }))
                        }
                        placeholder="Side 1"
                        unit={lengthUnit}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="referenceSide2" className="text-xs text-slate-500">
                        Side 2 (middle, {lengthUnit})
                      </Label>
                      <UnitNumberInput
                        id="referenceSide2"
                        step="0.01"
                        min={0.01}
                        value={referenceForm.unitSide2}
                        onChange={value =>
                          setReferenceForm(prev => ({ ...prev, unitSide2: value }))
                        }
                        placeholder="Side 2"
                        unit={lengthUnit}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="referenceSide3" className="text-xs text-slate-500">
                        Side 3 (longest, {lengthUnit})
                      </Label>
                      <UnitNumberInput
                        id="referenceSide3"
                        step="0.01"
                        min={0.01}
                        value={referenceForm.unitSide3}
                        onChange={value =>
                          setReferenceForm(prev => ({ ...prev, unitSide3: value }))
                        }
                        placeholder="Side 3"
                        unit={lengthUnit}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="referenceUnitWeight">
                    Reference package weight ({weightUnit})
                  </Label>
                  <UnitNumberInput
                    id="referenceUnitWeight"
                    step="0.001"
                    min={0.001}
                    value={referenceForm.unitWeight}
                    onChange={value => setReferenceForm(prev => ({ ...prev, unitWeight: value }))}
                    placeholder="Weight"
                    unit={weightUnit}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="referenceSizeTier">Reference size tier</Label>
                  <select
                    id="referenceSizeTier"
                    value={referenceForm.sizeTier}
                    onChange={event =>
                      setReferenceForm(prev => ({ ...prev, sizeTier: event.target.value }))
                    }
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-cyan-400 dark:focus:ring-cyan-900"
                  >
                    <option value="">Select size tier</option>
                    {sizeTierOptions.map(sizeTier => (
                      <option key={sizeTier} value={sizeTier}>
                        {sizeTier}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReferenceEditorRow(null)}
                  disabled={referenceSaving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={referenceSaving}>
                  {referenceSaving ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </PortalModal>

        <p className="text-center text-xs text-slate-400">
          {pageRows.length} SKUs loaded on this page
        </p>
      </PageContent>
    </PageContainer>
  )
}

export default function AmazonFbaFeeDiscrepanciesPage() {
  return (
    <Suspense fallback={null}>
      <AmazonFbaFeeDiscrepanciesPageContent />
    </Suspense>
  )
}
