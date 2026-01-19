'use client'

import Link from 'next/link'
import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
import { toast } from 'react-hot-toast'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FileEdit, Loader2, Plus, Trash2, AlertTriangle, Package, FileText } from '@/lib/lucide-icons'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import { formatDimensionTripletCm, resolveDimensionTripletCm } from '@/lib/sku-dimensions'

interface Supplier {
  id: string
  name: string
  contactName: string | null
  defaultPaymentTerms: string | null
  defaultIncoterms: string | null
}

interface Sku {
  id: string
  skuCode: string
  description: string
}

interface BatchOption {
  batchCode: string
  unitsPerCarton: number | null
  cartonDimensionsCm: string | null
  cartonSide1Cm: number | null
  cartonSide2Cm: number | null
  cartonSide3Cm: number | null
  cartonWeightKg: number | null
  packagingType: string | null
}

interface LineItem {
  id: string
  skuId?: string
  skuCode: string
  skuDescription: string
  batchLot: string
  unitsOrdered: number
  unitsPerCarton: number | null
  totalCost: string
  currency: string
  notes: string
}

const INCOTERMS_OPTIONS = ['EXW', 'FOB', 'FCA', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'] as const
const CURRENCY_OPTIONS = ['USD', 'GBP', 'EUR', 'CNY'] as const

function generateTempId() {
  return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [tenantDestination, setTenantDestination] = useState<string>('United States (US)')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [skus, setSkus] = useState<Sku[]>([])
  const [batchesBySkuId, setBatchesBySkuId] = useState<Record<string, BatchOption[]>>({})
  const [batchesLoadingBySkuId, setBatchesLoadingBySkuId] = useState<Record<string, boolean>>({})
  const [formData, setFormData] = useState({
    supplierId: '',
    currency: 'USD',
    expectedDate: '',
    incoterms: '',
    paymentTerms: '',
    notes: '',
  })
  const selectedSupplier = suppliers.find(supplier => supplier.id === formData.supplierId) ?? null
  const [activeTab, setActiveTab] = useState<'details' | 'attributes'>('details')
  const [showAttributesConfirm, setShowAttributesConfirm] = useState(false)
  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: generateTempId(),
      skuId: undefined,
      skuCode: '',
      skuDescription: '',
      batchLot: '',
      unitsOrdered: 1,
      unitsPerCarton: null,
      totalCost: '',
      currency: formData.currency,
      notes: '',
    },
  ])

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      redirectToPortal('/login', `${window.location.origin}${withBasePath('/operations/purchase-orders/new')}`)
      return
    }
    if (!['staff', 'admin'].includes(session.user.role)) {
      router.push('/dashboard')
      return
    }

    const loadData = async () => {
      try {
        const [tenantRes, suppliersRes, skusRes] = await Promise.all([
          fetch('/api/tenant/current'),
          fetch('/api/suppliers'),
          fetch('/api/skus'),
        ])

        if (tenantRes.ok) {
          const tenantData = await tenantRes.json().catch(() => null)
          const tenantName = tenantData?.current?.name
          const tenantCode = tenantData?.current?.displayName ?? tenantData?.current?.code
          if (typeof tenantName === 'string' && tenantName.trim()) {
            const label =
              typeof tenantCode === 'string' && tenantCode.trim()
                ? `${tenantName.trim()} (${tenantCode.trim().toUpperCase()})`
                : tenantName.trim()
            setTenantDestination(label)
          }
        }

        if (suppliersRes.ok) {
          const suppliersData = await suppliersRes.json()
          const suppliersList = suppliersData?.data || suppliersData || []
          setSuppliers(Array.isArray(suppliersList) ? suppliersList : [])
        }

        if (skusRes.ok) {
          const skusData = await skusRes.json()
          setSkus(Array.isArray(skusData) ? skusData : [])
        }
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [router, session, status])

  const handleCurrencyChange = (nextCurrency: string) => {
    const normalized = nextCurrency.trim().toUpperCase()
    if (!normalized) return
    setFormData(prev => ({ ...prev, currency: normalized }))
    setLineItems(prev => prev.map(item => ({ ...item, currency: normalized })))
  }

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      {
        id: generateTempId(),
        skuId: undefined,
        skuCode: '',
        skuDescription: '',
        batchLot: '',
        unitsOrdered: 1,
        unitsPerCarton: null,
        totalCost: '',
        currency: formData.currency,
        notes: '',
      },
    ])
  }

  const ensureSkuBatchesLoaded = async (skuId: string) => {
    if (!skuId || batchesBySkuId[skuId] || batchesLoadingBySkuId[skuId]) return

    setBatchesLoadingBySkuId(prev => ({ ...prev, [skuId]: true }))
    try {
      const response = await fetch(`/api/skus/${encodeURIComponent(skuId)}/batches`, {
        credentials: 'include',
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to load batches')
      }

      const payload = await response.json().catch(() => null)
      const batches = Array.isArray(payload?.batches) ? payload.batches : []

      const coercePositiveInt = (value: unknown): number | null => {
        if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null
        if (typeof value === 'string' && value.trim()) {
          const parsed = Number(value.trim())
          return Number.isInteger(parsed) && parsed > 0 ? parsed : null
        }
        return null
      }
      const coercePositiveNumber = (value: unknown): number | null => {
        if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
        if (typeof value === 'string' && value.trim()) {
          const parsed = Number(value.trim())
          return Number.isFinite(parsed) && parsed > 0 ? parsed : null
        }
        return null
      }
      const coerceString = (value: unknown): string | null => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed || null
      }

      const parsedBatches: BatchOption[] = batches
        .map((batch: Record<string, unknown>): BatchOption | null => {
          const batchCode = String(batch?.batchCode ?? '').trim().toUpperCase()
          if (!batchCode || batchCode === 'DEFAULT') return null
          return {
            batchCode,
            unitsPerCarton: coercePositiveInt(batch?.unitsPerCarton),
            cartonDimensionsCm: coerceString(batch?.cartonDimensionsCm),
            cartonSide1Cm: coercePositiveNumber(batch?.cartonSide1Cm),
            cartonSide2Cm: coercePositiveNumber(batch?.cartonSide2Cm),
            cartonSide3Cm: coercePositiveNumber(batch?.cartonSide3Cm),
            cartonWeightKg: coercePositiveNumber(batch?.cartonWeightKg),
            packagingType: coerceString(batch?.packagingType)?.toUpperCase() ?? null,
          }
        })
        .filter((batch): batch is BatchOption => Boolean(batch))

      const unique = Array.from(new Map(parsedBatches.map(batch => [batch.batchCode, batch])).values())

      setBatchesBySkuId(prev => ({ ...prev, [skuId]: unique }))
      setLineItems(prev =>
        prev.map(item => {
          if (item.skuId !== skuId) return item
          if (unique.length === 0) return { ...item, batchLot: '', unitsPerCarton: null }

          const selectedCode =
            item.batchLot && unique.some(batch => batch.batchCode === item.batchLot)
              ? item.batchLot
              : unique[0].batchCode
          const selectedBatch = unique.find(batch => batch.batchCode === selectedCode)
          return { ...item, batchLot: selectedCode, unitsPerCarton: selectedBatch?.unitsPerCarton ?? null }
        })
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load batches')
      setBatchesBySkuId(prev => ({ ...prev, [skuId]: [] }))
    } finally {
      setBatchesLoadingBySkuId(prev => ({ ...prev, [skuId]: false }))
    }
  }

  const updateLineItem = (id: string, field: keyof LineItem, value: LineItem[keyof LineItem]) => {
    if (field === 'skuCode') {
      const skuCode = String(value)
      const selectedSku = skus.find(s => s.skuCode === skuCode)
      if (!selectedSku) {
        setLineItems(prev =>
          prev.map(item =>
            item.id === id
              ? { ...item, skuId: undefined, skuCode: '', skuDescription: '', batchLot: '', unitsPerCarton: null }
              : item
          )
        )
        return
      }

      setLineItems(prev =>
        prev.map(item =>
          item.id === id
            ? { ...item, skuId: selectedSku.id, skuCode: selectedSku.skuCode, skuDescription: selectedSku.description || '', batchLot: '', unitsPerCarton: null }
            : item
        )
      )
      void ensureSkuBatchesLoaded(selectedSku.id)
      return
    }

    if (field === 'batchLot') {
      const batchLot = String(value).trim().toUpperCase()
      setLineItems(prev =>
        prev.map(item => {
          if (item.id !== id) return item
          if (!item.skuId) return { ...item, batchLot }

          const batches = batchesBySkuId[item.skuId] ?? []
          const selectedBatch = batches.find(batch => batch.batchCode === batchLot)
          return { ...item, batchLot, unitsPerCarton: selectedBatch?.unitsPerCarton ?? null }
        })
      )
      return
    }

    setLineItems(prev =>
      prev.map(item => (item.id === id ? ({ ...item, [field]: value } as LineItem) : item))
    )
  }

  const removeLineItem = (id: string) => {
    setLineItems(prev => prev.filter(item => item.id !== id))
  }

  const handleSupplierChange = (supplierId: string) => {
    const nextSupplier = suppliers.find(supplier => supplier.id === supplierId)
    setFormData(prev => ({
      ...prev,
      supplierId,
      paymentTerms: nextSupplier?.defaultPaymentTerms?.trim() || '',
      incoterms: nextSupplier?.defaultIncoterms?.trim().toUpperCase() || '',
    }))
  }

  const parseMoney = (value: string): number | null => {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < 0) return null
    return parsed
  }

  const validateForm = (): boolean => {
    if (!formData.supplierId) { toast.error('Please select a supplier'); return false }
    if (!formData.expectedDate) { toast.error('Please set a cargo ready date'); return false }
    if (!formData.incoterms) { toast.error('Please select incoterms'); return false }
    if (!formData.paymentTerms.trim()) { toast.error('Please enter payment terms'); return false }
    if (lineItems.length === 0) { toast.error('Please add at least one line item'); return false }

    const isPositiveInteger = (value: unknown): value is number =>
      typeof value === 'number' && Number.isInteger(value) && value > 0

    const invalidLines = lineItems.filter(item => {
      if (!item.skuCode) return true
      if (!item.batchLot.trim() || item.batchLot.trim().toUpperCase() === 'DEFAULT') return true
      if (!isPositiveInteger(item.unitsOrdered)) return true
      if (!isPositiveInteger(item.unitsPerCarton)) return true
      return false
    })
    if (invalidLines.length > 0) {
      toast.error('Please fill in SKU, batch, units ordered, and units per carton for all line items')
      return false
    }

    if (!selectedSupplier) { toast.error('Invalid supplier selected'); return false }

    const invalidCostLine = lineItems.find(line => line.totalCost.trim() && parseMoney(line.totalCost) === null)
    if (invalidCostLine) {
      toast.error(`Invalid cost for SKU ${invalidCostLine.skuCode || 'line item'}`)
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    // Show attributes confirmation modal
    setShowAttributesConfirm(true)
  }

  const handleConfirmAndCreate = async () => {
    setShowAttributesConfirm(false)
    setSubmitting(true)
    try {
      const response = await fetchWithCSRF('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counterpartyName: selectedSupplier.name,
          expectedDate: formData.expectedDate,
          incoterms: formData.incoterms,
          paymentTerms: formData.paymentTerms.trim(),
          notes: formData.notes || undefined,
          lines: lineItems.map(item => ({
            skuCode: item.skuCode,
            skuDescription: item.skuDescription,
            batchLot: item.batchLot.trim().toUpperCase(),
            unitsOrdered: item.unitsOrdered,
            unitsPerCarton: item.unitsPerCarton ?? 1,
            ...(parseMoney(item.totalCost) !== null ? { totalCost: parseMoney(item.totalCost) ?? 0 } : {}),
            currency: item.currency,
            notes: item.notes || undefined,
          })),
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || error.message || 'Failed to create purchase order')
      }

      const data = await response.json()
      toast.success('Purchase order created')
      router.push(`/operations/purchase-orders/${data.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create purchase order')
    } finally {
      setSubmitting(false)
    }
  }

  // Calculate totals
  const totals = lineItems.reduce(
    (acc, item) => {
      acc.units += item.unitsOrdered > 0 ? item.unitsOrdered : 0
      if (item.unitsPerCarton && item.unitsOrdered > 0) {
        acc.cartons += Math.ceil(item.unitsOrdered / item.unitsPerCarton)
      }
      const cost = parseMoney(item.totalCost)
      if (cost !== null) acc.cost += cost
      return acc
    },
    { units: 0, cartons: 0, cost: 0 }
  )

  if (status === 'loading' || loading) {
    return (
      <PageContainer>
        <PageContent className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </PageContent>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeaderSection
        title="New Purchase Order"
        description="Operations"
        icon={FileEdit}
        backHref="/operations/purchase-orders"
        backLabel="Back"
      />
      <PageContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Order Details */}
          <div className="rounded-xl border bg-white dark:bg-slate-800 p-5">
            <h3 className="text-sm font-semibold mb-4">Order Details</h3>

            {/* Row 1: Supplier + Ship To */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Supplier *</label>
                <select
                  value={formData.supplierId}
                  onChange={e => handleSupplierChange(e.target.value)}
                  className="w-full h-10 px-3 border rounded-md bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                >
                  <option value="">Select supplier...</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}{supplier.contactName ? ` — ${supplier.contactName}` : ''}
                    </option>
                  ))}
                </select>
                {suppliers.length === 0 && !loading && (
                  <p className="text-xs text-muted-foreground mt-1">
                    No suppliers configured. <Link href="/config/suppliers" className="text-primary hover:underline">Add one →</Link>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Ship To</label>
                <div className="h-10 px-3 flex items-center text-sm font-medium text-slate-900 dark:text-slate-100">
                  {tenantDestination}
                </div>
              </div>
            </div>

            {/* Row 2: Currency, Cargo Ready, Incoterms, Payment Terms */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Currency *</label>
                <select
                  value={formData.currency}
                  onChange={e => handleCurrencyChange(e.target.value)}
                  className="w-full h-10 px-3 border rounded-md bg-white dark:bg-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                >
                  {CURRENCY_OPTIONS.map(currency => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Cargo Ready *</label>
                <Input
                  type="date"
                  value={formData.expectedDate}
                  onChange={e => setFormData(prev => ({ ...prev, expectedDate: e.target.value }))}
                  className="h-10 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Incoterms *</label>
                <select
                  value={formData.incoterms}
                  onChange={e => setFormData(prev => ({ ...prev, incoterms: e.target.value }))}
                  className="w-full h-10 px-3 border rounded-md bg-white dark:bg-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                >
                  <option value="">Select...</option>
                  {INCOTERMS_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Payment Terms *</label>
                <Input
                  value={formData.paymentTerms}
                  onChange={e => setFormData(prev => ({ ...prev, paymentTerms: e.target.value }))}
                  placeholder="e.g., 30/70"
                  className="h-10 text-sm"
                  required
                />
              </div>
            </div>

            {/* Row 3: Notes */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes</label>
              <Input
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional internal notes..."
                className="h-10 text-sm"
              />
            </div>
          </div>

          {/* Products Table with Tabs */}
          <div className="rounded-xl border bg-white dark:bg-slate-800 overflow-hidden">
            <div className="px-5 py-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Products</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lineItems.length} item{lineItems.length !== 1 ? 's' : ''} · {totals.units.toLocaleString()} units · {totals.cartons.toLocaleString()} cartons
                  {totals.cost > 0 && ` · ${formData.currency} ${totals.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addLineItem} className="gap-1.5 w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                Add Row
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex border-b bg-slate-50/50 dark:bg-slate-700/50">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'details'
                    ? 'text-cyan-700 dark:text-cyan-400 border-b-2 border-cyan-600 bg-white dark:bg-slate-800 -mb-px'
                    : 'text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <FileText className="h-4 w-4" />
                PO Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('attributes')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'attributes'
                    ? 'text-cyan-700 dark:text-cyan-400 border-b-2 border-cyan-600 bg-white dark:bg-slate-800 -mb-px'
                    : 'text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Package className="h-4 w-4" />
                Attributes
              </button>
            </div>

            {/* PO Details Tab */}
            {activeTab === 'details' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead>
                    <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                      <th className="text-left font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">SKU</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">Batch</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">Description</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">Units</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">Units/Ctn</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">Cartons</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">Total</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">Notes</th>
                      <th className="w-[44px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item) => {
                      const cartons = item.unitsPerCarton && item.unitsOrdered > 0
                        ? Math.ceil(item.unitsOrdered / item.unitsPerCarton)
                        : null
                      const totalCost = parseMoney(item.totalCost)
                      const unitCost = totalCost !== null && item.unitsOrdered > 0
                        ? (totalCost / item.unitsOrdered).toFixed(4)
                        : null

                      return (
                                      <tr key={item.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                                          {/* SKU */}
                          <td className="px-4 py-2.5">
                            <select
                              value={item.skuCode}
                              onChange={e => updateLineItem(item.id, 'skuCode', e.target.value)}
                              className="w-full min-w-[100px] h-9 px-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                              required
                            >
                              <option value="">Select...</option>
                              {skus.map(sku => (
                                <option key={sku.id} value={sku.skuCode}>{sku.skuCode}</option>
                              ))}
                            </select>
                          </td>

                          {/* Batch */}
                          <td className="px-4 py-2.5">
                            <select
                              value={item.batchLot}
                              onChange={e => updateLineItem(item.id, 'batchLot', e.target.value)}
                              className="w-full min-w-[100px] h-9 px-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-sm disabled:bg-slate-100 disabled:dark:bg-slate-700 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                              required
                              disabled={!item.skuId}
                            >
                              {item.skuId ? (
                                batchesLoadingBySkuId[item.skuId] ? (
                                  <option value="">Loading…</option>
                                ) : (batchesBySkuId[item.skuId] ?? []).length > 0 ? (
                                  <>
                                    <option value="">Select...</option>
                                    {(batchesBySkuId[item.skuId] ?? []).map(b => (
                                      <option key={b.batchCode} value={b.batchCode}>{b.batchCode}</option>
                                    ))}
                                  </>
                                ) : (
                                  <option value="">No batches</option>
                                )
                              ) : (
                                <option value="">—</option>
                              )}
                            </select>
                          </td>

                          {/* Description (auto-filled, editable) */}
                          <td className="px-4 py-2.5">
                            <Input
                              value={item.skuDescription}
                              onChange={e => updateLineItem(item.id, 'skuDescription', e.target.value)}
                              placeholder="Description"
                              className="h-9 text-sm min-w-[140px] bg-white dark:bg-slate-800"
                            />
                          </td>

                          {/* Units */}
                          <td className="px-4 py-2.5">
                            <Input
                              type="number"
                              min="1"
                              value={item.unitsOrdered}
                              onChange={e => updateLineItem(item.id, 'unitsOrdered', parseInt(e.target.value) || 0)}
                              className="h-9 text-sm text-right tabular-nums min-w-[70px] bg-white dark:bg-slate-800"
                              required
                            />
                          </td>

                          {/* Units/Ctn */}
                          <td className="px-4 py-2.5">
                            <Input
                              type="number"
                              min="1"
                              value={item.unitsPerCarton ?? ''}
                              onChange={e => {
                                const parsed = Number.parseInt(e.target.value, 10)
                                updateLineItem(item.id, 'unitsPerCarton', Number.isInteger(parsed) && parsed > 0 ? parsed : null)
                              }}
                              placeholder="—"
                              className="h-9 text-sm text-right tabular-nums min-w-[70px] bg-white dark:bg-slate-800 disabled:bg-slate-100 disabled:dark:bg-slate-700 disabled:text-slate-400"
                              disabled={!item.skuId || !item.batchLot}
                              required
                            />
                          </td>

                          {/* Cartons (calculated) */}
                          <td className="px-4 py-2.5">
                            <div className="h-9 flex items-center justify-end tabular-nums text-slate-500 dark:text-slate-400 text-sm">
                              {cartons ?? '—'}
                            </div>
                          </td>

                          {/* Total */}
                          <td className="px-4 py-2.5">
                            <div className="relative min-w-[90px]">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.totalCost}
                                onChange={e => updateLineItem(item.id, 'totalCost', e.target.value)}
                                placeholder="0.00"
                                className="h-9 text-sm text-right tabular-nums pr-11 bg-white dark:bg-slate-800"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500 pointer-events-none">
                                {item.currency}
                              </span>
                            </div>
                            {unitCost && (
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 text-right mt-0.5">Unit: {unitCost}</p>
                            )}
                          </td>

                          {/* Notes */}
                          <td className="px-4 py-2.5">
                            <Input
                              value={item.notes}
                              onChange={e => updateLineItem(item.id, 'notes', e.target.value)}
                              placeholder="Notes..."
                              className="h-9 text-sm min-w-[100px] bg-white dark:bg-slate-800"
                            />
                          </td>

                          {/* Delete */}
                          <td className="px-4 py-2.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeLineItem(item.id)}
                              disabled={lineItems.length === 1}
                              className="h-9 w-9 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-20"
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

            {/* Attributes Tab */}
            {activeTab === 'attributes' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                      <th className="text-left font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">SKU</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">Batch</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">Carton Size</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">CBM/ctn</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">CBM Total</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">KG/ctn</th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">KG Total</th>
                      <th className="text-center font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">Pkg Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item) => {
                      const cartons = item.unitsPerCarton && item.unitsOrdered > 0
                        ? Math.ceil(item.unitsOrdered / item.unitsPerCarton)
                        : null
                      const batch = item.skuId && item.batchLot
                        ? (batchesBySkuId[item.skuId] ?? []).find(b => b.batchCode === item.batchLot.trim().toUpperCase())
                        : null
                      const cartonTriplet = batch ? resolveDimensionTripletCm({
                        side1Cm: batch.cartonSide1Cm,
                        side2Cm: batch.cartonSide2Cm,
                        side3Cm: batch.cartonSide3Cm,
                        legacy: batch.cartonDimensionsCm,
                      }) : null
                      const cbmPerCarton = cartonTriplet
                        ? (cartonTriplet.side1Cm * cartonTriplet.side2Cm * cartonTriplet.side3Cm) / 1_000_000
                        : null

                      return (
                                        <tr key={item.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                                          <td className="px-4 py-3 font-medium text-foreground">{item.skuCode || '—'}</td>
                                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{item.batchLot || '—'}</td>
                                          <td className="px-4 py-3 text-foreground">
                                            {cartonTriplet ? `${formatDimensionTripletCm(cartonTriplet)} cm` : <span className="text-muted-foreground">—</span>}
                                          </td>
                                          <td className="px-4 py-3 text-right tabular-nums text-foreground">
                                            {cbmPerCarton !== null ? cbmPerCarton.toFixed(3) : <span className="text-muted-foreground">—</span>}
                                          </td>
                                          <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                                            {cbmPerCarton !== null && cartons ? (cbmPerCarton * cartons).toFixed(3) : <span className="text-muted-foreground">—</span>}
                                          </td>
                                          <td className="px-4 py-3 text-right tabular-nums text-foreground">
                                            {batch?.cartonWeightKg ? batch.cartonWeightKg.toFixed(2) : <span className="text-muted-foreground">—</span>}
                                          </td>
                                          <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                                            {batch?.cartonWeightKg && cartons ? (batch.cartonWeightKg * cartons).toFixed(2) : <span className="text-muted-foreground">—</span>}
                                          </td>
                                          <td className="px-4 py-3 text-center">
                                            {batch?.packagingType ? (
                                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                                {batch.packagingType}
                                              </span>
                                            ) : <span className="text-muted-foreground">—</span>}
                                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/operations/purchase-orders')}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !formData.supplierId || !formData.expectedDate || !formData.incoterms || !formData.paymentTerms.trim() || lineItems.length === 0}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Purchase Order'
              )}
            </Button>
          </div>
        </form>

        {/* Attributes Verification Modal */}
        {showAttributesConfirm && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <div
                className="fixed inset-0 bg-slate-500 bg-opacity-75 transition-opacity"
                onClick={() => setShowAttributesConfirm(false)}
              />
              <div className="relative transform overflow-hidden rounded-xl bg-white dark:bg-slate-800 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-3xl">
                <div className="bg-white dark:bg-slate-800 px-6 pt-6 pb-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-cyan-100 dark:bg-cyan-900">
                      <Package className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Verify Product Attributes
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Please review the carton dimensions and weights before creating the purchase order.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50 dark:bg-slate-700">
                          <th className="text-left font-medium text-slate-600 dark:text-slate-300 px-4 py-2">SKU</th>
                          <th className="text-left font-medium text-slate-600 dark:text-slate-300 px-4 py-2">Batch</th>
                          <th className="text-left font-medium text-slate-600 dark:text-slate-300 px-4 py-2">Carton Size</th>
                          <th className="text-right font-medium text-slate-600 dark:text-slate-300 px-4 py-2">CBM Total</th>
                          <th className="text-right font-medium text-slate-600 dark:text-slate-300 px-4 py-2">KG Total</th>
                          <th className="text-center font-medium text-slate-600 dark:text-slate-300 px-4 py-2">Pkg Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((item) => {
                          const cartons = item.unitsPerCarton && item.unitsOrdered > 0
                            ? Math.ceil(item.unitsOrdered / item.unitsPerCarton)
                            : null
                          const batch = item.skuId && item.batchLot
                            ? (batchesBySkuId[item.skuId] ?? []).find(b => b.batchCode === item.batchLot.trim().toUpperCase())
                            : null
                          const cartonTriplet = batch ? resolveDimensionTripletCm({
                            side1Cm: batch.cartonSide1Cm,
                            side2Cm: batch.cartonSide2Cm,
                            side3Cm: batch.cartonSide3Cm,
                            legacy: batch.cartonDimensionsCm,
                          }) : null
                          const cbmPerCarton = cartonTriplet
                            ? (cartonTriplet.side1Cm * cartonTriplet.side2Cm * cartonTriplet.side3Cm) / 1_000_000
                            : null

                          return (
                            <tr key={item.id} className="border-t border-slate-200 dark:border-slate-700">
                              <td className="px-4 py-2 font-medium text-foreground">{item.skuCode}</td>
                              <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{item.batchLot}</td>
                              <td className="px-4 py-2">
                                {cartonTriplet ? (
                                  `${formatDimensionTripletCm(cartonTriplet)} cm`
                                ) : (
                                  <span className="text-amber-600 flex items-center gap-1">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Missing
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {cbmPerCarton !== null && cartons ? (
                                  (cbmPerCarton * cartons).toFixed(3)
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {batch?.cartonWeightKg && cartons ? (
                                  (batch.cartonWeightKg * cartons).toFixed(2)
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {batch?.packagingType ? (
                                  <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                    {batch.packagingType}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {lineItems.some(item => {
                    const batch = item.skuId && item.batchLot
                      ? (batchesBySkuId[item.skuId] ?? []).find(b => b.batchCode === item.batchLot.trim().toUpperCase())
                      : null
                    const cartonTriplet = batch ? resolveDimensionTripletCm({
                      side1Cm: batch.cartonSide1Cm,
                      side2Cm: batch.cartonSide2Cm,
                      side3Cm: batch.cartonSide3Cm,
                      legacy: batch.cartonDimensionsCm,
                    }) : null
                    return !cartonTriplet && !batch?.cartonWeightKg
                  }) && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      <span>Some products are missing carton dimensions or weights. You can still proceed, but shipping calculations may be incomplete.</span>
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 dark:bg-slate-700 px-6 py-4 flex flex-col sm:flex-row-reverse gap-3">
                  <Button
                    onClick={handleConfirmAndCreate}
                    disabled={submitting}
                    className="w-full sm:w-auto"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Confirm & Create PO'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAttributesConfirm(false)}
                    disabled={submitting}
                    className="w-full sm:w-auto"
                  >
                    Go Back
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </PageContent>
    </PageContainer>
  )
}
