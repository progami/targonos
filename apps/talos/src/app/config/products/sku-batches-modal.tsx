'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import { usePageState } from '@/lib/store/page-state'
import { useTenantCode } from '@/lib/tenant'
import { Boxes, Loader2, Plus, Trash2, X } from '@/lib/lucide-icons'
import { SHIPMENT_PLANNING_CONFIG } from '@/lib/config/shipment-planning'
import { cn } from '@/lib/utils'
import { coerceFiniteNumber, resolveDimensionTripletCm } from '@/lib/sku-dimensions'
import { getDefaultUnitSystem } from '@/lib/measurements'

interface SkuSummary {
  id: string
  skuCode: string
  description: string
  unitDimensionsCm: string | null
  amazonReferenceWeightKg: number | string | null
  itemDimensionsCm: string | null
  itemSide1Cm: number | string | null
  itemSide2Cm: number | string | null
  itemSide3Cm: number | string | null
  itemWeightKg: number | string | null
}

interface BatchRow {
  id: string
  batchCode: string
  description: string | null
  packSize: number | null
  unitsPerCarton: number | null
  material: string | null
  packagingType: string | null
  amazonSizeTier: string | null
  amazonFbaFulfillmentFee: number | string | null
  amazonReferenceWeightKg: number | string | null
  storageCartonsPerPallet: number | null
  shippingCartonsPerPallet: number | null
  cartonDimensionsCm: string | null
  cartonSide1Cm: number | string | null
  cartonSide2Cm: number | string | null
  cartonSide3Cm: number | string | null
  cartonWeightKg: number | string | null
  createdAt: string
  updatedAt: string
}

interface BatchFormState {
  batchCode: string
  description: string
  packSize: string
  unitsPerCarton: string
  material: string
  packagingType: PackagingTypeOption
  storageCartonsPerPallet: string
  shippingCartonsPerPallet: string
  cartonLength: string
  cartonWidth: string
  cartonHeight: string
  cartonWeight: string
}

type UnitSystem = 'metric' | 'imperial'

type BatchMeasurementState = {
  cartonSide1Cm: number | null
  cartonSide2Cm: number | null
  cartonSide3Cm: number | null
  cartonWeightKg: number | null
}

type PackagingTypeOption = '' | 'BOX' | 'POLYBAG'

const UNIT_SYSTEM_STORAGE_KEY = 'talos:unit-system'
const CM_PER_INCH = 2.54
const LB_PER_KG = 2.2046226218
const DEFAULT_CARTONS_PER_PALLET = SHIPMENT_PLANNING_CONFIG.DEFAULT_CARTONS_PER_PALLET

function normalizePackagingType(value: string | null | undefined): PackagingTypeOption {
  if (!value) return ''
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (normalized === 'BOX') return 'BOX'
  if (normalized === 'POLYBAG') return 'POLYBAG'
  return ''
}

function stripTrailingZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value
}

function formatNumber(value: number, decimals: number): string {
  return stripTrailingZeros(value.toFixed(decimals))
}

function buildMeasurementState(batch?: BatchRow | null): BatchMeasurementState {
  const cartonTriplet = resolveDimensionTripletCm({
    side1Cm: batch?.cartonSide1Cm,
    side2Cm: batch?.cartonSide2Cm,
    side3Cm: batch?.cartonSide3Cm,
    legacy: batch?.cartonDimensionsCm,
  })

  return {
    cartonSide1Cm: cartonTriplet?.side1Cm ?? null,
    cartonSide2Cm: cartonTriplet?.side2Cm ?? null,
    cartonSide3Cm: cartonTriplet?.side3Cm ?? null,
    cartonWeightKg: coerceFiniteNumber(batch?.cartonWeightKg),
  }
}

function formatDimensionFromCm(valueCm: number | null, unitSystem: UnitSystem): string {
  if (valueCm === null) return ''
  const resolved = unitSystem === 'imperial' ? valueCm / CM_PER_INCH : valueCm
  return formatNumber(resolved, 2)
}

function formatWeightFromKg(valueKg: number | null, unitSystem: UnitSystem): string {
  if (valueKg === null) return ''
  const resolved = unitSystem === 'imperial' ? valueKg * LB_PER_KG : valueKg
  return formatNumber(resolved, 3)
}

function formatMeasurementFields(
  measurements: BatchMeasurementState,
  unitSystem: UnitSystem
): Pick<BatchFormState, 'cartonLength' | 'cartonWidth' | 'cartonHeight' | 'cartonWeight'> {
  return {
    cartonLength: formatDimensionFromCm(measurements.cartonSide1Cm, unitSystem),
    cartonWidth: formatDimensionFromCm(measurements.cartonSide2Cm, unitSystem),
    cartonHeight: formatDimensionFromCm(measurements.cartonSide3Cm, unitSystem),
    cartonWeight: formatWeightFromKg(measurements.cartonWeightKg, unitSystem),
  }
}

function buildBatchFormState(
  batch: BatchRow | null | undefined,
  unitSystem: UnitSystem,
  measurements: BatchMeasurementState
): BatchFormState {
  return {
    batchCode: batch?.batchCode ?? '',
    description: batch?.description ?? '',
    packSize: batch?.packSize?.toString() ?? '1',
    unitsPerCarton: batch?.unitsPerCarton?.toString() ?? '1',
    material: batch?.material ?? '',
    packagingType: normalizePackagingType(batch?.packagingType),
    storageCartonsPerPallet:
      batch?.storageCartonsPerPallet?.toString() ?? `${DEFAULT_CARTONS_PER_PALLET}`,
    shippingCartonsPerPallet:
      batch?.shippingCartonsPerPallet?.toString() ?? `${DEFAULT_CARTONS_PER_PALLET}`,
    ...formatMeasurementFields(measurements, unitSystem),
  }
}

function parsePositiveInt(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

function parsePositiveNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

export function SkuBatchesModal({
  isOpen,
  onClose,
  onBatchesUpdated,
  sku,
}: {
  isOpen: boolean
  onClose: () => void
  onBatchesUpdated?: () => void
  sku: SkuSummary | null
}) {
  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !sku) return null

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-5xl">
        <SkuBatchesManager sku={sku} onRequestClose={onClose} onBatchesUpdated={onBatchesUpdated} />
      </div>
    </div>
  )
}

export function SkuBatchesPanel({
  sku,
  onClose,
  onBatchesUpdated,
}: {
  sku: SkuSummary | null
  onClose?: () => void
  onBatchesUpdated?: () => void
}) {
  if (!sku) return null

  return (
    <SkuBatchesManager sku={sku} onRequestClose={onClose} onBatchesUpdated={onBatchesUpdated} />
  )
}

function SkuBatchesManager({
  sku,
  onRequestClose,
  onBatchesUpdated,
}: {
  sku: SkuSummary
  onRequestClose?: () => void
  onBatchesUpdated?: () => void
}) {
  const pageState = usePageState(`/config/products/batches/${sku.id}`)
  const batchSearch = pageState.search ?? ''
  const setBatchSearch = pageState.setSearch
  const [batches, setBatches] = useState<BatchRow[]>([])
  const [loading, setLoading] = useState(false)

  const tenantCode = useTenantCode()
  const defaultUnitSystem = getDefaultUnitSystem(tenantCode)

  const [unitSystem, setUnitSystem] = useState<UnitSystem>(defaultUnitSystem)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingBatch, setEditingBatch] = useState<BatchRow | null>(null)
  const [measurements, setMeasurements] = useState<BatchMeasurementState>(() =>
    buildMeasurementState(null)
  )
  const [formState, setFormState] = useState<BatchFormState>(() =>
    buildBatchFormState(null, defaultUnitSystem, buildMeasurementState(null))
  )

  const [confirmDelete, setConfirmDelete] = useState<BatchRow | null>(null)

  // Handle ESC key to close form modal or main panel
  // Note: closeForm is defined later but React hoists function definitions
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (confirmDelete) {
          setConfirmDelete(null)
        } else if (isFormOpen && !isSubmitting) {
          setIsFormOpen(false)
          setEditingBatch(null)
          setMeasurements(buildMeasurementState(null))
          setFormState(buildBatchFormState(null, unitSystem, buildMeasurementState(null)))
        } else if (onRequestClose) {
          onRequestClose()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isFormOpen, isSubmitting, confirmDelete, onRequestClose, unitSystem])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(UNIT_SYSTEM_STORAGE_KEY)
      if (saved === 'metric' || saved === 'imperial') {
        setUnitSystem(saved)
      }
    } catch {
      // ignore
    }
  }, [])

  const applyUnitSystem = useCallback(
    (nextSystem: UnitSystem) => {
      setUnitSystem(prevSystem => {
        if (prevSystem === nextSystem) return prevSystem
        try {
          window.localStorage.setItem(UNIT_SYSTEM_STORAGE_KEY, nextSystem)
        } catch {
          // ignore
        }
        return nextSystem
      })

      if (isFormOpen) {
        setFormState(prev => ({
          ...prev,
          ...formatMeasurementFields(measurements, nextSystem),
        }))
      }
    },
    [isFormOpen, measurements]
  )

  const filteredBatches = useMemo(() => {
    const term = batchSearch.trim().toLowerCase()
    if (!term) return batches
    return batches.filter(batch => {
      const batchCode = typeof batch.batchCode === 'string' ? batch.batchCode : ''
      const description = typeof batch.description === 'string' ? batch.description : ''
      return batchCode.toLowerCase().includes(term) || description.toLowerCase().includes(term)
    })
  }, [batchSearch, batches])

  const fetchBatches = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/skus/${encodeURIComponent(sku.id)}/batches`, {
        credentials: 'include',
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to load batches')
      }

      const payload = await response.json()
      setBatches(Array.isArray(payload?.batches) ? payload.batches : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load batches')
      setBatches([])
    } finally {
      setLoading(false)
    }
  }, [sku.id])

  useEffect(() => {
    void fetchBatches()
  }, [fetchBatches])

  const openCreate = () => {
    const nextMeasurements = buildMeasurementState(null)
    setEditingBatch(null)
    setMeasurements(nextMeasurements)
    const nextFormState = buildBatchFormState(null, unitSystem, nextMeasurements)
    setFormState(nextFormState)
    setIsFormOpen(true)
  }

  const openEdit = (batch: BatchRow) => {
    const nextMeasurements = buildMeasurementState(batch)
    setEditingBatch(batch)
    setMeasurements(nextMeasurements)
    setFormState(buildBatchFormState(batch, unitSystem, nextMeasurements))
    setIsFormOpen(true)
  }

  const closeForm = useCallback(() => {
    if (isSubmitting) return
    const nextMeasurements = buildMeasurementState(null)
    setIsFormOpen(false)
    setEditingBatch(null)
    setMeasurements(nextMeasurements)
    setFormState(buildBatchFormState(null, unitSystem, nextMeasurements))
  }, [isSubmitting, unitSystem])

  type DimensionFieldKey = 'cartonLength' | 'cartonWidth' | 'cartonHeight'

  type WeightFieldKey = 'cartonWeight'

  const dimensionFieldToMeasurementKey: Record<DimensionFieldKey, keyof BatchMeasurementState> = {
    cartonLength: 'cartonSide1Cm',
    cartonWidth: 'cartonSide2Cm',
    cartonHeight: 'cartonSide3Cm',
  }

  const weightFieldToMeasurementKey: Record<WeightFieldKey, keyof BatchMeasurementState> = {
    cartonWeight: 'cartonWeightKg',
  }

  const handleDimensionChange = (field: DimensionFieldKey, raw: string) => {
    setFormState(prev => ({ ...prev, [field]: raw }))
    const trimmed = raw.trim()
    if (!trimmed) {
      setMeasurements(prev => ({ ...prev, [dimensionFieldToMeasurementKey[field]]: null }))
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) return
    const resolved = unitSystem === 'imperial' ? parsed * CM_PER_INCH : parsed
    setMeasurements(prev => ({ ...prev, [dimensionFieldToMeasurementKey[field]]: resolved }))
  }

  const handleWeightChange = (field: WeightFieldKey, raw: string) => {
    setFormState(prev => ({ ...prev, [field]: raw }))
    const trimmed = raw.trim()
    if (!trimmed) {
      setMeasurements(prev => ({ ...prev, [weightFieldToMeasurementKey[field]]: null }))
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) return
    const resolved = unitSystem === 'imperial' ? parsed / LB_PER_KG : parsed
    setMeasurements(prev => ({ ...prev, [weightFieldToMeasurementKey[field]]: resolved }))
  }

  const submitBatch = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isSubmitting) return

    if (!formState.batchCode.trim()) {
      toast.error('Batch code is required')
      return
    }

    const packSize = parsePositiveInt(formState.packSize)
    if (!packSize) {
      toast.error('Pack size must be a positive integer')
      return
    }

    const unitsPerCarton = parsePositiveInt(formState.unitsPerCarton)
    if (!unitsPerCarton) {
      toast.error('Units per carton must be a positive integer')
      return
    }

    const storageCartonsPerPallet = parsePositiveInt(formState.storageCartonsPerPallet)
    if (!storageCartonsPerPallet) {
      toast.error('Storage cartons per pallet must be a positive integer')
      return
    }

    const shippingCartonsPerPallet = parsePositiveInt(formState.shippingCartonsPerPallet)
    if (!shippingCartonsPerPallet) {
      toast.error('Shipping cartons per pallet must be a positive integer')
      return
    }

    const cartonWeightProvided = Boolean(formState.cartonWeight.trim())
    if (cartonWeightProvided && !parsePositiveNumber(formState.cartonWeight)) {
      toast.error('Carton weight must be a positive number')
      return
    }

    const validateDimensions = (
      dims: { length: string; width: string; height: string },
      label: string
    ) => {
      const parts = [dims.length.trim(), dims.width.trim(), dims.height.trim()]
      const any = parts.some(Boolean)
      if (!any) return true
      const all = parts.every(Boolean)
      if (!all) {
        toast.error(`${label} dimensions require L, W, and H`)
        return false
      }
      if (parts.some(part => parsePositiveNumber(part) === null)) {
        toast.error(`${label} dimensions must be positive numbers`)
        return false
      }
      return true
    }

    if (
      !validateDimensions(
        {
          length: formState.cartonLength,
          width: formState.cartonWidth,
          height: formState.cartonHeight,
        },
        'Carton'
      )
    ) {
      return
    }

    setIsSubmitting(true)
    try {
      const roundDimensionCm = (value: number | null): number | null =>
        value === null ? null : Number(value.toFixed(2))

      const roundWeightKg = (value: number | null): number | null =>
        value === null ? null : Number(value.toFixed(3))

      const payload = {
        batchCode: formState.batchCode.trim(),
        description: formState.description.trim() ? formState.description.trim() : null,
        packSize,
        unitsPerCarton,
        material: formState.material.trim() ? formState.material.trim() : null,
        packagingType: formState.packagingType ? formState.packagingType : null,
        storageCartonsPerPallet,
        shippingCartonsPerPallet,
        cartonSide1Cm: roundDimensionCm(measurements.cartonSide1Cm),
        cartonSide2Cm: roundDimensionCm(measurements.cartonSide2Cm),
        cartonSide3Cm: roundDimensionCm(measurements.cartonSide3Cm),
        cartonWeightKg: roundWeightKg(measurements.cartonWeightKg),
      }

      const endpoint = editingBatch
        ? `/api/skus/${encodeURIComponent(sku.id)}/batches/${encodeURIComponent(editingBatch.id)}`
        : `/api/skus/${encodeURIComponent(sku.id)}/batches`
      const method = editingBatch ? 'PATCH' : 'POST'

      const response = await fetchWithCSRF(endpoint, {
        method,
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to save batch')
      }

      toast.success(editingBatch ? 'Batch updated' : 'Batch created')
      closeForm()
      await fetchBatches()
      onBatchesUpdated?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save batch')
    } finally {
      setIsSubmitting(false)
    }
  }

  const deleteBatch = async (batch: BatchRow) => {
    try {
      const response = await fetchWithCSRF(
        `/api/skus/${encodeURIComponent(sku.id)}/batches/${encodeURIComponent(batch.id)}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to delete batch')
      }

      toast.success('Batch deleted')
      await fetchBatches()
      onBatchesUpdated?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete batch')
    }
  }

  const handleClose = () => {
    if (isSubmitting) return
    const nextMeasurements = buildMeasurementState(null)
    setIsFormOpen(false)
    setEditingBatch(null)
    setMeasurements(nextMeasurements)
    setFormState(buildBatchFormState(null, unitSystem, nextMeasurements))
    setBatchSearch('')
    setBatches([])
    onRequestClose?.()
  }

  return (
    <>
      <div className="w-full overflow-hidden rounded-lg border bg-white dark:bg-slate-800 shadow-soft">
        <div className="flex items-start justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Batches</h2>
          {onRequestClose ? (
            <Button variant="ghost" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        <div className="space-y-4 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-72">
                <Input
                  value={batchSearch}
                  onChange={event => setBatchSearch(event.target.value)}
                  placeholder="Search batch code or description"
                />
              </div>
            </div>

            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              New Batch
            </Button>
          </div>

          <div className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft">
            {loading ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filteredBatches.length === 0 ? (
              <div className="p-10">
                <EmptyState
                  icon={Boxes}
                  title={batchSearch ? 'No batches found' : 'No batches yet'}
                  description={
                    batchSearch
                      ? 'Clear your search or create a new batch.'
                      : 'Create a batch to define pack specs, dimensions, and cartons-per-pallet values.'
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Batch</th>
                      <th className="px-3 py-2 text-right font-semibold">Pack</th>
                      <th className="px-3 py-2 text-right font-semibold">Units/Ctn</th>
                      <th className="px-3 py-2 text-left font-semibold">Material</th>
                      <th className="px-3 py-2 text-left font-semibold">Packaging</th>
                      <th className="px-3 py-2 text-right font-semibold">Storage CPP</th>
                      <th className="px-3 py-2 text-right font-semibold">Ship CPP</th>
                      <th className="px-3 py-2 text-right font-semibold">Carton Dims ({unitSystem === 'metric' ? 'cm' : 'in'})</th>
                      <th className="px-3 py-2 text-right font-semibold">Carton Wt ({unitSystem === 'metric' ? 'kg' : 'lb'})</th>
                      <th className="px-3 py-2 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBatches.map(batch => {
                      const cartonTriplet = resolveDimensionTripletCm({
                        side1Cm: batch.cartonSide1Cm,
                        side2Cm: batch.cartonSide2Cm,
                        side3Cm: batch.cartonSide3Cm,
                        legacy: batch.cartonDimensionsCm,
                      })

                      const formatTriplet = (triplet: typeof cartonTriplet) => {
                        if (!triplet) return '—'

                        const side1 = unitSystem === 'imperial' ? triplet.side1Cm / CM_PER_INCH : triplet.side1Cm
                        const side2 = unitSystem === 'imperial' ? triplet.side2Cm / CM_PER_INCH : triplet.side2Cm
                        const side3 = unitSystem === 'imperial' ? triplet.side3Cm / CM_PER_INCH : triplet.side3Cm

                        return `${formatNumber(side1, 2)}×${formatNumber(side2, 2)}×${formatNumber(side3, 2)}`
                      }

                      const batchCode = typeof batch.batchCode === 'string' ? batch.batchCode : '—'
                      const canDelete = batches.length > 1

                      return (
                        <tr key={batch.id} className="odd:bg-muted/20">
                          <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openEdit(batch)}
                              className="text-left hover:text-primary hover:underline transition-colors"
                            >
                              {batchCode}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                            {batch.packSize ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                            {batch.unitsPerCarton ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {batch.material ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {batch.packagingType ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                            {batch.storageCartonsPerPallet ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                            {batch.shippingCartonsPerPallet ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                            {formatTriplet(cartonTriplet)}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                            {(() => {
                              if (batch.cartonWeightKg == null) return '—'
                              const weightKg = Number(batch.cartonWeightKg)
                              if (!Number.isFinite(weightKg)) return '—'
                              const resolved = unitSystem === 'imperial' ? weightKg * LB_PER_KG : weightKg
                              return formatNumber(resolved, 2)
                            })()}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirmDelete(batch)}
                              disabled={!canDelete}
                            >
                              <Trash2 className="h-4 w-4" />
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
        </div>
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div
            className="absolute inset-0"
            onClick={() => !isSubmitting && closeForm()}
            aria-hidden="true"
          />
          <div className="relative flex w-full max-w-2xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-lg bg-white dark:bg-slate-800 shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div className="flex flex-col">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {editingBatch ? 'Edit Batch' : 'New Batch'}
                </h2>
                <p className="text-xs text-muted-foreground">{sku.skuCode}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 p-1">
                  <button
                    type="button"
                    onClick={() => applyUnitSystem('metric')}
                    className={cn(
                      'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                      unitSystem === 'metric'
                        ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    )}
                    aria-pressed={unitSystem === 'metric'}
                  >
                    cm/kg
                  </button>
                  <button
                    type="button"
                    onClick={() => applyUnitSystem('imperial')}
                    className={cn(
                      'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                      unitSystem === 'imperial'
                        ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    )}
                    aria-pressed={unitSystem === 'imperial'}
                  >
                    in/lb
                  </button>
                </div>
                <Button variant="ghost" onClick={closeForm} disabled={isSubmitting}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <form onSubmit={submitBatch} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="batchCode">Batch Code</Label>
                    <Input
                      id="batchCode"
                      value={formState.batchCode}
                      onChange={event =>
                        setFormState(prev => ({ ...prev, batchCode: event.target.value }))
                      }
                      disabled={isSubmitting}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="batchDescription">Description</Label>
                    <Input
                      id="batchDescription"
                      value={formState.description}
                      onChange={event =>
                        setFormState(prev => ({ ...prev, description: event.target.value }))
                      }
                      placeholder="Optional"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="packSize">Pack Size</Label>
                    <Input
                      id="packSize"
                      type="number"
                      min={1}
                      value={formState.packSize}
                      onChange={event =>
                        setFormState(prev => ({ ...prev, packSize: event.target.value }))
                      }
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="unitsPerCarton">Units per Carton</Label>
                    <Input
                      id="unitsPerCarton"
                      type="number"
                      min={1}
                      value={formState.unitsPerCarton}
                      onChange={event =>
                        setFormState(prev => ({ ...prev, unitsPerCarton: event.target.value }))
                      }
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="storageCartonsPerPallet">Storage Cartons / Pallet</Label>
                    <Input
                      id="storageCartonsPerPallet"
                      type="number"
                      min={1}
                      step={1}
                      value={formState.storageCartonsPerPallet}
                      onChange={event =>
                        setFormState(prev => ({
                          ...prev,
                          storageCartonsPerPallet: event.target.value,
                        }))
                      }
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="shippingCartonsPerPallet">Shipping Cartons / Pallet</Label>
                    <Input
                      id="shippingCartonsPerPallet"
                      type="number"
                      min={1}
                      step={1}
                      value={formState.shippingCartonsPerPallet}
                      onChange={event =>
                        setFormState(prev => ({
                          ...prev,
                          shippingCartonsPerPallet: event.target.value,
                        }))
                      }
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="material">Material</Label>
                    <Input
                      id="material"
                      value={formState.material}
                      onChange={event =>
                        setFormState(prev => ({ ...prev, material: event.target.value }))
                      }
                      placeholder="Optional"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="packagingType">Packaging Type</Label>
                    <select
                      id="packagingType"
                      value={formState.packagingType}
                      onChange={event =>
                        setFormState(prev => ({
                          ...prev,
                          packagingType: event.target.value as PackagingTypeOption,
                        }))
                      }
                      className="w-full rounded-md border border-border/60 bg-white dark:bg-slate-800 px-3 py-2 text-sm shadow-soft focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">Optional</option>
                      <option value="BOX">Box</option>
                      <option value="POLYBAG">Polybag</option>
                    </select>
                  </div>

                  <div className="md:col-span-2 pt-4 border-t">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Carton Dimensions</h3>
                    <div className="rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label>Dimensions ({unitSystem === 'metric' ? 'cm' : 'in'})</Label>
                          <div className="grid grid-cols-3 gap-2">
                            <Input
                              value={formState.cartonLength}
                              onChange={event =>
                                handleDimensionChange('cartonLength', event.target.value)
                              }
                              placeholder="S1"
                              inputMode="decimal"
                            />
                            <Input
                              value={formState.cartonWidth}
                              onChange={event => handleDimensionChange('cartonWidth', event.target.value)}
                              placeholder="S2"
                              inputMode="decimal"
                            />
                            <Input
                              value={formState.cartonHeight}
                              onChange={event =>
                                handleDimensionChange('cartonHeight', event.target.value)
                              }
                              placeholder="S3"
                              inputMode="decimal"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="cartonWeight">
                            Weight ({unitSystem === 'metric' ? 'kg' : 'lb'})
                          </Label>
                          <Input
                            id="cartonWeight"
                            type="number"
                            step="0.001"
                            min={0.001}
                            value={formState.cartonWeight}
                            onChange={event => handleWeightChange('cartonWeight', event.target.value)}
                            placeholder="Optional"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeForm}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving…
                      </span>
                    ) : (
                      'Save'
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return
          void deleteBatch(confirmDelete)
        }}
        title="Delete batch?"
        message={confirmDelete ? `Delete ${confirmDelete.batchCode}? This cannot be undone.` : ''}
        confirmText="Delete"
        type="danger"
      />
    </>
  )
}
