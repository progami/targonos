import { formatAsinDisplayName } from '@/lib/product-labels'
import type { WprSortDirection, WprSortState } from './dashboard-state'
import type { WeekLabel, WprScpAsinRow, WprScpMetrics, WprScpWeekMetrics, WprScpWindow } from './types'

export type ScpSelectionScope = 'unavailable' | 'empty' | 'all' | 'asin' | 'multi-asin'

export type ScpSortKey =
  | 'asin'
  | 'weeks_present_selected_week'
  | 'impressions'
  | 'impression_share'
  | 'clicks'
  | 'click_share'
  | 'ctr'
  | 'cart_adds'
  | 'atc_rate'
  | 'purchases'
  | 'purchase_share'
  | 'purchase_rate'
  | 'cvr'
  | 'sales'

export interface ScpSelectionViewModel {
  scopeType: ScpSelectionScope
  allIds: string[]
  selectedIds: string[]
  isAllSelected: boolean
  weekly: WprScpWeekMetrics[]
  current: WprScpWeekMetrics | null
  rows: WprScpAsinRow[]
}

export function safeDiv(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0
  }

  return numerator / denominator
}

export function emptyScpMetrics(): WprScpMetrics {
  return {
    asin_count: 0,
    impressions: 0,
    clicks: 0,
    cart_adds: 0,
    purchases: 0,
    sales: 0,
    ctr: 0,
    atc_rate: 0,
    purchase_rate: 0,
    cvr: 0,
  }
}

export function finalizeScpMetrics(metrics: WprScpMetrics): WprScpMetrics {
  return {
    ...metrics,
    ctr: safeDiv(metrics.clicks, metrics.impressions),
    atc_rate: safeDiv(metrics.cart_adds, metrics.clicks),
    purchase_rate: safeDiv(metrics.purchases, metrics.cart_adds),
    cvr: safeDiv(metrics.purchases, metrics.clicks),
  }
}

function buildWeekMetrics(week: WprScpWeekMetrics, metrics: WprScpMetrics): WprScpWeekMetrics {
  const finalized = finalizeScpMetrics(metrics)
  return {
    week_label: week.week_label,
    week_number: week.week_number,
    start_date: week.start_date,
    asin_count: finalized.asin_count,
    impressions: finalized.impressions,
    clicks: finalized.clicks,
    cart_adds: finalized.cart_adds,
    purchases: finalized.purchases,
    sales: finalized.sales,
    ctr: finalized.ctr,
    atc_rate: finalized.atc_rate,
    purchase_rate: finalized.purchase_rate,
    cvr: finalized.cvr,
  }
}

function addScpMetrics(target: WprScpMetrics, source: WprScpMetrics) {
  target.impressions += source.impressions
  target.clicks += source.clicks
  target.cart_adds += source.cart_adds
  target.purchases += source.purchases
  target.sales += source.sales
  if (
    source.impressions > 0 ||
    source.clicks > 0 ||
    source.cart_adds > 0 ||
    source.purchases > 0 ||
    source.sales > 0
  ) {
    target.asin_count += 1
  }
}

function allScpAsinIds(window: WprScpWindow): string[] {
  return window.asins.map((row) => row.id)
}

export function selectedWeekScpRecord(
  series: readonly WprScpWeekMetrics[],
  selectedWeek: WeekLabel,
): WprScpWeekMetrics | null {
  for (const record of series) {
    if (record.week_label === selectedWeek) {
      return record
    }
  }

  return null
}

export function selectedWeekScpMetrics(
  series: readonly WprScpWeekMetrics[],
  selectedWeek: WeekLabel,
): WprScpWeekMetrics {
  const record = selectedWeekScpRecord(series, selectedWeek)
  if (record !== null) {
    return record
  }

  return {
    week_label: selectedWeek,
    week_number: Number.parseInt(selectedWeek.replace('W', ''), 10),
    start_date: '',
    ...finalizeScpMetrics(emptyScpMetrics()),
  }
}

function aggregateSelectedScpWeekly(window: WprScpWindow, selectedIds: string[]): WprScpWeekMetrics[] {
  const weekMap = new Map<string, WprScpMetrics>()
  for (const week of window.weekly) {
    weekMap.set(week.week_label, emptyScpMetrics())
  }

  for (const asinId of selectedIds) {
    const row = window.asins.find((candidate) => candidate.id === asinId)
    if (row === undefined) {
      continue
    }

    for (const week of row.weekly) {
      const bucket = weekMap.get(week.week_label)
      if (bucket === undefined) {
        throw new Error(`Missing SCP week bucket for ${week.week_label}`)
      }

      addScpMetrics(bucket, week)
    }
  }

  return window.weekly.map((week) => {
    const bucket = weekMap.get(week.week_label)
    if (bucket === undefined) {
      throw new Error(`Missing SCP aggregate for ${week.week_label}`)
    }

    return buildWeekMetrics(week, bucket)
  })
}

export function createScpSelectionViewModel(input: {
  window: WprScpWindow
  selectedAsinIds: Set<string>
  selectedWeek: WeekLabel
}): ScpSelectionViewModel {
  const { window, selectedAsinIds, selectedWeek } = input
  const allIds = allScpAsinIds(window)
  const selectedIds = allIds.filter((asinId) => selectedAsinIds.has(asinId))

  if (allIds.length === 0) {
    return {
      scopeType: 'unavailable',
      allIds: [],
      selectedIds: [],
      isAllSelected: false,
      weekly: [],
      current: null,
      rows: [],
    }
  }

  if (selectedIds.length === 0) {
    return {
      scopeType: 'empty',
      allIds,
      selectedIds: [],
      isAllSelected: false,
      weekly: [],
      current: null,
      rows: window.asins,
    }
  }

  if (selectedIds.length === allIds.length) {
    return {
      scopeType: 'all',
      allIds,
      selectedIds,
      isAllSelected: true,
      weekly: window.weekly,
      current: selectedWeekScpMetrics(window.weekly, selectedWeek),
      rows: window.asins,
    }
  }

  const weekly = aggregateSelectedScpWeekly(window, selectedIds)
  return {
    scopeType: selectedIds.length === 1 ? 'asin' : 'multi-asin',
    allIds,
    selectedIds,
    isAllSelected: false,
    weekly,
    current: selectedWeekScpMetrics(weekly, selectedWeek),
    rows: window.asins,
  }
}

function compareSortValues(
  left: number | string,
  right: number | string,
  direction: WprSortDirection,
  kind: 'number' | 'text',
): number {
  if (kind === 'text') {
    const result = String(left).localeCompare(String(right), undefined, { sensitivity: 'base' })
    if (direction === 'asc') {
      return result
    }

    return -result
  }

  const numericLeft = Number(left)
  const numericRight = Number(right)
  if (direction === 'asc') {
    return numericLeft - numericRight
  }

  return numericRight - numericLeft
}

export function scpSortValueForRow(
  row: WprScpAsinRow,
  key: ScpSortKey,
  selectedWeek: WeekLabel,
): number | string {
  const current = selectedWeekScpMetrics(row.weekly, selectedWeek)
  if (key === 'asin') return formatAsinDisplayName(row)
  if (key === 'weeks_present_selected_week') return selectedWeekScpRecord(row.weekly, selectedWeek) === null ? 0 : 1
  if (key === 'impressions') return current.impressions
  if (key === 'clicks') return current.clicks
  if (key === 'ctr') return current.ctr
  if (key === 'cart_adds') return current.cart_adds
  if (key === 'atc_rate') return current.atc_rate
  if (key === 'purchases') return current.purchases
  if (key === 'purchase_rate') return current.purchase_rate
  if (key === 'cvr') return current.cvr
  if (key === 'sales') return current.sales
  if (key === 'impression_share') return current.impressions
  if (key === 'click_share') return current.clicks
  if (key === 'purchase_share') return current.purchases
  return current.purchases
}

export function sortScpRows(
  rows: readonly WprScpAsinRow[],
  sortState: WprSortState,
  selectedWeek: WeekLabel,
  selectionTotal: WprScpWeekMetrics | null,
): WprScpAsinRow[] {
  const sortKey = sortState.key as ScpSortKey
  const total = selectionTotal === null ? finalizeScpMetrics(emptyScpMetrics()) : selectionTotal
  return [...rows].sort((left, right) => {
    let leftValue = scpSortValueForRow(left, sortKey, selectedWeek)
    let rightValue = scpSortValueForRow(right, sortKey, selectedWeek)

    if (sortKey === 'impression_share') {
      leftValue = safeDiv(selectedWeekScpMetrics(left.weekly, selectedWeek).impressions, total.impressions)
      rightValue = safeDiv(selectedWeekScpMetrics(right.weekly, selectedWeek).impressions, total.impressions)
    }

    if (sortKey === 'click_share') {
      leftValue = safeDiv(selectedWeekScpMetrics(left.weekly, selectedWeek).clicks, total.clicks)
      rightValue = safeDiv(selectedWeekScpMetrics(right.weekly, selectedWeek).clicks, total.clicks)
    }

    if (sortKey === 'purchase_share') {
      leftValue = safeDiv(selectedWeekScpMetrics(left.weekly, selectedWeek).purchases, total.purchases)
      rightValue = safeDiv(selectedWeekScpMetrics(right.weekly, selectedWeek).purchases, total.purchases)
    }

    return compareSortValues(
      leftValue,
      rightValue,
      sortState.dir,
      sortKey === 'asin' ? 'text' : 'number',
    )
  })
}
