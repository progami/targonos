'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Check, Download, Loader2, Search } from '@/lib/lucide-icons'
import type {
  AmazonInboundShipment,
  AmazonInboundDetails,
  AmazonShipmentState,
  AmazonFreightState,
  FormData,
  LineItem,
  SkuOption,
  WarehouseOption,
} from './types'
import {
  getStringField,
  formatAmazonAddress,
  getAddressField,
  normalizeInboundItems,
} from './helpers'

interface AmazonShipmentPickerProps {
  amazonShipment: AmazonShipmentState
  setAmazonShipment: React.Dispatch<React.SetStateAction<AmazonShipmentState>>
  setAmazonFreight: React.Dispatch<React.SetStateAction<AmazonFreightState>>
  formData: FormData
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
  setLineItems: React.Dispatch<React.SetStateAction<LineItem[]>>
  skus: SkuOption[]
  warehouses: WarehouseOption[]
}

export function AmazonShipmentPicker({
  amazonShipment,
  setAmazonShipment,
  setAmazonFreight,
  formData,
  setFormData,
  setLineItems,
  skus,
  warehouses,
}: AmazonShipmentPickerProps) {
  const [shipments, setShipments] = useState<AmazonInboundShipment[]>([])
  const [shipmentsLoading, setShipmentsLoading] = useState(false)
  const [shipmentsError, setShipmentsError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [manualId, setManualId] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importedUnits, setImportedUnits] = useState(0)

  const loadShipments = useCallback(async () => {
    setShipmentsLoading(true)
    setShipmentsError(null)
    try {
      const response = await fetch('/api/amazon/inbound-shipments', { credentials: 'include' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to fetch Amazon shipments')
      }
      const list = Array.isArray(payload?.data?.shipments) ? payload.data.shipments : []
      setShipments(list)
    } catch (error) {
      setShipments([])
      setShipmentsError(error instanceof Error ? error.message : 'Failed to fetch Amazon shipments')
    } finally {
      setShipmentsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadShipments()
  }, [loadShipments])

  const filteredShipments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return shipments

    return shipments.filter(shipment => {
      const record = shipment as Record<string, unknown>
      const shipmentId = getStringField(record, ['ShipmentId', 'shipmentId'])
      const shipmentName = getStringField(record, ['ShipmentName', 'shipmentName'])
      const shipmentStatus = getStringField(record, ['ShipmentStatus', 'shipmentStatus'])
      return [shipmentId, shipmentName, shipmentStatus].some(value =>
        value.toLowerCase().includes(term)
      )
    })
  }, [shipments, searchTerm])

  // Try to find a warehouse matching the FC code
  const findWarehouseForFC = useCallback(
    (fcCode: string) => {
      // Try exact match first, then partial match
      const exactMatch = warehouses.find(
        w => w.code.toUpperCase() === fcCode.toUpperCase()
      )
      if (exactMatch) return exactMatch

      // Try partial match (FC code might be part of warehouse code or name)
      const partialMatch = warehouses.find(
        w =>
          w.code.toUpperCase().includes(fcCode.toUpperCase()) ||
          w.name.toUpperCase().includes(fcCode.toUpperCase())
      )
      return partialMatch
    },
    [warehouses]
  )

  const getPreferredBatch = (sku?: SkuOption | null) => {
    if (!sku?.batches?.length) return null
    return sku.batches[0]
  }

  const handleImport = async (shipmentId: string) => {
    if (!shipmentId.trim()) {
      toast.error('Amazon shipment ID is required')
      return
    }

    setImportLoading(true)
    try {
      const response = await fetch(
        `/api/amazon/inbound-shipments/${encodeURIComponent(shipmentId)}`,
        { credentials: 'include' }
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to fetch Amazon shipment')
      }

      const details = payload?.data as AmazonInboundDetails | undefined
      const shipment = details?.shipment ?? null
      const normalized = details?.normalized

      const resolvedShipmentId =
        normalized?.shipmentId ?? shipment?.ShipmentId ?? details?.shipmentId ?? shipmentId
      const shipFromAddress =
        normalized?.shipFromAddress ??
        (shipment?.ShipFromAddress && typeof shipment.ShipFromAddress === 'object'
          ? (shipment.ShipFromAddress as Record<string, unknown>)
          : null)
      const shipToAddress = normalized?.shipToAddress ?? null

      const destinationFC =
        normalized?.destinationFulfillmentCenterId ??
        shipment?.DestinationFulfillmentCenterId ??
        ''

      setAmazonShipment(prev => ({
        ...prev,
        shipmentId: resolvedShipmentId,
        shipmentName: normalized?.shipmentName ?? shipment?.ShipmentName ?? '',
        shipmentStatus: normalized?.shipmentStatus ?? shipment?.ShipmentStatus ?? '',
        destinationFulfillmentCenterId: destinationFC,
        labelPrepType: normalized?.labelPrepType ?? shipment?.LabelPrepType ?? '',
        boxContentsSource: normalized?.boxContentsSource ?? shipment?.BoxContentsSource ?? '',
        shipFromAddress,
        shipToAddress,
        referenceId: normalized?.referenceId || prev.referenceId || '',
        inboundPlanId: normalized?.inboundPlanId ?? prev.inboundPlanId,
        inboundOrderId: normalized?.inboundOrderId ?? prev.inboundOrderId,
      }))

      const pickupAddress = shipFromAddress ? formatAmazonAddress(shipFromAddress) : ''
      const pickupContactName = shipFromAddress
        ? getAddressField(shipFromAddress, ['Name', 'name'])
        : ''
      const pickupContactPhone = shipFromAddress
        ? getAddressField(shipFromAddress, ['Phone', 'phone'])
        : ''

      setAmazonFreight(prev => ({
        ...prev,
        shipmentReference: prev.shipmentReference || normalized?.shipmentName || shipment?.ShipmentName || '',
        pickupAddress: prev.pickupAddress || pickupAddress,
        pickupContactName: prev.pickupContactName || pickupContactName,
        pickupContactPhone: prev.pickupContactPhone || pickupContactPhone,
      }))

      const destinationAddress = shipToAddress ? formatAmazonAddress(shipToAddress) : ''

      // Try to auto-select warehouse based on FC code
      const matchedWarehouse = findWarehouseForFC(destinationFC)

      setFormData(prev => ({
        ...prev,
        destinationType: 'AMAZON_FBA',
        warehouseCode: matchedWarehouse?.code ?? prev.warehouseCode,
        destinationName: destinationFC || prev.destinationName,
        destinationAddress: destinationAddress || prev.destinationAddress,
        externalReference: resolvedShipmentId || prev.externalReference,
      }))

      // Process line items
      const rawItems = Array.isArray(details?.inboundPlanItems) && details?.inboundPlanItems.length
        ? details?.inboundPlanItems
        : Array.isArray(details?.items)
          ? details?.items
          : []
      const normalizedItems = normalizeInboundItems(rawItems)

      const skuMap = new Map(skus.map(sku => [sku.skuCode.toLowerCase(), sku]))
      const missingSkus = new Set<string>()
      const missingBatches = new Set<string>()
      const lineMap = new Map<string, LineItem>()
      let totalUnitsImported = 0

      for (const item of normalizedItems) {
        const rawSku = item.sku.trim()
        if (!rawSku) continue

        const sku = skuMap.get(rawSku.toLowerCase())
        if (!sku) {
          missingSkus.add(rawSku)
          continue
        }

        const preferredBatch = getPreferredBatch(sku)
        const batchLot = preferredBatch?.batchCode ?? ''
        if (!batchLot) {
          missingBatches.add(sku.skuCode)
        }

        const quantityUnits = item.quantityExpected ?? 0
        if (!Number.isFinite(quantityUnits) || quantityUnits <= 0) continue

        const fallbackUnitsPerCarton =
          preferredBatch?.unitsPerCarton ?? sku.unitsPerCarton ?? null
        const unitsPerCarton =
          item.quantityInCase && item.quantityInCase > 0
            ? item.quantityInCase
            : fallbackUnitsPerCarton && fallbackUnitsPerCarton > 0
              ? fallbackUnitsPerCarton
              : 1

        const cartons = Math.ceil(quantityUnits / unitsPerCarton)
        if (!Number.isFinite(cartons) || cartons <= 0) continue

        totalUnitsImported += quantityUnits

        const key = `${sku.skuCode}::${batchLot}`
        const existing = lineMap.get(key)
        if (existing) {
          existing.quantity += cartons
          continue
        }

        lineMap.set(key, {
          id: crypto.randomUUID(),
          skuCode: sku.skuCode,
          skuDescription: sku.description,
          batchLot,
          quantity: cartons,
          notes: '',
        })
      }

      const importedLines = Array.from(lineMap.values())
      if (importedLines.length > 0) {
        setLineItems(importedLines)
      }

      setImportedUnits(totalUnitsImported)

      if (missingSkus.size > 0) {
        const list = Array.from(missingSkus)
        const preview = list.slice(0, 3).join(', ')
        toast.error(`Missing SKUs in Talos: ${preview}${list.length > 3 ? '...' : ''}`)
      }

      if (missingBatches.size > 0) {
        const list = Array.from(missingBatches)
        const preview = list.slice(0, 3).join(', ')
        toast.error(`Missing batches for SKUs: ${preview}${list.length > 3 ? '...' : ''}`)
      }

      toast.success('Amazon shipment imported')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import Amazon shipment')
    } finally {
      setImportLoading(false)
    }
  }

  const hasShipment = Boolean(amazonShipment.shipmentId)

  return (
    <div className="rounded-xl border bg-white dark:bg-slate-800">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold">Amazon Shipment</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select or import a shipment from Amazon
          </p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Import Confirmation */}
        {hasShipment && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800">
            <div className="flex-shrink-0 h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center">
              <Check className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                Imported: {amazonShipment.shipmentId}
              </span>
              <span className="text-sm text-emerald-700 dark:text-emerald-300">
                {' → '}
                {amazonShipment.destinationFulfillmentCenterId}
                {importedUnits > 0 && ` (${importedUnits.toLocaleString()} units)`}
              </span>
            </div>
            <Badge className="bg-emerald-100 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700 flex-shrink-0">
              {amazonShipment.shipmentStatus}
            </Badge>
          </div>
        )}

        {/* Warehouse Selection */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Warehouse *</label>
          <select
            value={formData.warehouseCode}
            onChange={e => setFormData(prev => ({ ...prev, warehouseCode: e.target.value }))}
            className="w-full px-3 py-2 border rounded-md bg-white dark:bg-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
          >
            <option value="">Select warehouse</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.code}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
          {hasShipment && amazonShipment.destinationFulfillmentCenterId && (
            <p className="text-xs text-muted-foreground mt-1">
              Amazon FC: {amazonShipment.destinationFulfillmentCenterId}
            </p>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by shipment ID, name, or status..."
            className="pl-9 text-sm"
          />
        </div>

        {/* Shipment List */}
        <div className="rounded-lg border bg-slate-50 dark:bg-slate-900 overflow-hidden">
          {shipmentsLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading shipments...
            </div>
          ) : shipmentsError ? (
            <div className="p-4">
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {shipmentsError}
              </div>
            </div>
          ) : filteredShipments.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {searchTerm ? 'No shipments match your search.' : 'No shipments found.'}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700">
              {filteredShipments.map((shipment, index) => {
                const record = shipment as Record<string, unknown>
                const id = getStringField(record, ['ShipmentId', 'shipmentId'])
                const name = getStringField(record, ['ShipmentName', 'shipmentName'])
                const status = getStringField(record, ['ShipmentStatus', 'shipmentStatus'])
                const destination = getStringField(record, [
                  'DestinationFulfillmentCenterId',
                  'destinationFulfillmentCenterId',
                ])
                const isSelected = amazonShipment.shipmentId === id

                return (
                  <button
                    key={id || `${index}-shipment`}
                    type="button"
                    onClick={() => handleImport(id)}
                    disabled={importLoading || !id}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? 'bg-cyan-50 dark:bg-cyan-900/30 border-l-4 border-l-cyan-600'
                        : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate text-sm">
                            {id}
                          </span>
                          {isSelected && (
                            <Badge className="bg-cyan-100 dark:bg-cyan-800 text-cyan-700 dark:text-cyan-200 border-cyan-200 dark:border-cyan-700 text-xs">
                              Selected
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {name} · FC: {destination}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {status && (
                          <Badge className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 text-xs">
                            {status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Manual ID Entry */}
        <div className="flex gap-3 items-end pt-2 border-t">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1.5">
              Or enter shipment ID manually
            </label>
            <Input
              value={manualId}
              onChange={e => setManualId(e.target.value)}
              placeholder="FBA shipment ID..."
              className="text-sm"
            />
          </div>
          <Button
            type="button"
            onClick={() => handleImport(manualId)}
            disabled={importLoading || !manualId.trim()}
            className="gap-2"
          >
            {importLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Import
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
