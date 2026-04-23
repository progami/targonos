import type { DashboardOverviewSnapshot } from '@/lib/dashboard/dashboard-overview'

const numberFormatter = new Intl.NumberFormat('en-US')

function formatNumber(value: number) {
  return numberFormatter.format(value)
}

function getShare(value: number, total: number) {
  if (total === 0) {
    return 0
  }

  return Math.round((value / total) * 100)
}

function StageTable({ snapshot }: { snapshot: DashboardOverviewSnapshot }) {
  const rows = [
    {
      label: 'Factory',
      cartons: snapshot.summary.factory.cartons,
      pallets: snapshot.summary.factory.pallets,
      units: snapshot.summary.factory.units,
      count: `${formatNumber(snapshot.summary.factory.poCount)} POs`,
    },
    {
      label: 'Transit',
      cartons: snapshot.summary.transit.cartons,
      pallets: snapshot.summary.transit.pallets,
      units: snapshot.summary.transit.units,
      count: `${formatNumber(snapshot.summary.transit.poCount)} POs`,
    },
    {
      label: 'Warehouse',
      cartons: snapshot.summary.warehouses.cartons,
      pallets: snapshot.summary.warehouses.pallets,
      units: snapshot.summary.warehouses.units,
      count: `${formatNumber(snapshot.summary.warehouses.warehouseCount)} sites`,
    },
  ]
  const totalCartons = rows.reduce((sum, row) => sum + row.cartons, 0)

  return (
    <section className="overflow-x-auto border-y border-slate-200 dark:border-slate-800">
      <table className="min-w-[720px] table-fixed text-sm">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-500">
            <th className="w-[28%] py-3 pr-4">Stage</th>
            <th className="w-[30%] px-4">Cartons</th>
            <th className="px-4 text-right">Pallets</th>
            <th className="px-4 text-right">Units</th>
            <th className="pl-4 text-right">Count</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const share = getShare(row.cartons, totalCartons)

            return (
              <tr key={row.label} className="border-t border-slate-200 dark:border-slate-800/80">
                <td className="py-4 pr-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                  {row.label}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-right text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatNumber(row.cartons)}
                    </span>
                    <div className="h-2 min-w-24 flex-1 bg-slate-200 dark:bg-slate-900">
                      <div className="h-full bg-teal-700/80" style={{ width: `${share}%` }} />
                    </div>
                    <span className="w-10 text-right text-xs tabular-nums text-slate-500 dark:text-slate-500">
                      {share}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 text-right tabular-nums text-slate-600 dark:text-slate-300">
                  {formatNumber(row.pallets)}
                </td>
                <td className="px-4 py-4 text-right tabular-nums text-slate-600 dark:text-slate-300">
                  {formatNumber(row.units)}
                </td>
                <td className="py-4 pl-4 text-right text-slate-500 dark:text-slate-400">
                  {row.count}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function WarehouseTable({ warehouses }: { warehouses: DashboardOverviewSnapshot['warehouses'] }) {
  const totalCartons = warehouses.reduce((sum, row) => sum + row.cartons, 0)

  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-end justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          Warehouses
        </h2>
      </div>

      <div className="overflow-x-auto border-y border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-500">
              <th className="py-3 pr-4">Warehouse</th>
              <th className="px-4 py-3 text-right">Cartons</th>
              <th className="px-4 py-3 text-right">Pallets</th>
              <th className="px-4 py-3 text-right">Units</th>
              <th className="px-4 py-3 text-right">SKUs</th>
              <th className="py-3 pl-4 text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="py-10 text-center text-sm text-slate-500 dark:text-slate-500"
                >
                  No warehouse stock.
                </td>
              </tr>
            ) : null}
            {warehouses.map(row => {
              const share = getShare(row.cartons, totalCartons)

              return (
                <tr
                  key={row.warehouseCode}
                  className="border-t border-slate-200 dark:border-slate-800/80"
                >
                  <td className="py-4 pr-4">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {row.warehouseName}
                    </div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-500">
                      {row.warehouseCode}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatNumber(row.cartons)}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {formatNumber(row.pallets)}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {formatNumber(row.units)}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {formatNumber(row.skuCount)}
                  </td>
                  <td className="py-4 pl-4 text-right tabular-nums text-slate-500 dark:text-slate-400">
                    {share}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function WarehouseChart({ warehouses }: { warehouses: DashboardOverviewSnapshot['warehouses'] }) {
  const chartData = warehouses.map(row => ({
    name: row.warehouseCode,
    cartons: row.cartons,
  }))
  const maxCartons = chartData.reduce((max, row) => Math.max(max, row.cartons), 0)
  const scaleMax = maxCartons === 0 ? 1 : maxCartons

  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-end justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          Distribution
        </h2>
      </div>

      <div className="border-y border-slate-200 py-4 dark:border-slate-800">
        {chartData.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-slate-500 dark:text-slate-500">
            No chart data.
          </div>
        ) : (
          <div className="space-y-4">
            {chartData.map(row => {
              const width = Math.round((row.cartons / scaleMax) * 100)

              return (
                <div
                  key={row.name}
                  className="grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem] items-center gap-3"
                >
                  <div className="truncate text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {row.name}
                  </div>
                  <div className="h-9 bg-slate-100 dark:bg-slate-900">
                    <div
                      className="h-full bg-teal-700/80"
                      style={{ width: `${width}%` }}
                      title={`${row.name}: ${formatNumber(row.cartons)} cartons`}
                    />
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatNumber(row.cartons)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export function DashboardOverviewBoard({ snapshot }: { snapshot: DashboardOverviewSnapshot }) {
  const warehouses = [...snapshot.warehouses].sort((left, right) => right.cartons - left.cartons)

  return (
    <div className="space-y-7 text-slate-700 dark:text-slate-200">
      <StageTable snapshot={snapshot} />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(24rem,0.65fr)]">
        <WarehouseTable warehouses={warehouses} />
        <WarehouseChart warehouses={warehouses} />
      </div>
    </div>
  )
}
