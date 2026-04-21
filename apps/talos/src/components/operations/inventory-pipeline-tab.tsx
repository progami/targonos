'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { Factory, Package, Ship, Warehouse } from '@/lib/lucide-icons'
import { withBasePath } from '@/lib/utils/base-path'
import { StatsCard } from '@/components/ui/stats-card'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import type { InventoryBalance } from '@/hooks/useInventoryFilters'
import {
  buildInventoryPipelineSnapshot,
  type InventoryPipelinePurchaseOrderInput,
} from '@/lib/inventory/pipeline'

type SelectedPipelineStage = 'manufacturing' | 'transit' | 'warehouse'

interface InventoryPipelineTabProps {
  balances: InventoryBalance[]
  loadingBalances: boolean
  enabled: boolean
}

interface PurchaseOrdersResponse {
  data: Array<{
    id: string
    orderNumber: string
    status: string
    counterpartyName: string | null
    warehouseCode: string | null
    warehouseName: string | null
    stageData: {
      manufacturing: {
        factoryName: string | null
        expectedCompletionDate: string | null
        totalCartons: number | null
      }
      ocean: {
        portOfLoading: string | null
        portOfDischarge: string | null
        estimatedArrival: string | null
      }
      warehouse: {
        warehouseCode: string | null
        warehouseName: string | null
      }
    }
    lines: Array<{
      skuCode: string
      quantity: number
      unitsOrdered: number
    }>
  }>
}

const STAGE_META = {
  manufacturing: {
    label: 'Manufacturing',
    icon: Factory,
    description: 'Stock still with supplier or factory.',
  },
  transit: {
    label: 'Transit',
    icon: Ship,
    description: 'Stock moving toward warehouse.',
  },
  warehouse: {
    label: 'Warehouse',
    icon: Warehouse,
    description: 'Stock physically on hand in Talos warehouses.',
  },
} as const

function formatPipelineDate(value: string | null) {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '—'
  }

  return format(parsed, 'MMM d, yyyy')
}

function mapPurchaseOrders(
  orders: PurchaseOrdersResponse['data']
): InventoryPipelinePurchaseOrderInput[] {
  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    counterpartyName: order.counterpartyName,
    warehouseCode: order.warehouseCode,
    warehouseName: order.warehouseName,
    stageData: order.stageData,
    lines: order.lines.map((line) => ({
      skuCode: line.skuCode,
      quantity: line.quantity,
      unitsOrdered: line.unitsOrdered,
    })),
  }))
}

export function InventoryPipelineTab({
  balances,
  loadingBalances,
  enabled,
}: InventoryPipelineTabProps) {
  const [purchaseOrders, setPurchaseOrders] = useState<InventoryPipelinePurchaseOrderInput[]>([])
  const [loadingPurchaseOrders, setLoadingPurchaseOrders] = useState(false)
  const [hasLoadedPurchaseOrders, setHasLoadedPurchaseOrders] = useState(false)
  const [selectedStage, setSelectedStage] = useState<SelectedPipelineStage>('warehouse')

  useEffect(() => {
    if (!enabled) {
      return
    }
    if (hasLoadedPurchaseOrders) {
      return
    }

    let cancelled = false

    const fetchPurchaseOrders = async () => {
      try {
        setLoadingPurchaseOrders(true)
        const response = await fetch(withBasePath('/api/purchase-orders'), {
          credentials: 'include',
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
          toast.error(`Failed to load purchase orders: ${errorData.error ?? response.statusText}`)
          return
        }

        const payload = (await response.json()) as PurchaseOrdersResponse
        if (cancelled) {
          return
        }

        setPurchaseOrders(mapPurchaseOrders(payload.data))
        setHasLoadedPurchaseOrders(true)
      } catch (_error) {
        toast.error('Failed to load inventory pipeline')
      } finally {
        if (!cancelled) {
          setLoadingPurchaseOrders(false)
        }
      }
    }

    void fetchPurchaseOrders()

    return () => {
      cancelled = true
    }
  }, [enabled, hasLoadedPurchaseOrders])

  const snapshot = useMemo(() => {
    return buildInventoryPipelineSnapshot({
      purchaseOrders,
      balances,
    })
  }, [balances, purchaseOrders])

  const selectedStageMeta = STAGE_META[selectedStage]
  const selectedStageSummary = snapshot.stages[selectedStage]
  const loading = loadingBalances || loadingPurchaseOrders

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatsCard
          title="Units"
          value={snapshot.summary.totalUnits}
          subtitle="Across pipeline"
          size="sm"
          variant="info"
          icon={Package}
        />
        <StatsCard
          title="Cartons"
          value={snapshot.summary.totalCartons}
          subtitle="Across pipeline"
          size="sm"
        />
        <StatsCard
          title="SKUs"
          value={snapshot.summary.activeSkus}
          subtitle="Active in flow"
          size="sm"
        />
        <StatsCard
          title="Open POs"
          value={snapshot.summary.purchaseOrderCount}
          subtitle="Manufacturing + transit"
          size="sm"
        />
        <StatsCard
          title="Warehouses"
          value={snapshot.summary.warehouseCount}
          subtitle="With stock on hand"
          size="sm"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {(Object.keys(STAGE_META) as SelectedPipelineStage[]).map((stageKey) => {
          const meta = STAGE_META[stageKey]
          const stage = snapshot.stages[stageKey]
          const Icon = meta.icon
          const isActive = selectedStage === stageKey
          const countLabel =
            stageKey === 'warehouse' ? `${stage.count} locations` : `${stage.count} POs`

          return (
            <button
              key={stageKey}
              type="button"
              onClick={() => setSelectedStage(stageKey)}
              className={[
                'rounded-2xl border bg-white p-5 text-left shadow-soft transition-all dark:bg-slate-800',
                isActive
                  ? 'border-primary ring-1 ring-primary/30'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold text-foreground">{meta.label}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{meta.description}</p>
                </div>
                <Badge variant={isActive ? 'info' : 'neutral'}>{countLabel}</Badge>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Cartons
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {stage.cartons.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Units
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {stage.units.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    SKUs
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {stage.skuCount.toLocaleString()}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="rounded-2xl border bg-white shadow-soft dark:bg-slate-800">
        <div className="flex items-center justify-between gap-4 border-b px-4 py-3 dark:border-slate-700">
          <div>
            <div className="flex items-center gap-2">
              <selectedStageMeta.icon className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">{selectedStageMeta.label}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{selectedStageMeta.description}</p>
          </div>
          <Badge variant="outline">
            {selectedStageSummary.cartons.toLocaleString()} cartons
          </Badge>
        </div>

        {loading ? (
          <div className="px-4 py-10 text-center text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <LoadingSpinner size="sm" />
              Loading inventory pipeline…
            </span>
          </div>
        ) : null}

        {!loading && selectedStage === 'manufacturing' ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[960px] table-auto text-sm">
              <thead>
                <tr className="border-b bg-slate-50/60 dark:bg-slate-700/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    PO
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Supplier
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Factory
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    SKUs
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Cartons
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Units
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Exp. Complete
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.manufacturingRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No stock currently in manufacturing.
                    </td>
                  </tr>
                ) : null}
                {snapshot.manufacturingRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-4 py-3 font-medium text-foreground">{row.orderNumber}</td>
                    <td className="px-3 py-3 text-foreground">{row.supplierName ?? '—'}</td>
                    <td className="px-3 py-3 text-muted-foreground">{row.locationLabel ?? '—'}</td>
                    <td className="px-3 py-3 text-right text-foreground">
                      {row.skuCount.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-primary">
                      {row.cartons.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right text-foreground">
                      {row.units.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatPipelineDate(row.expectedDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && selectedStage === 'transit' ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] table-auto text-sm">
              <thead>
                <tr className="border-b bg-slate-50/60 dark:bg-slate-700/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    PO
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Supplier
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Route
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Destination
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Cartons
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Units
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    ETA
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.transitRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No stock currently in transit.
                    </td>
                  </tr>
                ) : null}
                {snapshot.transitRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-4 py-3 font-medium text-foreground">{row.orderNumber}</td>
                    <td className="px-3 py-3 text-foreground">{row.supplierName ?? '—'}</td>
                    <td className="px-3 py-3 text-muted-foreground">{row.routeLabel ?? '—'}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {row.warehouseCode ?? row.warehouseName ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-primary">
                      {row.cartons.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right text-foreground">
                      {row.units.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatPipelineDate(row.eta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && selectedStage === 'warehouse' ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[860px] table-auto text-sm">
              <thead>
                <tr className="border-b bg-slate-50/60 dark:bg-slate-700/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Warehouse
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    SKUs
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Lots
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Cartons
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Pallets
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Units
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.warehouseRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No stock currently on hand.
                    </td>
                  </tr>
                ) : null}
                {snapshot.warehouseRows.map((row) => (
                  <tr
                    key={`${row.warehouseCode}-${row.warehouseName}`}
                    className="border-t border-slate-200 dark:border-slate-700"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          {row.warehouseCode}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{row.warehouseName}</p>
                          <p className="text-xs text-muted-foreground">On hand</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-foreground">
                      {row.skuCount.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right text-foreground">
                      {row.lotCount.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-primary">
                      {row.cartons.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right text-foreground">
                      {row.pallets.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right text-foreground">
                      {row.units.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="outline">{row.shareOfUnits.toFixed(1)}%</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}
