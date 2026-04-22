'use client'

import type { DashboardOverviewSnapshot } from '@/lib/dashboard/dashboard-overview'

const numberFormatter = new Intl.NumberFormat('en-US')

function formatNumber(value: number) {
  return numberFormatter.format(value)
}

function CompactSummary({
  title,
  cartons,
  pallets,
  units,
  detail,
}: {
  title: string
  cartons: number
  pallets: number
  units: number
  detail: string
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700/80 dark:bg-slate-800/40">
      <div className="flex items-start justify-between gap-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          {title}
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          Cartons
        </div>
      </div>
      <div className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
        {formatNumber(cartons)}
      </div>
      <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
        <div>
          {formatNumber(pallets)} pallets • {formatNumber(units)} units
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{detail}</div>
      </div>
    </div>
  )
}

function WarehouseSummary({
  summary,
}: {
  summary: DashboardOverviewSnapshot['summary']['warehouses']
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            Warehouses
          </div>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Cartons
              </div>
              <div className="mt-1 text-4xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-5xl">
                {formatNumber(summary.cartons)}
              </div>
            </div>
            <div className="pb-1 text-sm text-slate-500 dark:text-slate-400">
              {formatNumber(summary.warehouseCount)} locations
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[22rem]">
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-700/80 dark:bg-slate-800/40">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Pallets
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">
              {formatNumber(summary.pallets)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-700/80 dark:bg-slate-800/40">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Units
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">
              {formatNumber(summary.units)}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function WarehouseTable({
  summary,
  warehouses,
}: {
  summary: DashboardOverviewSnapshot['summary']['warehouses']
  warehouses: DashboardOverviewSnapshot['warehouses']
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 dark:border-slate-700 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Warehouses</h2>
          <div className="text-sm text-slate-500 dark:text-slate-400">Sorted by cartons.</div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-right text-sm text-slate-600 dark:text-slate-300">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Locations
            </div>
            <div className="mt-1 font-semibold text-slate-950 dark:text-slate-50">
              {formatNumber(summary.warehouseCount)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Pallets
            </div>
            <div className="mt-1 font-semibold text-slate-950 dark:text-slate-50">
              {formatNumber(summary.pallets)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Units
            </div>
            <div className="mt-1 font-semibold text-slate-950 dark:text-slate-50">
              {formatNumber(summary.units)}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="px-5 py-3 sm:px-6">Warehouse</th>
              <th className="px-4 py-3 text-right">Cartons</th>
              <th className="px-4 py-3 text-right">Pallets</th>
              <th className="px-4 py-3 text-right">Units</th>
              <th className="px-5 py-3 text-right sm:px-6">SKUs</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400 sm:px-6"
                >
                  No warehouse stock posted yet.
                </td>
              </tr>
            ) : null}
            {warehouses.map(row => (
              <tr
                key={row.warehouseCode}
                className="border-b border-slate-200/80 align-top last:border-b-0 dark:border-slate-800"
              >
                <td className="px-5 py-4 sm:px-6">
                  <div className="flex flex-col gap-1">
                    <div className="font-medium text-slate-950 dark:text-slate-50">
                      {row.warehouseName}
                    </div>
                    <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      {row.warehouseCode}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-right text-base font-semibold tabular-nums text-slate-950 dark:text-slate-50">
                  {formatNumber(row.cartons)}
                </td>
                <td className="px-4 py-4 text-right tabular-nums text-slate-600 dark:text-slate-300">
                  {formatNumber(row.pallets)}
                </td>
                <td className="px-4 py-4 text-right tabular-nums text-slate-600 dark:text-slate-300">
                  {formatNumber(row.units)}
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-slate-600 dark:text-slate-300 sm:px-6">
                  {formatNumber(row.skuCount)}
                </td>
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
  const warehouses = [...snapshot.warehouses].sort((left, right) => right.cartons - left.cartons)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(16rem,0.82fr)]">
        <div className="space-y-4">
          <WarehouseSummary summary={snapshot.summary.warehouses} />
          <WarehouseTable summary={snapshot.summary.warehouses} warehouses={warehouses} />
        </div>

        <div className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <CompactSummary
            title="Factory"
            cartons={snapshot.summary.factory.cartons}
            pallets={snapshot.summary.factory.pallets}
            units={snapshot.summary.factory.units}
            detail={`${formatNumber(snapshot.summary.factory.poCount)} open POs`}
          />
          <CompactSummary
            title="Transit"
            cartons={snapshot.summary.transit.cartons}
            pallets={snapshot.summary.transit.pallets}
            units={snapshot.summary.transit.units}
            detail={`${formatNumber(snapshot.summary.transit.poCount)} open POs`}
          />
        </div>
      </div>
    </div>
  )
}
