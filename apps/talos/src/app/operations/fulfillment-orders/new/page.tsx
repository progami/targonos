'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
import { toast } from 'react-hot-toast'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  Trash2,
  Truck,
} from '@/lib/lucide-icons'
import { redirectToPortal } from '@/lib/portal'
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

export default function NewFulfillmentOrderPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [skus, setSkus] = useState<SkuOption[]>([])

  // Source type selection (replaces destination type in Order Details tab)
  const [sourceType, setSourceType] = useState<DestinationType>('AMAZON_FBA')

  // Collapsible freight section
  const [freightExpanded, setFreightExpanded] = useState(false)

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

  const warehouseLabel = useMemo(() => {
    const selected = warehouses.find(w => w.code === formData.warehouseCode)
    return selected ? `${selected.code} — ${selected.name}` : ''
  }, [formData.warehouseCode, warehouses])

  // Calculate total units for display
  const totalUnits = useMemo(() => {
    return lineItems.reduce((sum, item) => {
      if (!item.skuCode || !item.batchLot) return sum
      const sku = skus.find(s => s.skuCode === item.skuCode)
      const batch = sku?.batches?.find((b: SkuBatchOption) => b.batchCode === item.batchLot)
      const unitsPerCarton = batch?.unitsPerCarton ?? sku?.unitsPerCarton ?? 1
      return sum + item.quantity * unitsPerCarton
    }, 0)
  }, [lineItems, skus])

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      redirectToPortal('/login', `${window.location.origin}/operations/fulfillment-orders/new`)
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

  // Line item helpers
  const getBatchOptions = (skuCode: string): SkuBatchOption[] => {
    const sku = skus.find(s => s.skuCode === skuCode)
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
          const sku = skus.find(s => s.skuCode === nextSkuCode)
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
      if (!formData.warehouseCode) {
        toast.error('Select a warehouse')
        return
      }

      const invalidLine = lineItems.find(
        item => !item.skuCode || !item.batchLot || item.quantity <= 0
      )
      if (invalidLine) {
        toast.error('Each line requires SKU, batch, and quantity')
        return
      }

      setSubmitting(true)

      const payload = {
        warehouseCode: formData.warehouseCode,
        warehouseName: warehouseLabel || undefined,
        destinationType: formData.destinationType,
        destinationName: formData.destinationName || undefined,
        destinationAddress: formData.destinationAddress || undefined,
        shippingCarrier: formData.shippingCarrier || undefined,
        shippingMethod: formData.shippingMethod || undefined,
        trackingNumber: formData.trackingNumber || undefined,
        externalReference: formData.externalReference || undefined,
        amazonShipmentId: amazonShipment.shipmentId || undefined,
        amazonShipmentName: amazonShipment.shipmentName || undefined,
        amazonShipmentStatus: amazonShipment.shipmentStatus || undefined,
        amazonDestinationFulfillmentCenterId:
          amazonShipment.destinationFulfillmentCenterId || undefined,
        amazonLabelPrepType: amazonShipment.labelPrepType || undefined,
        amazonBoxContentsSource: amazonShipment.boxContentsSource || undefined,
        amazonShipFromAddress: amazonShipment.shipFromAddress ?? undefined,
        amazonReferenceId: amazonShipment.referenceId || undefined,
        amazonShipmentReference: amazonFreight.shipmentReference || undefined,
        amazonShipperId: amazonFreight.shipperId || undefined,
        amazonPickupNumber: amazonFreight.pickupNumber || undefined,
        amazonPickupAppointmentId: amazonFreight.pickupAppointmentId || undefined,
        amazonDeliveryAppointmentId: amazonFreight.deliveryAppointmentId || undefined,
        amazonLoadId: amazonFreight.loadId || undefined,
        amazonFreightBillNumber: amazonFreight.freightBillNumber || undefined,
        amazonBillOfLadingNumber: amazonFreight.billOfLadingNumber || undefined,
        amazonPickupWindowStart: amazonFreight.pickupWindowStart || undefined,
        amazonPickupWindowEnd: amazonFreight.pickupWindowEnd || undefined,
        amazonDeliveryWindowStart: amazonFreight.deliveryWindowStart || undefined,
        amazonDeliveryWindowEnd: amazonFreight.deliveryWindowEnd || undefined,
        amazonPickupAddress: amazonFreight.pickupAddress || undefined,
        amazonPickupContactName: amazonFreight.pickupContactName || undefined,
        amazonPickupContactPhone: amazonFreight.pickupContactPhone || undefined,
        amazonDeliveryAddress: amazonFreight.deliveryAddress || undefined,
        amazonShipmentMode: amazonFreight.shipmentMode || undefined,
        amazonBoxCount: amazonFreight.boxCount || undefined,
        amazonPalletCount: amazonFreight.palletCount || undefined,
        amazonCommodityDescription: amazonFreight.commodityDescription || undefined,
        amazonDistanceMiles: amazonFreight.distanceMiles || undefined,
        amazonBasePrice: amazonFreight.basePrice || undefined,
        amazonFuelSurcharge: amazonFreight.fuelSurcharge || undefined,
        amazonTotalPrice: amazonFreight.totalPrice || undefined,
        amazonCurrency: amazonFreight.currency || undefined,
        notes: formData.notes || undefined,
        lines: lineItems.map(item => ({
          skuCode: item.skuCode,
          skuDescription: item.skuDescription || undefined,
          batchLot: item.batchLot,
          quantity: item.quantity,
          notes: item.notes || undefined,
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
                  onClick={() => setSourceType(type)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    sourceType === type
                      ? 'bg-cyan-50 border-cyan-500 text-cyan-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
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

          {/* Amazon Shipment Picker (for Amazon FBA) */}
          {isAmazonFBA && (
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

          {/* Warehouse & Destination (for non-Amazon) */}
          {!isAmazonFBA && (
            <div className="rounded-xl border bg-white dark:bg-slate-800 p-5">
              <h3 className="text-sm font-semibold mb-4">Destination Details</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Warehouse *</label>
                  <select
                    value={formData.warehouseCode}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, warehouseCode: e.target.value }))
                    }
                    className="w-full px-3 py-2 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
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
                  <label className="block text-sm font-medium mb-1.5">Destination Name</label>
                  <Input
                    value={formData.destinationName}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, destinationName: e.target.value }))
                    }
                    placeholder="Customer / Warehouse name"
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Shipping Carrier</label>
                  <Input
                    value={formData.shippingCarrier}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, shippingCarrier: e.target.value }))
                    }
                    placeholder="Optional..."
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
                    placeholder="Optional address..."
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Line Items Section (always visible) */}
          <div className="rounded-xl border bg-white dark:bg-slate-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold">Line Items</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lineItems.length} item{lineItems.length !== 1 ? 's' : ''}
                  {totalUnits > 0 && ` · ${totalUnits.toLocaleString()} units`}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </div>

            <div className="rounded-lg border bg-white dark:bg-slate-800 overflow-hidden">
              <div className="grid grid-cols-14 gap-2 text-xs font-medium text-muted-foreground p-3 border-b bg-slate-50/50">
                <div className="col-span-3">SKU</div>
                <div className="col-span-3">Batch</div>
                <div className="col-span-3">Description</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-1">Units</div>
                <div className="col-span-2">Notes</div>
                <div className="col-span-1"></div>
              </div>

              <div className="divide-y">
                {lineItems.map(item => {
                  const batches = getBatchOptions(item.skuCode)
                  const sku = skus.find(s => s.skuCode === item.skuCode)
                  const batch = batches.find(b => b.batchCode === item.batchLot)
                  const unitsPerCarton = batch?.unitsPerCarton ?? sku?.unitsPerCarton ?? 1
                  const totalItemUnits = item.quantity * unitsPerCarton

                  return (
                    <div key={item.id} className="grid grid-cols-14 gap-2 items-center p-3">
                      <div className="col-span-3">
                        <select
                          value={item.skuCode}
                          onChange={e => updateLineItem(item.id, 'skuCode', e.target.value)}
                          className="w-full px-2 py-1.5 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                          required
                        >
                          <option value="">Select SKU</option>
                          {skus.map(s => (
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
                          className="w-full px-2 py-1.5 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
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
                          onChange={e =>
                            updateLineItem(item.id, 'quantity', parseInt(e.target.value) || 0)
                          }
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

          {/* Collapsible Freight Section (for Amazon FBA only) */}
          {isAmazonFBA && (
            <div className="rounded-xl border bg-white dark:bg-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setFreightExpanded(!freightExpanded)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Freight & Logistics</span>
                  <Badge variant="outline" className="text-xs">
                    Optional
                  </Badge>
                </div>
                {freightExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {freightExpanded && (
                <div className="border-t px-5 py-4">
                  <FreightLogisticsTab
                    amazonFreight={amazonFreight}
                    setAmazonFreight={setAmazonFreight}
                  />
                </div>
              )}
            </div>
          )}

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
