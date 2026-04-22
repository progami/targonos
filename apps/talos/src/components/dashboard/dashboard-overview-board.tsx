'use client'

import { Badge } from '@/components/ui/badge'
import { Factory, Ship, Warehouse } from '@/lib/lucide-icons'
import type { LucideIcon } from '@/lib/lucide-icons'
import type { DashboardOverviewSnapshot } from '@/lib/dashboard/dashboard-overview'

const numberFormatter = new Intl.NumberFormat('en-US')

function formatNumber(value: number) {
  return numberFormatter.format(value)
}

function MetricCard({
  title,
  icon: Icon,
  cartons,
  pallets,
  units,
}: {
  title: string
  icon: LucideIcon
  cartons: number
  pallets: number
  units: number
}) {
  return (
    <section className="rounded-[24px] border border-slate-800 bg-slate-950/95 p-4 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-200">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-800 pt-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Cartons
          </div>
          <div className="mt-1 text-base font-semibold text-slate-100">
            {formatNumber(cartons)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Pallets
          </div>
          <div className="mt-1 text-base font-semibold text-slate-100">
            {formatNumber(pallets)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Units
          </div>
          <div className="mt-1 text-base font-semibold text-slate-100">{formatNumber(units)}</div>
        </div>
      </div>
    </section>
  )
}

function SupportCard({
  title,
  summary,
}: {
  title: string
  summary: {
    cartons: number
    pallets: number
    units: number
    poCount: number
  }
}) {
  return (
    <section className="rounded-[24px] border border-slate-800 bg-slate-950/95 p-4 shadow-soft">
      <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        <Badge variant="neutral" className="border-slate-800 bg-slate-900/80 text-slate-300">
          {formatNumber(summary.poCount)} open
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Cartons
          </div>
          <div className="mt-1 text-base font-semibold text-slate-100">
            {formatNumber(summary.cartons)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Pallets
          </div>
          <div className="mt-1 text-base font-semibold text-slate-100">
            {formatNumber(summary.pallets)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Units
          </div>
          <div className="mt-1 text-base font-semibold text-slate-100">
            {formatNumber(summary.units)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            PO count
          </div>
          <div className="mt-1 text-base font-semibold text-slate-100">
            {formatNumber(summary.poCount)}
          </div>
        </div>
      </div>
    </section>
  )
}

function WarehouseTable({
  warehouses,
}: {
  warehouses: DashboardOverviewSnapshot['warehouses']
}) {
  return (
    <section className="rounded-[28px] border border-slate-800 bg-slate-950 p-5 shadow-soft">
      <div className="flex flex-col gap-2 border-b border-slate-800 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-xl font-semibold text-slate-100">Warehouses</h2>
        <div className="text-sm text-slate-500">Sorted by cartons</div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <th className="px-3 py-3">Warehouse</th>
              <th className="px-3 py-3 text-right">Cartons</th>
              <th className="px-3 py-3 text-right">Pallets</th>
              <th className="px-3 py-3 text-right">Units</th>
              <th className="px-3 py-3 text-right">SKU count</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-sm text-slate-500">
                  No warehouse stock posted yet.
                </td>
              </tr>
            ) : null}
            {warehouses.map(row => (
              <tr key={row.warehouseCode} className="border-b border-slate-900 text-slate-300">
                <td className="px-3 py-3">
                  <div className="font-semibold text-slate-100">{row.warehouseCode}</div>
                  <div className="mt-1 text-xs text-slate-500">{row.warehouseName}</div>
                </td>
                <td className="px-3 py-3 text-right font-medium text-slate-100">
                  {formatNumber(row.cartons)}
                </td>
                <td className="px-3 py-3 text-right">{formatNumber(row.pallets)}</td>
                <td className="px-3 py-3 text-right">{formatNumber(row.units)}</td>
                <td className="px-3 py-3 text-right">{formatNumber(row.skuCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function DashboardOverviewBoard({
  snapshot,
}: {
  snapshot: DashboardOverviewSnapshot
}) {
  return (
    <div className="space-y-5 text-slate-100">
      <section className="grid gap-4 xl:grid-cols-3">
        <MetricCard
          title="In Factory"
          icon={Factory}
          cartons={snapshot.summary.factory.cartons}
          pallets={snapshot.summary.factory.pallets}
          units={snapshot.summary.factory.units}
        />
        <MetricCard
          title="In Transit"
          icon={Ship}
          cartons={snapshot.summary.transit.cartons}
          pallets={snapshot.summary.transit.pallets}
          units={snapshot.summary.transit.units}
        />
        <MetricCard
          title="In Warehouses"
          icon={Warehouse}
          cartons={snapshot.summary.warehouses.cartons}
          pallets={snapshot.summary.warehouses.pallets}
          units={snapshot.summary.warehouses.units}
        />
      </section>

      <WarehouseTable warehouses={snapshot.warehouses} />

      <section className="grid gap-4 xl:grid-cols-2">
        <SupportCard title="Factory" summary={snapshot.summary.factory} />
        <SupportCard title="Transit" summary={snapshot.summary.transit} />
      </section>
    </div>
  )
}
