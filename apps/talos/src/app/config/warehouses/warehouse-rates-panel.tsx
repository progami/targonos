'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Package,
  Warehouse as WarehouseIcon,
  Ship,
  Plus,
  Edit,
  Save,
  X,
  Loader2,
} from '@/lib/lucide-icons'
import { Badge } from '@/components/ui/badge'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import { usePageState } from '@/lib/store/page-state'
import { toast } from 'react-hot-toast'

interface CostRate {
  id: string
  warehouseId: string
  costCategory: string
  costName: string
  costValue: number
  unitOfMeasure: string
  effectiveDate: string
  endDate: string | null
}

interface WarehouseRatesPanelProps {
  warehouseId: string
  warehouseName: string
  warehouseCode: string
}

type TabKey = 'inbound' | 'storage' | 'outbound' | 'forwarding'

interface InlineEditState {
  rateId: string | null
  templateName: string | null
  field: 'rate' | 'effectiveDate' | 'new'
  value: string
  effectiveDate: string
}

// Rate templates define expected rates with their categories and units
// Categories: Inbound, Storage, Outbound, Forwarding (matches the supply chain stage)
// Tactical Logistics CWH Rate Sheet (from actual invoices)
const RATE_TEMPLATES = {
  inbound: [
    {
      costName: "20' Container Handling",
      costCategory: 'Inbound',
      unitOfMeasure: 'per_container',
      defaultValue: 650,
    },
    {
      costName: "40' Container Handling",
      costCategory: 'Inbound',
      unitOfMeasure: 'per_container',
      defaultValue: 825,
    },
    {
      costName: "40' HQ Container Handling",
      costCategory: 'Inbound',
      unitOfMeasure: 'per_container',
      defaultValue: 875,
    },
    {
      costName: "45' HQ Container Handling",
      costCategory: 'Inbound',
      unitOfMeasure: 'per_container',
      defaultValue: 950,
    },
    {
      costName: 'LCL Handling',
      costCategory: 'Inbound',
      unitOfMeasure: 'per_carton',
      defaultValue: 0.95,
    },
    {
      costName: 'Additional SKU Fee',
      costCategory: 'Inbound',
      unitOfMeasure: 'per_sku',
      defaultValue: 10,
    },
    {
      costName: 'Cartons Over 1200',
      costCategory: 'Inbound',
      unitOfMeasure: 'per_carton',
      defaultValue: 0.05,
    },
    {
      costName: 'Pallet & Shrink Wrap Fee',
      costCategory: 'Inbound',
      unitOfMeasure: 'per_pallet',
      defaultValue: 13.75,
    },
  ],
  storage: [
    {
      costName: 'Warehouse Storage',
      costCategory: 'Storage',
      unitOfMeasure: 'per_pallet_day',
      defaultValue: 0.69,
    },
    {
      costName: 'Warehouse Storage (6+ Months)',
      costCategory: 'Storage',
      unitOfMeasure: 'per_pallet_day',
      defaultValue: 0.69,
    },
  ],
  outbound: [
    {
      costName: 'Replenishment Handling',
      costCategory: 'Outbound',
      unitOfMeasure: 'per_carton',
      defaultValue: 1.0,
    },
    {
      costName: 'Replenishment Minimum',
      costCategory: 'Outbound',
      unitOfMeasure: 'per_shipment',
      defaultValue: 15,
    },
    {
      costName: 'FBA Trucking - Up to 8 Pallets',
      costCategory: 'Outbound',
      unitOfMeasure: 'flat',
      defaultValue: 0,
    },
    {
      costName: 'FBA Trucking - 9-12 Pallets',
      costCategory: 'Outbound',
      unitOfMeasure: 'flat',
      defaultValue: 0,
    },
    {
      costName: 'FBA Trucking - 13-28 Pallets (FTL)',
      costCategory: 'Outbound',
      unitOfMeasure: 'flat',
      defaultValue: 0,
    },
  ],
  forwarding: [
    { costName: 'Pre-pull', costCategory: 'Forwarding', unitOfMeasure: 'flat', defaultValue: 175 },
    {
      costName: "Pierpass 20'",
      costCategory: 'Forwarding',
      unitOfMeasure: 'per_container',
      defaultValue: 34.52,
    },
    {
      costName: "Pierpass 40'",
      costCategory: 'Forwarding',
      unitOfMeasure: 'per_container',
      defaultValue: 68.42,
    },
  ],
}

export function WarehouseRatesPanel({
  warehouseId,
  warehouseName,
  warehouseCode,
}: WarehouseRatesPanelProps) {
  const pageState = usePageState(`/config/warehouses/${warehouseId}/rates`)
  const activeTab = (pageState.activeTab as TabKey) ?? 'inbound'
  const setActiveTab = (tab: TabKey) => pageState.setActiveTab(tab)
  const [rates, setRates] = useState<CostRate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editState, setEditState] = useState<InlineEditState | null>(null)

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'inbound', label: 'Inbound', icon: <Package className="h-4 w-4" /> },
    { key: 'storage', label: 'Storage', icon: <WarehouseIcon className="h-4 w-4" /> },
    { key: 'outbound', label: 'Outbound', icon: <Package className="h-4 w-4" /> },
    ...(RATE_TEMPLATES.forwarding.length > 0
      ? [{ key: 'forwarding' as const, label: 'Forwarding', icon: <Ship className="h-4 w-4" /> }]
      : []),
  ]

  const loadRates = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetchWithCSRF(`/api/warehouses/${warehouseId}/cost-rates`)
      if (response.ok) {
        const data = await response.json()
        setRates(data.costRates || [])
      }
    } catch (error) {
      console.error('Failed to load rates:', error)
    } finally {
      setLoading(false)
    }
  }, [warehouseId])

  useEffect(() => {
    loadRates()
  }, [loadRates])

  const getRateForTemplate = (template: (typeof RATE_TEMPLATES.inbound)[0]) => {
    return rates.find(r => r.costName === template.costName)
  }

  const startEditingRate = (rate: CostRate) => {
    setEditState({
      rateId: rate.id,
      templateName: rate.costName,
      field: 'rate',
      value: rate.costValue.toString(),
      effectiveDate: rate.effectiveDate.slice(0, 10),
    })
  }

  const startEditingEffectiveDate = (rate: CostRate) => {
    setEditState({
      rateId: rate.id,
      templateName: rate.costName,
      field: 'effectiveDate',
      value: rate.costValue.toString(),
      effectiveDate: rate.effectiveDate.slice(0, 10),
    })
  }

  const startAddingRate = (template: (typeof RATE_TEMPLATES.inbound)[0]) => {
    setEditState({
      rateId: null,
      templateName: template.costName,
      field: 'new',
      value: template.defaultValue.toString(),
      effectiveDate: new Date().toISOString().split('T')[0],
    })
  }

  const cancelEditing = () => {
    setEditState(null)
  }

  const saveRate = async (rate: CostRate) => {
    if (!editState) return

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {}
      if (editState.field === 'rate') {
        payload.costValue = parseFloat(editState.value)
      } else if (editState.field === 'effectiveDate') {
        payload.effectiveDate = new Date(editState.effectiveDate)
      }

      const response = await fetchWithCSRF(`/api/settings/rates/${rate.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        toast.success('Rate updated')
        await loadRates()
        cancelEditing()
      } else {
        const error = await response.json().catch(() => null)
        toast.error(error?.error || 'Failed to update rate')
      }
    } catch (_error) {
      toast.error('Failed to update rate')
    } finally {
      setSaving(false)
    }
  }

  const createRate = async (template: (typeof RATE_TEMPLATES.inbound)[0]) => {
    if (!editState) return

    const numericValue = parseFloat(editState.value)
    if (Number.isNaN(numericValue) || numericValue < 0) {
      toast.error('Rate must be a valid number')
      return
    }

    setSaving(true)
    try {
      const response = await fetchWithCSRF('/api/settings/rates', {
        method: 'POST',
        body: JSON.stringify({
          warehouseId,
          costCategory: template.costCategory,
          costName: template.costName,
          unitOfMeasure: template.unitOfMeasure,
          costValue: numericValue,
          effectiveDate: new Date(editState.effectiveDate),
          endDate: null,
        }),
      })

      if (response.ok) {
        toast.success('Rate created')
        await loadRates()
        cancelEditing()
      } else {
        const error = await response.json().catch(() => null)
        toast.error(error?.error || 'Failed to create rate')
      }
    } catch (_error) {
      toast.error('Failed to create rate')
    } finally {
      setSaving(false)
    }
  }

  const renderRateRow = (template: (typeof RATE_TEMPLATES.inbound)[0], showCategory = false) => {
    const rate = getRateForTemplate(template)
    const isEditingThis = editState?.templateName === template.costName
    const isEditingRate = isEditingThis && editState?.field === 'rate'
    const isEditingDate = isEditingThis && editState?.field === 'effectiveDate'
    const isAddingNew = isEditingThis && editState?.field === 'new'

    return (
      <tr key={template.costName} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
        <td className="px-3 py-2 text-foreground whitespace-nowrap w-[40%]">
          {template.costName}
          {showCategory && (
            <span className="ml-2 text-xs text-muted-foreground">({template.costCategory})</span>
          )}
        </td>
        <td className="px-3 py-2 text-right w-[20%]">
          {rate ? (
            isEditingRate ? (
              <div className="flex items-center justify-end gap-2">
                <span className="text-muted-foreground">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={editState?.value || ''}
                  onChange={e =>
                    setEditState(prev => (prev ? { ...prev, value: e.target.value } : null))
                  }
                  className="w-24 px-2 py-1 text-right border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
                <button
                  onClick={() => saveRate(rate)}
                  disabled={saving}
                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                  title="Save"
                >
                  <Save className="h-4 w-4" />
                </button>
                <button
                  onClick={cancelEditing}
                  className="p-1 text-muted-foreground hover:bg-muted rounded"
                  title="Cancel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2">
                <span className="font-semibold text-foreground">${rate.costValue.toFixed(2)}</span>
                <button
                  onClick={() => startEditingRate(rate)}
                  className="p-1 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                  title="Edit rate"
                >
                  <Edit className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          ) : isAddingNew ? (
            <div className="flex items-center justify-end gap-2">
              <span className="text-muted-foreground">$</span>
              <input
                type="number"
                step="0.01"
                value={editState?.value || ''}
                onChange={e =>
                  setEditState(prev => (prev ? { ...prev, value: e.target.value } : null))
                }
                className="w-24 px-2 py-1 text-right border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2 w-[25%]">
          {rate ? (
            isEditingDate ? (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={editState?.effectiveDate || ''}
                  onChange={e =>
                    setEditState(prev => (prev ? { ...prev, effectiveDate: e.target.value } : null))
                  }
                  className="w-36 px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  autoFocus
                />
                <button
                  onClick={() => saveRate(rate)}
                  disabled={saving}
                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                  title="Save"
                >
                  <Save className="h-4 w-4" />
                </button>
                <button
                  onClick={cancelEditing}
                  className="p-1 text-muted-foreground hover:bg-muted rounded"
                  title="Cancel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{rate.effectiveDate.slice(0, 10)}</span>
                <button
                  onClick={() => startEditingEffectiveDate(rate)}
                  className="p-1 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                  title="Edit effective date"
                >
                  <Edit className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          ) : isAddingNew ? (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={editState?.effectiveDate || ''}
                onChange={e =>
                  setEditState(prev => (prev ? { ...prev, effectiveDate: e.target.value } : null))
                }
                className="w-36 px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
              <button
                onClick={() => createRate(template)}
                disabled={saving}
                className="p-1 text-green-600 hover:bg-green-50 rounded"
                title="Save"
              >
                <Save className="h-4 w-4" />
              </button>
              <button
                onClick={cancelEditing}
                className="p-1 text-muted-foreground hover:bg-muted rounded"
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap w-[15%]">
          {rate ? (
            formatUnit(template.unitOfMeasure)
          ) : isAddingNew ? (
            formatUnit(template.unitOfMeasure)
          ) : (
            <button
              onClick={() => startAddingRate(template)}
              className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          )}
        </td>
      </tr>
    )
  }

  const formatUnit = (unit: string) => {
    const unitLabels: Record<string, string> = {
      per_container: 'per container',
      per_carton: 'per carton',
      per_pallet: 'per pallet',
      per_pallet_day: 'per pallet/day',
      per_sku: 'per SKU',
      per_hour: 'per hour',
      per_delivery: 'per delivery',
      per_shipment: 'per shipment',
      flat: 'flat',
    }
    return unitLabels[unit] || unit
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{warehouseName}</h2>
          <p className="text-sm text-muted-foreground">Rate Sheet • {warehouseCode} • USD</p>
        </div>
        <Badge className="bg-green-50 text-green-700 border-green-200">
          {rates.length} rates configured
        </Badge>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-1 -mb-px">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                ${
                  activeTab === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'inbound' && (
          <InboundTab templates={RATE_TEMPLATES.inbound} renderRateRow={renderRateRow} />
        )}
        {activeTab === 'storage' && (
          <StorageTab
            templates={RATE_TEMPLATES.storage}
            renderRateRow={renderRateRow}
          />
        )}
        {activeTab === 'outbound' && (
          <OutboundTab templates={RATE_TEMPLATES.outbound} renderRateRow={renderRateRow} />
        )}
        {activeTab === 'forwarding' && (
          <ForwardingTab templates={RATE_TEMPLATES.forwarding} renderRateRow={renderRateRow} />
        )}
      </div>
    </div>
  )
}

interface TabProps {
  templates: typeof RATE_TEMPLATES.inbound
  renderRateRow: (
    template: (typeof RATE_TEMPLATES.inbound)[0],
    showCategory?: boolean
  ) => React.ReactNode
}

type StorageTabProps = TabProps

function InboundTab({ templates, renderRateRow }: TabProps) {
  // Filter by costName since all are now 'Inbound' category
  const containerRates = templates.filter(t => t.costName.includes('Container Handling'))
  const lclRates = templates.filter(t => t.costName === 'LCL Handling')
  const skuRates = templates.filter(t => t.costName === 'Additional SKU Fee')
  const cartonOverageRates = templates.filter(t => t.costName === 'Cartons Over 1200')
  const palletWrapRates = templates.filter(t => t.costName === 'Pallet & Shrink Wrap Fee')

  return (
    <div className="space-y-6">
      {/* Container Handling */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            Warehouse Handling and Carton Labeling
          </h3>
          <Badge className="bg-blue-50 text-blue-700 border-blue-200">Per Container</Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Covers unloading, sorting, labeling, palletizing, shrink-wrapping, FBA pallet labels, and
          delivery arrangement.
        </p>
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left w-[45%]">Container Type</th>
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-right w-[20%]">Rate</th>
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left w-[20%]">Effective</th>
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left w-[15%]">Unit</th>
            </tr>
          </thead>
          <tbody>
            {containerRates.map(t => renderRateRow(t))}
            {lclRates.map(t => renderRateRow(t))}
          </tbody>
        </table>
      </div>

      {/* Additional SKU */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Additional SKU Charges</h3>
        <p className="text-xs text-muted-foreground mb-3">Up to 10 SKUs per container included.</p>
        <table className="w-full table-fixed text-sm">
          <tbody>{skuRates.map(t => renderRateRow(t))}</tbody>
        </table>
      </div>

      {/* Carton Overage */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Carton Overage</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Up to 1200 cartons per container included.
        </p>
        <table className="w-full table-fixed text-sm">
          <tbody>{cartonOverageRates.map(t => renderRateRow(t))}</tbody>
        </table>
      </div>

      {/* Pallet & Shrink Wrap */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Pallet &amp; Shrink Wrap</h3>
        <table className="w-full table-fixed text-sm">
          <tbody>{palletWrapRates.map(t => renderRateRow(t))}</tbody>
        </table>
      </div>
    </div>
  )
}

function StorageTab({ templates, renderRateRow }: StorageTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Warehouse Storage</h3>
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left w-[45%]">Description</th>
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-right w-[20%]">Rate</th>
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left w-[20%]">Effective</th>
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left w-[15%]">Unit</th>
            </tr>
          </thead>
          <tbody>{templates.map(t => renderRateRow(t))}</tbody>
        </table>
      </div>
    </div>
  )
}

function OutboundTab({ templates, renderRateRow }: TabProps) {
  // Filter by costName since all are now 'Outbound' category
  const truckingRates = templates.filter(t => t.costName.includes('FBA Trucking'))
  const replenishmentRates = templates.filter(
    t => t.costName === 'Replenishment Handling' || t.costName === 'Replenishment Minimum'
  )

  return (
    <div className="space-y-6">
      {/* FBA Trucking */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Trucking and Delivery to Amazon FBA
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Tactical Logistics will schedule appointments and handle delivery to Amazon.
        </p>
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left w-[45%]">Pallet Range</th>
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-right w-[20%]">Rate</th>
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left w-[20%]">Effective</th>
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left w-[15%]">Unit</th>
            </tr>
          </thead>
          <tbody>{truckingRates.map(t => renderRateRow(t))}</tbody>
        </table>
      </div>

      {/* Replenishment */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Additional Replenishment Shipments to Amazon FBA
        </h3>
        <table className="w-full table-fixed text-sm">
          <tbody>{replenishmentRates.map(t => renderRateRow(t))}</tbody>
        </table>
      </div>
    </div>
  )
}

function ForwardingTab({ templates, renderRateRow }: TabProps) {
  return (
    <div className="space-y-6">
      {/* Ocean Freight */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Ocean Freight</h3>
        <p className="text-sm text-muted-foreground">
          Ask for current rates. Tactical will handle freight forwarding from point of manufacture
          to point of sale.
        </p>
      </div>

      {/* Drayage */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Port Pickup and Deliver to Tactical Warehouse (Drayage)
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Covers drayage to Tactical warehouse and includes all chassis fees.
        </p>
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left w-[45%]">Service</th>
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-right w-[20%]">Rate</th>
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left w-[20%]">Effective</th>
              <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left w-[15%]">Unit</th>
            </tr>
          </thead>
          <tbody>{templates.map(t => renderRateRow(t))}</tbody>
        </table>
      </div>
    </div>
  )
}
