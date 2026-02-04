'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
import { toast } from 'react-hot-toast'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  FileText,
  Info,
  Package2,
  Plus,
  RefreshCw,
  Trash2,
  Truck,
} from '@/lib/lucide-icons'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import {
  AmazonShipmentPicker,
  FreightLogisticsTab,
  type FormData,
  type AmazonShipmentState,
  type AmazonFreightState,
  type LineItem,
  type WarehouseOption,
  type SkuOption,
  type SkuBatchOption,
} from './components'

type DestinationType = 'AMAZON_FBA' | 'CUSTOMER' | 'TRANSFER'

type FulfillmentOrderCreateTab = 'details' | 'amazon' | 'lines' | 'freight'

export default function NewFulfillmentOrderPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [skus, setSkus] = useState<SkuOption[]>([])
  const [inventorySkus, setInventorySkus] = useState<SkuOption[]>([])
  const [inventoryOptionsLoading, setInventoryOptionsLoading] = useState(false)

  // Source type selection (replaces destination type in Order Details tab)
  const [sourceType, setSourceType] = useState<DestinationType>('AMAZON_FBA')

  const [activeTab, setActiveTab] = useState<FulfillmentOrderCreateTab>('details')

  const [formData, setFormData] = useState<FormData>({
    warehouseCode: '',
    destinationType: 'AMAZON_FBA',
    destinationName: '',
    destinationAddress: '',
    shippingCarrier: '',
    shippingMethod: '',
    trackingNumber: '',
    externalReference: '',
    notes: '',
  })

  const [amazonShipment, setAmazonShipment] = useState<AmazonShipmentState>({
    shipmentId: '',
    shipmentName: '',
    shipmentStatus: '',
    destinationFulfillmentCenterId: '',
    labelPrepType: '',
    boxContentsSource: '',
    shipFromAddress: null,
    shipToAddress: null,
    referenceId: '',
    inboundPlanId: '',
    inboundOrderId: '',
  })

  const [amazonFreight, setAmazonFreight] = useState<AmazonFreightState>({
    shipmentReference: '',
    shipperId: '',
    pickupNumber: '',
    pickupAppointmentId: '',
    deliveryAppointmentId: '',
    loadId: '',
    freightBillNumber: '',
    billOfLadingNumber: '',
    pickupWindowStart: '',
    pickupWindowEnd: '',
    deliveryWindowStart: '',
    deliveryWindowEnd: '',
    pickupAddress: '',
    pickupContactName: '',
    pickupContactPhone: '',
    deliveryAddress: '',
    shipmentMode: '',
    boxCount: '',
    palletCount: '',
    commodityDescription: '',
    distanceMiles: '',
    basePrice: '',
    fuelSurcharge: '',
    totalPrice: '',
    currency: '',
  })

  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: crypto.randomUUID(),
      skuCode: '',
      skuDescription: '',
      batchLot: '',
      quantity: 1,
      notes: '',
    },
  ])

  const isAmazonFBA = sourceType === 'AMAZON_FBA'

  // Sync sourceType with formData.destinationType
  useEffect(() => {
    setFormData(prev => ({ ...prev, destinationType: sourceType }))
  }, [sourceType])

  // Calculate total units for display
  const totalUnits = useMemo(() => {
    return lineItems.reduce((sum, item) => {
      if (!item.skuCode || !item.batchLot) return sum

      let sku = inventorySkus.find(s => s.skuCode === item.skuCode)
      if (!sku) {
        sku = skus.find(s => s.skuCode === item.skuCode)
      }

      const batch = sku?.batches?.find(b => b.batchCode === item.batchLot)

      let unitsPerCarton = 1
      if (batch && typeof batch.unitsPerCarton === 'number' && batch.unitsPerCarton > 0) {
        unitsPerCarton = batch.unitsPerCarton
      } else if (sku && typeof sku.unitsPerCarton === 'number' && sku.unitsPerCarton > 0) {
        unitsPerCarton = sku.unitsPerCarton
      }

      return sum + item.quantity * unitsPerCarton
    }, 0)
  }, [inventorySkus, lineItems, skus])

  const tabIssueCounts = useMemo(() => {
    const issues: Record<FulfillmentOrderCreateTab, number> = {
      details: 0,
      amazon: 0,
      lines: 0,
      freight: 0,
    }

    const warehouseMissing = !formData.warehouseCode.trim()
    if (warehouseMissing) {
      if (isAmazonFBA) {
        issues.amazon += 1
      } else {
        issues.details += 1
      }
    }

    if (!isAmazonFBA && !formData.destinationName.trim()) {
      issues.details += 1
    }

    if (isAmazonFBA && !amazonShipment.shipmentId.trim()) {
      issues.amazon += 1
    }

    const invalidLines = lineItems.filter(item => {
      if (!item.skuCode.trim()) return true
      if (!item.batchLot.trim()) return true
      return !Number.isFinite(item.quantity) || item.quantity <= 0
    }).length

    if (invalidLines > 0) {
      issues.lines = invalidLines
    }

    return issues
  }, [amazonShipment.shipmentId, formData.destinationName, formData.warehouseCode, isAmazonFBA, lineItems])

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      redirectToPortal('/login', `${window.location.origin}${withBasePath('/operations/fulfillment-orders/new')}`)
      return
    }
  }, [session, status])

  useEffect(() => {
    if (status !== 'authenticated') return

    const load = async () => {
      try {
        setLoading(true)
        const [warehousesRes, skusRes] = await Promise.all([
          fetch('/api/warehouses?includeAmazon=true'),
          fetch('/api/skus'),
        ])

        if (!warehousesRes.ok) {
          const payload = await warehousesRes.json().catch(() => null)
          throw new Error(payload?.error ?? 'Failed to load warehouses')
        }
        if (!skusRes.ok) {
          const payload = await skusRes.json().catch(() => null)
          throw new Error(payload?.error ?? 'Failed to load SKUs')
        }

        const warehousesPayload = await warehousesRes.json().catch(() => null)
        const skusPayload = await skusRes.json().catch(() => null)

        const warehousesData = Array.isArray(warehousesPayload?.data)
          ? (warehousesPayload.data as WarehouseOption[])
          : Array.isArray(warehousesPayload)
            ? (warehousesPayload as WarehouseOption[])
            : []
        const skusData = Array.isArray(skusPayload?.data)
          ? (skusPayload.data as SkuOption[])
          : Array.isArray(skusPayload)
            ? (skusPayload as SkuOption[])
            : []

        setWarehouses(warehousesData)
        setSkus(skusData)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') return

    const selectedWarehouseCode = formData.warehouseCode.trim()
    if (!selectedWarehouseCode) {
      setInventorySkus([])
      return
    }

    const selectedWarehouse = warehouses.find(w => w.code === selectedWarehouseCode)
    if (!selectedWarehouse) {
      setInventorySkus([])
      return
    }

    const controller = new AbortController()

    const loadInventoryOptions = async () => {
      try {
        setInventoryOptionsLoading(true)

        const response = await fetch(
          `/api/fulfillment-orders/inventory-options?warehouseId=${encodeURIComponent(selectedWarehouse.id)}`,
          { signal: controller.signal }
        )
        const payload = await response.json().catch(() => null)

        if (!response.ok) {
          toast.error(payload?.error ?? 'Failed to load inventory options')
          setInventorySkus([])
          return
        }

        const options = Array.isArray(payload?.skus) ? (payload.skus as SkuOption[]) : []
        setInventorySkus(options)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        toast.error(error instanceof Error ? error.message : 'Failed to load inventory options')
        setInventorySkus([])
      } finally {
        setInventoryOptionsLoading(false)
      }
    }

    void loadInventoryOptions()

    return () => controller.abort()
  }, [formData.warehouseCode, status, warehouses])

  // Line item helpers
  const getBatchOptions = (skuCode: string): SkuBatchOption[] => {
    const sku = inventorySkus.find(s => s.skuCode === skuCode)
    return sku?.batches ?? []
  }

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        skuCode: '',
        skuDescription: '',
        batchLot: '',
        quantity: 1,
        notes: '',
      },
    ])
  }

  const removeLineItem = (id: string) => {
    setLineItems(prev => prev.filter(item => item.id !== id))
  }

  const updateLineItem = (id: string, field: keyof LineItem, value: unknown) => {
    setLineItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item

        if (field === 'skuCode') {
          const nextSkuCode = String(value)
          let sku = inventorySkus.find(s => s.skuCode === nextSkuCode)
          if (!sku) {
            sku = skus.find(s => s.skuCode === nextSkuCode)
          }
          return {
            ...item,
            skuCode: nextSkuCode,
            skuDescription: sku?.description ?? item.skuDescription,
            batchLot: '',
          }
        }

        return {
          ...item,
          [field]: value,
        } as LineItem
      })
    )
  }

  const handleSubmit = async () => {
    try {
      if (isAmazonFBA && !amazonShipment.shipmentId.trim()) {
        setActiveTab('amazon')
        toast.error('Select an Amazon shipment')
        return
      }

      if (!formData.warehouseCode.trim()) {
        setActiveTab(isAmazonFBA ? 'amazon' : 'details')
        toast.error('Select a warehouse')
        return
      }

      if (!isAmazonFBA && !formData.destinationName.trim()) {
        setActiveTab('details')
        toast.error('Destination name is required')
        return
      }

      const invalidLine = lineItems.find(
        item => !item.skuCode || !item.batchLot || item.quantity <= 0
      )
      if (invalidLine) {
        setActiveTab('lines')
        toast.error('Each line requires SKU, batch, and quantity')
        return
      }

      if (inventoryOptionsLoading) {
        setActiveTab('lines')
        toast.error('Inventory options are still loading')
        return
      }

      if (inventorySkus.length === 0) {
        setActiveTab('lines')
        toast.error('No on-hand inventory available for this warehouse')
        return
      }

      for (const item of lineItems) {
        const sku = inventorySkus.find(s => s.skuCode === item.skuCode)
        if (!sku) {
          toast.error(`SKU ${item.skuCode} has no on-hand inventory in this warehouse`)
          return
        }

        const batch = sku.batches.find(b => b.batchCode === item.batchLot)
        if (!batch) {
          toast.error(
            `Batch ${item.batchLot} for SKU ${item.skuCode} has no on-hand inventory in this warehouse`
          )
          return
        }

        if (typeof batch.availableCartons === 'number' && batch.availableCartons < item.quantity) {
          toast.error(
            `Insufficient inventory for SKU ${item.skuCode} batch ${item.batchLot}. Available: ${batch.availableCartons}, Requested: ${item.quantity}`
          )
          return
        }
      }

      setSubmitting(true)

      const payload = {
        warehouseCode: formData.warehouseCode,
        destinationType: formData.destinationType,
        destinationName: formData.destinationName,
        destinationAddress: formData.destinationAddress,
        shippingCarrier: formData.shippingCarrier,
        shippingMethod: formData.shippingMethod,
        trackingNumber: formData.trackingNumber,
        externalReference: formData.externalReference,
        amazonShipmentId: amazonShipment.shipmentId,
        amazonShipmentName: amazonShipment.shipmentName,
        amazonShipmentStatus: amazonShipment.shipmentStatus,
        amazonDestinationFulfillmentCenterId: amazonShipment.destinationFulfillmentCenterId,
        amazonLabelPrepType: amazonShipment.labelPrepType,
        amazonBoxContentsSource: amazonShipment.boxContentsSource,
        amazonShipFromAddress: amazonShipment.shipFromAddress,
        amazonReferenceId: amazonShipment.referenceId,
        amazonShipmentReference: amazonFreight.shipmentReference,
        amazonShipperId: amazonFreight.shipperId,
        amazonPickupNumber: amazonFreight.pickupNumber,
        amazonPickupAppointmentId: amazonFreight.pickupAppointmentId,
        amazonDeliveryAppointmentId: amazonFreight.deliveryAppointmentId,
        amazonLoadId: amazonFreight.loadId,
        amazonFreightBillNumber: amazonFreight.freightBillNumber,
        amazonBillOfLadingNumber: amazonFreight.billOfLadingNumber,
        amazonPickupWindowStart: amazonFreight.pickupWindowStart,
        amazonPickupWindowEnd: amazonFreight.pickupWindowEnd,
        amazonDeliveryWindowStart: amazonFreight.deliveryWindowStart,
        amazonDeliveryWindowEnd: amazonFreight.deliveryWindowEnd,
        amazonPickupAddress: amazonFreight.pickupAddress,
        amazonPickupContactName: amazonFreight.pickupContactName,
        amazonPickupContactPhone: amazonFreight.pickupContactPhone,
        amazonDeliveryAddress: amazonFreight.deliveryAddress,
        amazonShipmentMode: amazonFreight.shipmentMode,
        amazonBoxCount: amazonFreight.boxCount,
        amazonPalletCount: amazonFreight.palletCount,
        amazonCommodityDescription: amazonFreight.commodityDescription,
        amazonDistanceMiles: amazonFreight.distanceMiles,
        amazonBasePrice: amazonFreight.basePrice,
        amazonFuelSurcharge: amazonFreight.fuelSurcharge,
        amazonTotalPrice: amazonFreight.totalPrice,
        amazonCurrency: amazonFreight.currency,
        notes: formData.notes,
        lines: lineItems.map(item => ({
          skuCode: item.skuCode,
          skuDescription: item.skuDescription,
          batchLot: item.batchLot,
          quantity: item.quantity,
          notes: item.notes,
        })),
      }

      const response = await fetchWithCSRF('/api/fulfillment-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.error ?? 'Failed to create fulfillment order')
        return
      }

      const orderId = data?.data?.id
      if (!orderId) {
        toast.error('Fulfillment order created but missing ID in response')
        return
      }

      toast.success('Fulfillment order created')
      router.push(`/operations/fulfillment-orders/${orderId}`)
    } catch (_error) {
      toast.error('Failed to create fulfillment order')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageContainer>
      <PageHeaderSection
        title="New Fulfillment Order"
        description="Operations"
        icon={FileText}
        backHref="/operations/fulfillment-orders"
        backLabel="Back"
      />
      <PageContent>
        <div className="flex flex-col gap-6">
          {/* Source Type Selector */}
          <div className="rounded-xl border bg-white dark:bg-slate-800 p-5">
            <h3 className="text-sm font-semibold mb-3">Order Type</h3>
            <div className="flex gap-3">
              {(['AMAZON_FBA', 'CUSTOMER', 'TRANSFER'] as DestinationType[]).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setSourceType(type)
                    setActiveTab(type === 'AMAZON_FBA' ? 'amazon' : 'details')
                  }}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    sourceType === type
                      ? 'bg-cyan-50 dark:bg-cyan-900/30 border-cyan-500 dark:border-cyan-400 text-cyan-700 dark:text-cyan-300'
                      : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
                  }`}
                >
                  {type === 'AMAZON_FBA'
                    ? 'Amazon FBA'
                    : type === 'CUSTOMER'
                      ? 'Customer'
                      : 'Transfer'}
                </button>
              ))}
            </div>
          </div>

          {/* Details / Amazon / Lines / Freight Tabs */}
          <div className="rounded-xl border bg-white dark:bg-slate-800 shadow-sm">
            <div className="flex items-center border-b">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`relative flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'details'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Info className="h-4 w-4" />
                Details
                {tabIssueCounts.details > 0 && (
                  <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                )}
                {activeTab === 'details' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>

              {isAmazonFBA && (
                <button
                  type="button"
                  onClick={() => setActiveTab('amazon')}
                  className={`relative flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'amazon'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <RefreshCw className="h-4 w-4" />
                  Amazon
                  {tabIssueCounts.amazon > 0 && (
                    <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                  )}
                  {activeTab === 'amazon' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveTab('lines')}
                className={`relative flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'lines'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Package2 className="h-4 w-4" />
                Lines
                <Badge variant="outline" className="text-xs ml-1">
                  {lineItems.length}
                </Badge>
                {tabIssueCounts.lines > 0 && (
                  <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                )}
                {activeTab === 'lines' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>

              {isAmazonFBA && (
                <button
                  type="button"
                  onClick={() => setActiveTab('freight')}
                  className={`relative flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'freight'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Truck className="h-4 w-4" />
                  Freight
                  <Badge variant="outline" className="text-xs ml-1">
                    Optional
                  </Badge>
                  {activeTab === 'freight' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
              )}
            </div>

            <div className="p-5">
              {activeTab === 'amazon' && isAmazonFBA && (
                <AmazonShipmentPicker
                  amazonShipment={amazonShipment}
                  setAmazonShipment={setAmazonShipment}
                  setAmazonFreight={setAmazonFreight}
                  formData={formData}
                  setFormData={setFormData}
                  setLineItems={setLineItems}
                  skus={skus}
                  warehouses={warehouses}
                />
              )}

              {activeTab === 'details' && (
                <div className="space-y-4">
                  {!isAmazonFBA && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3">Destination</h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium mb-1.5">
                            Warehouse *
                            {!formData.warehouseCode.trim() && (
                              <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                            )}
                          </label>
                          <select
                            value={formData.warehouseCode}
                            onChange={e =>
                              setFormData(prev => ({ ...prev, warehouseCode: e.target.value }))
                            }
                            className="w-full px-3 py-2 border rounded-md bg-white dark:bg-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                            disabled={loading}
                            required
                          >
                            <option value="">Select warehouse</option>
                            {warehouses.map(w => (
                              <option key={w.id} value={w.code}>
                                {w.code} — {w.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1.5">
                            Destination Name *
                            {!formData.destinationName.trim() && (
                              <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                            )}
                          </label>
                          <Input
                            value={formData.destinationName}
                            onChange={e =>
                              setFormData(prev => ({ ...prev, destinationName: e.target.value }))
                            }
                            placeholder="Customer / warehouse name"
                            className="text-sm"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium mb-1.5">Destination Address</label>
                          <Input
                            value={formData.destinationAddress}
                            onChange={e =>
                              setFormData(prev => ({ ...prev, destinationAddress: e.target.value }))
                            }
                            placeholder="Optional"
                            className="text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-semibold mb-3">Notes</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">External Reference</label>
                        <Input
                          value={formData.externalReference}
                          onChange={e =>
                            setFormData(prev => ({ ...prev, externalReference: e.target.value }))
                          }
                          placeholder="Optional"
                          className="text-sm"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Order Notes</label>
                        <Textarea
                          value={formData.notes}
                          onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                          placeholder="Optional notes…"
                          className="min-h-[96px] text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'lines' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Line Items</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {lineItems.length} item{lineItems.length !== 1 ? 's' : ''}
                        {totalUnits > 0 ? ` · ${totalUnits.toLocaleString()} units` : ''}
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Item
                    </Button>
                  </div>

                  <div className="rounded-lg border bg-white dark:bg-slate-800 overflow-hidden">
                    <div className="grid grid-cols-14 gap-2 text-xs font-medium text-muted-foreground p-3 border-b bg-slate-50/50 dark:bg-slate-900/50">
                      <div className="col-span-3">SKU</div>
                      <div className="col-span-3">Batch</div>
                      <div className="col-span-3">Description</div>
                      <div className="col-span-1">Qty</div>
                      <div className="col-span-1">Units</div>
                      <div className="col-span-2">Notes</div>
                      <div className="col-span-1"></div>
                    </div>

                    <div className="divide-y divide-border">
                      {lineItems.map(item => {
                        const batches = getBatchOptions(item.skuCode)
                        let sku = inventorySkus.find(s => s.skuCode === item.skuCode)
                        if (!sku) {
                          sku = skus.find(s => s.skuCode === item.skuCode)
                        }
                        const batch = batches.find(b => b.batchCode === item.batchLot)
                        const unitsPerCarton = batch?.unitsPerCarton ?? sku?.unitsPerCarton ?? 1
                        const totalItemUnits = item.quantity * unitsPerCarton

                        return (
                          <div key={item.id} className="grid grid-cols-14 gap-2 items-center p-3">
                            <div className="col-span-3">
                              <select
                                value={item.skuCode}
                                onChange={e => updateLineItem(item.id, 'skuCode', e.target.value)}
                                className="w-full px-2 py-1.5 border rounded-md bg-white dark:bg-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                                required
                                disabled={!formData.warehouseCode || inventoryOptionsLoading}
                              >
                                <option value="">Select SKU</option>
                                {inventorySkus.map(s => (
                                  <option key={s.id} value={s.skuCode}>
                                    {s.skuCode}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="col-span-3">
                              <select
                                value={item.batchLot}
                                onChange={e => updateLineItem(item.id, 'batchLot', e.target.value)}
                                className="w-full px-2 py-1.5 border rounded-md bg-white dark:bg-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                                required
                                disabled={!item.skuCode}
                              >
                                <option value="">Select batch</option>
                                {batches.map(b => (
                                  <option key={b.id} value={b.batchCode}>
                                    {b.batchCode}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="col-span-3">
                              <Input
                                value={item.skuDescription}
                                onChange={e => updateLineItem(item.id, 'skuDescription', e.target.value)}
                                placeholder="Description"
                                className="text-sm h-8"
                              />
                            </div>

                            <div className="col-span-1">
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={e => {
                                  const parsed = Number.parseInt(e.target.value, 10)
                                  updateLineItem(item.id, 'quantity', Number.isFinite(parsed) ? parsed : 0)
                                }}
                                className="text-sm h-8"
                                required
                              />
                            </div>

                            <div className="col-span-1">
                              <span className="text-sm text-muted-foreground">
                                {item.skuCode && item.batchLot ? totalItemUnits.toLocaleString() : '—'}
                              </span>
                            </div>

                            <div className="col-span-2">
                              <Input
                                value={item.notes}
                                onChange={e => updateLineItem(item.id, 'notes', e.target.value)}
                                placeholder="Notes"
                                className="text-sm h-8"
                              />
                            </div>

                            <div className="col-span-1 flex justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeLineItem(item.id)}
                                disabled={lineItems.length === 1}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'freight' && isAmazonFBA && (
                <FreightLogisticsTab
                  amazonFreight={amazonFreight}
                  setAmazonFreight={setAmazonFreight}
                />
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => router.push('/operations/fulfillment-orders')}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Fulfillment Order'}
            </Button>
          </div>
        </div>
      </PageContent>
    </PageContainer>
  )
}
