'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type {
  DashboardOverviewMovement,
  DashboardOverviewSnapshot,
} from '@/lib/dashboard/dashboard-overview'
import { ArrowDown, ArrowUp } from '@/lib/lucide-icons'

type InventoryMetric = 'cartons' | 'pallets' | 'units'

type InventoryMetricRow = {
  cartons: number
  pallets: number
  units: number
  carriesPallets?: boolean
}

const numberFormatter = new Intl.NumberFormat('en-US')
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  timeZone: 'UTC',
})

const metricOptions: Array<{ value: InventoryMetric; label: string }> = [
  { value: 'cartons', label: 'Cartons' },
  { value: 'pallets', label: 'Pallets' },
  { value: 'units', label: 'Units' },
]

const metricLabels: Record<InventoryMetric, string> = {
  cartons: 'Cartons',
  pallets: 'Pallets',
  units: 'Units',
}

function formatNumber(value: number) {
  return numberFormatter.format(value)
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

function getShare(value: number, total: number) {
  if (total === 0) {
    return 0
  }

  return Math.round((value / total) * 100)
}

function getMetricValue(row: InventoryMetricRow, metric: InventoryMetric) {
  return row[metric]
}

function formatMetricValue(row: InventoryMetricRow, metric: InventoryMetric) {
  if (metric === 'pallets' && row.carriesPallets === false) {
    return '—'
  }

  return formatNumber(getMetricValue(row, metric))
}

function MetricToggle({
  selectedMetric,
  setSelectedMetric,
}: {
  selectedMetric: InventoryMetric
  setSelectedMetric: (metric: InventoryMetric) => void
}) {
  return (
    <div
      aria-label="Distribution metric"
      className="inline-flex shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-950"
      role="group"
    >
      {metricOptions.map(option => {
        const selected = selectedMetric === option.value

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => setSelectedMetric(option.value)}
            className={
              selected
                ? 'rounded-[5px] bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-50 shadow-sm dark:bg-slate-100 dark:text-slate-950'
                : 'rounded-[5px] px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100'
            }
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function StageTable({ snapshot }: { snapshot: DashboardOverviewSnapshot }) {
  const rows = [
    {
      label: 'Factory',
      cartons: snapshot.summary.factory.cartons,
      pallets: snapshot.summary.factory.pallets,
      units: snapshot.summary.factory.units,
      count: `${formatNumber(snapshot.summary.factory.poCount)} Inbound`,
    },
    {
      label: 'Transit',
      cartons: snapshot.summary.transit.cartons,
      pallets: snapshot.summary.transit.pallets,
      units: snapshot.summary.transit.units,
      count: `${formatNumber(snapshot.summary.transit.poCount)} Inbound`,
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

function WarehouseTable({
  warehouses,
  selectedMetric,
}: {
  warehouses: DashboardOverviewSnapshot['warehouses']
  selectedMetric: InventoryMetric
}) {
  const totalSelected = warehouses.reduce(
    (sum, row) => sum + getMetricValue(row, selectedMetric),
    0
  )

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
              const selectedValue = getMetricValue(row, selectedMetric)
              const share = getShare(selectedValue, totalSelected)

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
                  {metricOptions.map(option => {
                    const selected = selectedMetric === option.value
                    return (
                      <td
                        key={option.value}
                        className={
                          selected
                            ? 'px-4 py-4 text-right text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100'
                            : 'px-4 py-4 text-right tabular-nums text-slate-600 dark:text-slate-300'
                        }
                      >
                        {formatMetricValue(row, option.value)}
                      </td>
                    )
                  })}
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

function WarehouseChart({
  warehouses,
  selectedMetric,
  setSelectedMetric,
}: {
  warehouses: DashboardOverviewSnapshot['warehouses']
  selectedMetric: InventoryMetric
  setSelectedMetric: (metric: InventoryMetric) => void
}) {
  const chartData = warehouses.map(row => ({
    name: row.warehouseCode,
    value: getMetricValue(row, selectedMetric),
    carriesPallets: row.carriesPallets,
  }))
  const maxValue = chartData.reduce((max, row) => Math.max(max, row.value, 0), 0)
  const scaleMax = maxValue === 0 ? 1 : maxValue
  const metricLabel = metricLabels[selectedMetric].toLowerCase()

  return (
    <section className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          Distribution
        </h2>
        <MetricToggle selectedMetric={selectedMetric} setSelectedMetric={setSelectedMetric} />
      </div>

      <div className="border-y border-slate-200 py-4 dark:border-slate-800">
        {chartData.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-slate-500 dark:text-slate-500">
            No chart data.
          </div>
        ) : (
          <div className="space-y-4">
            {chartData.map(row => {
              const width = Math.round((Math.max(row.value, 0) / scaleMax) * 100)
              const displayValue =
                selectedMetric === 'pallets' && row.carriesPallets === false
                  ? '—'
                  : formatNumber(row.value)
              const title =
                selectedMetric === 'pallets' && row.carriesPallets === false
                  ? `${row.name}: FBA does not carry pallets`
                  : `${row.name}: ${formatNumber(row.value)} ${metricLabel}`

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
                      title={title}
                    />
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {displayValue}
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

function MovementQuantity({ movement }: { movement: DashboardOverviewMovement }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
      <span>{formatNumber(movement.cartons)} cartons</span>
      <span>{formatNumber(movement.units)} units</span>
      <span>
        {movement.carriesPallets ? `${formatNumber(movement.pallets)} pallets` : 'No pallets'}
      </span>
    </div>
  )
}

function RecentMovementSection({
  title,
  movements,
  direction,
}: {
  title: string
  movements: DashboardOverviewMovement[]
  direction: 'in' | 'out'
}) {
  const Icon = direction === 'in' ? ArrowDown : ArrowUp
  const iconClass =
    direction === 'in'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
      : 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300'

  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          {title}
        </h2>
        <Link
          href="/operations/transactions"
          className="text-xs font-semibold text-teal-700 hover:text-teal-900 dark:text-teal-300 dark:hover:text-teal-100"
        >
          Ledger
        </Link>
      </div>

      <div className="border-y border-slate-200 dark:border-slate-800">
        {movements.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-500 dark:text-slate-500">
            No recent movements.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {movements.map(movement => (
              <div
                key={movement.id}
                className="grid grid-cols-[2rem_minmax(0,1fr)_4rem] gap-3 py-3"
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-md ${iconClass}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {movement.skuCode}
                    </span>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-500">
                      {movement.lotRef}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {movement.warehouseName} · {movement.transactionType}
                  </div>
                  <MovementQuantity movement={movement} />
                </div>
                <div className="pt-0.5 text-right text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-500">
                  {formatDate(movement.transactionDate)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export function DashboardOverviewBoard({ snapshot }: { snapshot: DashboardOverviewSnapshot }) {
  const [selectedMetric, setSelectedMetric] = useState<InventoryMetric>('cartons')
  const warehouses = useMemo(
    () =>
      [...snapshot.warehouses].sort(
        (left, right) =>
          getMetricValue(right, selectedMetric) - getMetricValue(left, selectedMetric)
      ),
    [selectedMetric, snapshot.warehouses]
  )

  return (
    <div className="space-y-7 text-slate-700 dark:text-slate-200">
      <StageTable snapshot={snapshot} />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(24rem,0.65fr)]">
        <WarehouseTable warehouses={warehouses} selectedMetric={selectedMetric} />
        <WarehouseChart
          warehouses={warehouses}
          selectedMetric={selectedMetric}
          setSelectedMetric={setSelectedMetric}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <RecentMovementSection title="Recent In" movements={snapshot.recentIn} direction="in" />
        <RecentMovementSection title="Recent Out" movements={snapshot.recentOut} direction="out" />
      </div>
    </div>
  )
}
