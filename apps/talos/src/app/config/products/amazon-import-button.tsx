'use client'

import { useCallback, useMemo, useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { PortalModal } from '@/components/ui/portal-modal'
import { Input } from '@/components/ui/input'
import {
  AlertCircle,
  Check,
  CheckCircle,
  ChevronRight,
  Cloud,
  Loader2,
  RefreshCw,
  Search,
  X,
} from '@/lib/lucide-icons'

type AmazonListingType = 'LISTING' | 'PARENT' | 'UNKNOWN'

type ImportResult = {
  imported: number
  skipped: number
  errors: string[]
  details?: Array<{
    skuCode: string
    status: 'imported' | 'skipped' | 'blocked'
    message?: string
    unitWeightKg?: number | null
    unitDimensionsCm?: string | null
  }>
}

type ImportPreview = {
  limit: number
  totalListings: number
  hasMore: boolean
  summary: {
    newCount: number
    existingCount: number
    blockedCount: number
  }
  policy: {
    updatesExistingSkus: boolean
    createsBatch: boolean
    defaultBatchCode: string
  }
  items: Array<{
    sellerSku: string
    skuCode: string | null
    asin: string | null
    title: string | null
    listingType: AmazonListingType
    status: 'new' | 'existing' | 'blocked'
    reason: string | null
    exists: boolean
  }>
}

type WorkflowStep = 'select' | 'validate' | 'import'

export function AmazonImportButton({ onImportComplete }: { onImportComplete?: () => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'new' | 'existing' | 'blocked'>('all')
  const [selectedSkuCodes, setSelectedSkuCodes] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validatedKey, setValidatedKey] = useState<string | null>(null)
  const [validation, setValidation] = useState<ImportResult | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const handleClose = () => {
    setIsOpen(false)
    setPreview(null)
    setPreviewError(null)
    setSearch('')
    setFilter('all')
    setSelectedSkuCodes(new Set())
    setValidation(null)
    setValidatedKey(null)
    setResult(null)
    setImporting(false)
    setValidating(false)
  }

  const selectionKey = useMemo(() => {
    const sorted = Array.from(selectedSkuCodes).sort((a, b) => a.localeCompare(b))
    return sorted.join('|')
  }, [selectedSkuCodes])

  const validationBySku = useMemo(() => {
    if (!validation?.details) return new Map<string, NonNullable<ImportResult['details']>[number]>()
    return new Map(validation.details.map(detail => [detail.skuCode.toUpperCase(), detail]))
  }, [validation])

  const selectableItems = useMemo(() => {
    if (!preview) return []
    return preview.items.filter(item => {
      if (!item.skuCode) return false
      // All items except blocked are selectable
      return item.status === 'new' || item.status === 'existing'
    })
  }, [preview])

  const filteredItems = useMemo(() => {
    if (!preview) return []
    const normalizedSearch = search.trim().toLowerCase()
    return preview.items.filter(item => {
      if (filter !== 'all' && item.status !== filter) return false
      if (!normalizedSearch) return true
      const haystack = [
        item.sellerSku,
        item.skuCode ?? '',
        item.asin ?? '',
        item.title ?? '',
        item.reason ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [filter, preview, search])

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true)
    setPreview(null)
    setPreviewError(null)
    setSelectedSkuCodes(new Set())
    setValidation(null)
    setValidatedKey(null)

    try {
      const response = await fetch('/api/amazon/import-skus?limit=250', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message =
          typeof payload?.error === 'string' && payload.error.trim()
            ? payload.error
            : 'Failed to load Amazon listings'
        throw new Error(message)
      }

      const nextPreview = payload?.preview as ImportPreview | undefined
      if (!nextPreview) {
        throw new Error('Unexpected response from Amazon preview')
      }

      setPreview(nextPreview)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load Amazon listings'
      setPreviewError(message)
    } finally {
      setLoadingPreview(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    loadPreview()
  }, [isOpen, loadPreview])

  const toggleSkuCode = (skuCode: string) => {
    setSelectedSkuCodes(prev => {
      const next = new Set(prev)
      const key = skuCode.toUpperCase()
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setValidation(null)
    setValidatedKey(null)
    setResult(null)
  }

  const selectAllNew = () => {
    const next = new Set<string>()
    for (const item of selectableItems) {
      if (item.skuCode) next.add(item.skuCode.toUpperCase())
    }
    setSelectedSkuCodes(next)
    setValidation(null)
    setValidatedKey(null)
    setResult(null)
  }

  const clearSelection = () => {
    setSelectedSkuCodes(new Set())
    setValidation(null)
    setValidatedKey(null)
    setResult(null)
  }

  const validateSelection = async () => {
    if (selectedSkuCodes.size === 0) return

    setValidating(true)
    setValidation(null)
    setValidatedKey(null)

    try {
      const response = await fetch('/api/amazon/import-skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skuCodes: Array.from(selectedSkuCodes), mode: 'validate' }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message =
          typeof payload?.error === 'string' && payload.error.trim() ? payload.error : 'Validation failed'
        throw new Error(message)
      }

      const nextResult = payload?.result as ImportResult | undefined
      if (!nextResult) {
        throw new Error('Unexpected response from Amazon validation')
      }

      setValidation(nextResult)
      setValidatedKey(selectionKey)

      const blocked = nextResult.details?.filter(detail => detail.status !== 'imported') ?? []
      if (blocked.length === 0) {
        toast.success('All SKUs passed validation')
      } else {
        toast.error(`${blocked.length} SKU${blocked.length === 1 ? '' : 's'} failed validation`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Validation failed')
      setValidation({
        imported: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : 'Validation failed'],
      })
    } finally {
      setValidating(false)
    }
  }

  const canImport = useMemo(() => {
    if (importing || validating) return false
    if (selectedSkuCodes.size === 0) return false
    if (!validation || validatedKey !== selectionKey) return false

    for (const skuCode of selectedSkuCodes) {
      const detail = validationBySku.get(skuCode.toUpperCase())
      if (!detail || detail.status !== 'imported') return false
    }

    return true
  }, [importing, validating, selectedSkuCodes, validation, validatedKey, selectionKey, validationBySku])

  const handleImport = async () => {
    if (!canImport) return
    setImporting(true)
    setResult(null)

    try {
      const response = await fetch('/api/amazon/import-skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skuCodes: Array.from(selectedSkuCodes), mode: 'import' }),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        const message =
          typeof payload?.error === 'string' && payload.error.trim()
            ? payload.error
            : 'Failed to import from Amazon'
        throw new Error(message)
      }

      const nextResult = payload?.result as ImportResult | undefined
      if (!nextResult) {
        throw new Error('Unexpected response from Amazon import')
      }

      setResult(nextResult)
      toast.success(`Imported ${nextResult.imported} SKU${nextResult.imported === 1 ? '' : 's'}`)
      onImportComplete?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import from Amazon')
      setResult({
        imported: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : 'Failed to import from Amazon'],
      })
    } finally {
      setImporting(false)
    }
  }

  // Determine current workflow step
  const currentStep: WorkflowStep = useMemo(() => {
    if (result && result.imported > 0) return 'import'
    if (validation && validatedKey === selectionKey) return 'import'
    if (selectedSkuCodes.size > 0) return 'validate'
    return 'select'
  }, [result, validation, validatedKey, selectionKey, selectedSkuCodes.size])

  const validCount = useMemo(() => {
    if (!validation?.details) return 0
    return validation.details.filter(d => d.status === 'imported').length
  }, [validation])

  const invalidCount = useMemo(() => {
    if (!validation?.details) return 0
    return validation.details.filter(d => d.status !== 'imported').length
  }, [validation])

  return (
    <>
      <Button onClick={() => setIsOpen(true)} variant="outline" className="gap-2">
        <Cloud className="h-4 w-4" />
        Import from Amazon
      </Button>

      <PortalModal open={isOpen} className="items-center">
        <div className="flex w-full max-w-5xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-xl bg-white dark:bg-slate-800 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-500">
                <Cloud className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Import from Amazon</h3>
                <p className="text-sm text-slate-500">Select products to import into your catalog</p>
              </div>
            </div>
            <Button onClick={handleClose} variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Workflow Steps */}
          <div className="border-b bg-slate-50 px-6 py-3">
            <div className="flex items-center gap-2">
              {/* Step 1: Select */}
              <div className={`flex items-center gap-2 ${currentStep === 'select' ? 'text-cyan-600' : selectedSkuCodes.size > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  currentStep === 'select'
                    ? 'bg-cyan-100 text-cyan-700'
                    : selectedSkuCodes.size > 0
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-200 text-slate-500'
                }`}>
                  {selectedSkuCodes.size > 0 && currentStep !== 'select' ? <Check className="h-3.5 w-3.5" /> : '1'}
                </div>
                <span className="text-sm font-medium">Select</span>
                {selectedSkuCodes.size > 0 && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {selectedSkuCodes.size}
                  </span>
                )}
              </div>

              <ChevronRight className="h-4 w-4 text-slate-300" />

              {/* Step 2: Validate */}
              <div className={`flex items-center gap-2 ${
                currentStep === 'validate'
                  ? 'text-cyan-600'
                  : validation && validatedKey === selectionKey
                    ? 'text-emerald-600'
                    : 'text-slate-400'
              }`}>
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  currentStep === 'validate'
                    ? 'bg-cyan-100 text-cyan-700'
                    : validation && validatedKey === selectionKey
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-200 text-slate-500'
                }`}>
                  {validation && validatedKey === selectionKey && currentStep === 'import' ? <Check className="h-3.5 w-3.5" /> : '2'}
                </div>
                <span className="text-sm font-medium">Validate</span>
                {validation && validatedKey === selectionKey && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    invalidCount > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {validCount}/{selectedSkuCodes.size} ready
                  </span>
                )}
              </div>

              <ChevronRight className="h-4 w-4 text-slate-300" />

              {/* Step 3: Import */}
              <div className={`flex items-center gap-2 ${
                result && result.imported > 0 ? 'text-emerald-600' : currentStep === 'import' ? 'text-cyan-600' : 'text-slate-400'
              }`}>
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  result && result.imported > 0
                    ? 'bg-emerald-100 text-emerald-700'
                    : currentStep === 'import'
                      ? 'bg-cyan-100 text-cyan-700'
                      : 'bg-slate-200 text-slate-500'
                }`}>
                  {result && result.imported > 0 ? <Check className="h-3.5 w-3.5" /> : '3'}
                </div>
                <span className="text-sm font-medium">Import</span>
                {result && result.imported > 0 && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {result.imported} imported
                  </span>
                )}
              </div>

              {/* Spacer + Stats + Refresh */}
              <div className="ml-auto flex items-center gap-3">
                {preview && (
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="text-slate-600">{preview.summary.newCount} new</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-slate-400" />
                      <span className="text-slate-600">{preview.summary.existingCount} existing</span>
                    </div>
                    {preview.summary.blockedCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        <span className="text-slate-600">{preview.summary.blockedCount} blocked</span>
                      </div>
                    )}
                  </div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={loadPreview}
                  disabled={loadingPreview || importing || validating}
                  className="gap-1.5 text-slate-600"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingPreview ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex items-center gap-3 border-b bg-white dark:bg-slate-800 px-6 py-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search SKU, ASIN, title..."
                className="pl-9 h-9"
              />
            </div>

            <div className="flex items-center rounded-lg border bg-slate-50 p-0.5">
              {(['all', 'new', 'existing', 'blocked'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    filter === f
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={selectAllNew}
                disabled={!preview || importing || validating || loadingPreview || selectableItems.length === 0}
                className="text-slate-600"
              >
                Select all
              </Button>
              {selectedSkuCodes.size > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  disabled={importing || validating}
                  className="text-slate-600"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-hidden">
            <div className="h-full overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b">
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 accent-cyan-600"
                        checked={selectableItems.length > 0 && selectableItems.every(item => item.skuCode && selectedSkuCodes.has(item.skuCode.toUpperCase()))}
                        onChange={e => {
                          if (e.target.checked) selectAllNew()
                          else clearSelection()
                        }}
                        disabled={!preview || importing || validating || loadingPreview || selectableItems.length === 0}
                      />
                    </th>
                    <th className="px-4 py-3 w-[180px]">SKU</th>
                    <th className="px-4 py-3 w-[120px]">ASIN</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3 w-[100px] text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingPreview ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-500">
                          <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
                          <span>Loading Amazon listings...</span>
                        </div>
                      </td>
                    </tr>
                  ) : previewError ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <AlertCircle className="h-8 w-8 text-rose-400" />
                          <span className="text-rose-700">{previewError}</span>
                          <Button variant="outline" size="sm" onClick={loadPreview}>
                            Try again
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : !preview || preview.items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-500">
                          <Cloud className="h-8 w-8 text-slate-300" />
                          <span>No listings found in Amazon</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-500">
                          <Search className="h-8 w-8 text-slate-300" />
                          <span>No results match your search</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map(item => {
                      const skuKey = item.skuCode?.toUpperCase() ?? null
                      const isSelectable = Boolean(skuKey) && (item.status === 'new' || item.status === 'existing')
                      const checked = skuKey ? selectedSkuCodes.has(skuKey) : false
                      const validationDetail = skuKey ? validationBySku.get(skuKey) : undefined
                      const validationStatus = validationDetail?.status
                      const isValid = validationStatus === 'imported'
                      const isInvalid = validationStatus && validationStatus !== 'imported'

                      return (
                        <tr
                          key={`${item.sellerSku}-${item.asin ?? ''}`}
                          className={`transition-colors ${
                            checked
                              ? isInvalid
                                ? 'bg-rose-50'
                                : isValid
                                  ? 'bg-emerald-50'
                                  : 'bg-cyan-50'
                              : 'hover:bg-slate-50'
                          } ${!isSelectable ? 'opacity-60' : ''}`}
                        >
                          <td className="px-4 py-3">
                            {isSelectable ? (
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 accent-cyan-600"
                                disabled={importing || validating}
                                checked={checked}
                                onChange={() => skuKey && toggleSkuCode(skuKey)}
                              />
                            ) : (
                              <div className="h-4 w-4" />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{item.skuCode ?? '—'}</div>
                            <div className="text-xs text-slate-500 truncate max-w-[160px]" title={item.sellerSku}>
                              {item.sellerSku}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-slate-600">{item.asin ?? '—'}</span>
                            {item.listingType === 'PARENT' && (
                              <div className="mt-0.5">
                                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-rose-100 text-rose-700">
                                  Parent
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-700 line-clamp-2 text-sm" title={item.title ?? undefined}>
                              {item.title ?? '—'}
                            </div>
                            {isInvalid && validationDetail?.message && (
                              <div className="mt-1 flex items-center gap-1 text-xs text-rose-600">
                                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{validationDetail.message}</span>
                              </div>
                            )}
                            {item.reason && !isInvalid && (
                              <div className="mt-1 text-xs text-slate-500 truncate">{item.reason}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {checked && validatedKey === selectionKey ? (
                              isValid ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  Ready
                                </span>
                              ) : isInvalid ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  Failed
                                </span>
                              ) : (
                                <StatusBadge status={item.status} />
                              )
                            ) : (
                              <StatusBadge status={item.status} />
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Import Results */}
          {result && (
            <div className={`border-t px-6 py-4 ${result.errors.length > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  result.errors.length > 0 ? 'bg-amber-100' : 'bg-emerald-100'
                }`}>
                  {result.errors.length > 0 ? (
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-slate-900">
                    {result.errors.length > 0 ? 'Import completed with warnings' : 'Import successful'}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {result.imported} SKU{result.imported !== 1 ? 's' : ''} imported
                    {result.skipped > 0 && `, ${result.skipped} skipped`}
                  </div>
                  {result.errors.length > 0 && (
                    <div className="mt-2 text-xs text-slate-600">
                      {result.errors.slice(0, 3).map((err, i) => (
                        <div key={i} className="truncate">{err}</div>
                      ))}
                      {result.errors.length > 3 && (
                        <div className="text-slate-500">+{result.errors.length - 3} more</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t bg-slate-50 px-6 py-4">
            <div className="text-sm text-slate-600">
              {selectedSkuCodes.size > 0 ? (
                <span>
                  <span className="font-semibold text-slate-900">{selectedSkuCodes.size}</span> selected
                  {validation && validatedKey === selectionKey && validCount > 0 && (
                    <span className="ml-2 text-emerald-600">
                      ({validCount} ready to import)
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-slate-500">Select products to import</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={handleClose} variant="outline" disabled={importing || validating}>
                {result && result.imported > 0 ? 'Done' : 'Cancel'}
              </Button>

              {currentStep === 'select' || currentStep === 'validate' ? (
                <Button
                  onClick={validateSelection}
                  disabled={selectedSkuCodes.size === 0 || validating || importing}
                  variant={validation && validatedKey === selectionKey ? 'outline' : 'default'}
                  className="gap-2 min-w-[120px]"
                >
                  {validating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Validating...
                    </>
                  ) : validation && validatedKey === selectionKey ? (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Re-validate
                    </>
                  ) : (
                    'Validate'
                  )}
                </Button>
              ) : null}

              <Button
                onClick={handleImport}
                disabled={!canImport}
                className="gap-2 min-w-[120px]"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    Import{canImport ? ` (${validCount})` : ''}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </PortalModal>
    </>
  )
}

function StatusBadge({ status }: { status: 'new' | 'existing' | 'blocked' }) {
  switch (status) {
    case 'new':
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
          New
        </span>
      )
    case 'existing':
      return (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          Existing
        </span>
      )
    case 'blocked':
      return (
        <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700">
          Blocked
        </span>
      )
  }
}
