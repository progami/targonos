import type { WprSortDirection, WprSortState } from './dashboard-state'
import type {
  WeekLabel,
  WprBusinessAsinRow,
  WprBusinessMetrics,
  WprBusinessReportsWindow,
  WprBusinessWeekMetrics,
} from './types'

export type BusinessReportsSelectionScope = 'unavailable' | 'empty' | 'all' | 'asin' | 'multi-asin'

export type BusinessReportsSortKey =
  | 'asin'
  | 'weeks_present_selected_week'
  | 'sessions'
  | 'page_views'
  | 'order_items'
  | 'order_item_session_percentage'
  | 'units_ordered'
  | 'unit_session_percentage'
  | 'buy_box_percentage'
  | 'sales'

export interface BusinessReportsSelectionViewModel {
  scopeType: BusinessReportsSelectionScope
  allIds: string[]
  selectedIds: string[]
  isAllSelected: boolean
  weekly: WprBusinessWeekMetrics[]
  current: WprBusinessWeekMetrics | null
  rows: WprBusinessAsinRow[]
}

export function safeDiv(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0
  }

  return numerator / denominator
}

type MutableBusinessMetrics = WprBusinessMetrics & {
  buy_box_page_views_weighted: number
}

function emptyMutableBusinessMetrics(): MutableBusinessMetrics {
  return {
    asin_count: 0,
    sessions: 0,
    page_views: 0,
    order_items: 0,
    units_ordered: 0,
    sales: 0,
    order_item_session_percentage: 0,
    unit_session_percentage: 0,
    buy_box_percentage: 0,
    buy_box_page_views_weighted: 0,
  }
}

export function emptyBusinessMetrics(): WprBusinessMetrics {
  return {
    asin_count: 0,
    sessions: 0,
    page_views: 0,
    order_items: 0,
    units_ordered: 0,
    sales: 0,
    order_item_session_percentage: 0,
    unit_session_percentage: 0,
    buy_box_percentage: 0,
  }
}

export function finalizeBusinessMetrics(metrics: MutableBusinessMetrics | WprBusinessMetrics): WprBusinessMetrics {
  let weightedBuyBox = 0
  if ('buy_box_page_views_weighted' in metrics) {
    weightedBuyBox = metrics.buy_box_page_views_weighted
  } else {
    weightedBuyBox = metrics.buy_box_percentage * metrics.page_views
  }

  return {
    asin_count: metrics.asin_count,
    sessions: metrics.sessions,
    page_views: metrics.page_views,
    order_items: metrics.order_items,
    units_ordered: metrics.units_ordered,
    sales: metrics.sales,
    order_item_session_percentage: safeDiv(metrics.order_items, metrics.sessions),
    unit_session_percentage: safeDiv(metrics.units_ordered, metrics.sessions),
    buy_box_percentage: safeDiv(weightedBuyBox, metrics.page_views),
  }
}

function buildWeekMetrics(week: WprBusinessWeekMetrics, metrics: MutableBusinessMetrics): WprBusinessWeekMetrics {
  const finalized = finalizeBusinessMetrics(metrics)
  return {
    week_label: week.week_label,
    week_number: week.week_number,
    start_date: week.start_date,
    asin_count: finalized.asin_count,
    sessions: finalized.sessions,
    page_views: finalized.page_views,
    order_items: finalized.order_items,
    units_ordered: finalized.units_ordered,
    sales: finalized.sales,
    order_item_session_percentage: finalized.order_item_session_percentage,
    unit_session_percentage: finalized.unit_session_percentage,
    buy_box_percentage: finalized.buy_box_percentage,
  }
}

function addBusinessMetrics(target: MutableBusinessMetrics, source: WprBusinessMetrics) {
  target.sessions += source.sessions
  target.page_views += source.page_views
  target.order_items += source.order_items
  target.units_ordered += source.units_ordered
  target.sales += source.sales
  target.buy_box_page_views_weighted += source.buy_box_percentage * source.page_views
  if (source.sessions > 0 || source.order_items > 0 || source.units_ordered > 0 || source.sales > 0) {
    target.asin_count += 1
  }
}

function allBusinessAsinIds(window: WprBusinessReportsWindow): string[] {
  return window.asins.map((row) => row.id)
}

export function selectedWeekBusinessRecord(
  series: readonly WprBusinessWeekMetrics[],
  selectedWeek: WeekLabel,
): WprBusinessWeekMetrics | null {
  for (const record of series) {
    if (record.week_label === selectedWeek) {
      return record
    }
  }

  return null
}

export function selectedWeekBusinessMetrics(
  series: readonly WprBusinessWeekMetrics[],
  selectedWeek: WeekLabel,
): WprBusinessWeekMetrics {
  const record = selectedWeekBusinessRecord(series, selectedWeek)
  if (record !== null) {
    return record
  }

  const finalized = finalizeBusinessMetrics(emptyMutableBusinessMetrics())
  return {
    week_label: selectedWeek,
    week_number: Number.parseInt(selectedWeek.replace('W', ''), 10),
    start_date: '',
    asin_count: finalized.asin_count,
    sessions: finalized.sessions,
    page_views: finalized.page_views,
    order_items: finalized.order_items,
    units_ordered: finalized.units_ordered,
    sales: finalized.sales,
    order_item_session_percentage: finalized.order_item_session_percentage,
    unit_session_percentage: finalized.unit_session_percentage,
    buy_box_percentage: finalized.buy_box_percentage,
  }
}

function aggregateSelectedBusinessWeekly(
  window: WprBusinessReportsWindow,
  selectedIds: string[],
): WprBusinessWeekMetrics[] {
  const weekMap = new Map<string, MutableBusinessMetrics>()
  for (const week of window.weekly) {
    weekMap.set(week.week_label, emptyMutableBusinessMetrics())
  }

  for (const asinId of selectedIds) {
    const row = window.asins.find((candidate) => candidate.id === asinId)
    if (row === undefined) {
      continue
    }

    for (const week of row.weekly) {
      const bucket = weekMap.get(week.week_label)
      if (bucket === undefined) {
        throw new Error(`Missing BR week bucket for ${week.week_label}`)
      }

      addBusinessMetrics(bucket, week)
    }
  }

  return window.weekly.map((week) => {
    const bucket = weekMap.get(week.week_label)
    if (bucket === undefined) {
      throw new Error(`Missing BR aggregate for ${week.week_label}`)
    }

    return buildWeekMetrics(week, bucket)
  })
}

export function createBusinessReportsSelectionViewModel(input: {
  window: WprBusinessReportsWindow
  selectedAsinIds: Set<string>
  selectedWeek: WeekLabel
}): BusinessReportsSelectionViewModel {
  const { window, selectedAsinIds, selectedWeek } = input
  const allIds = allBusinessAsinIds(window)
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
      current: selectedWeekBusinessMetrics(window.weekly, selectedWeek),
      rows: window.asins,
    }
  }

  const weekly = aggregateSelectedBusinessWeekly(window, selectedIds)
  return {
    scopeType: selectedIds.length === 1 ? 'asin' : 'multi-asin',
    allIds,
    selectedIds,
    isAllSelected: false,
    weekly,
    current: selectedWeekBusinessMetrics(weekly, selectedWeek),
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

export function businessReportsSortValueForRow(
  row: WprBusinessAsinRow,
  key: BusinessReportsSortKey,
  selectedWeek: WeekLabel,
): number | string {
  const current = selectedWeekBusinessMetrics(row.weekly, selectedWeek)
  if (key === 'asin') return row.asin
  if (key === 'weeks_present_selected_week') return row.weeks_present_selected_week
  if (key === 'sessions') return current.sessions
  if (key === 'page_views') return current.page_views
  if (key === 'order_items') return current.order_items
  if (key === 'order_item_session_percentage') return current.order_item_session_percentage
  if (key === 'units_ordered') return current.units_ordered
  if (key === 'unit_session_percentage') return current.unit_session_percentage
  if (key === 'buy_box_percentage') return current.buy_box_percentage
  if (key === 'sales') return current.sales
  return current.sessions
}

export function sortBusinessReportsRows(
  rows: readonly WprBusinessAsinRow[],
  sortState: WprSortState,
  selectedWeek: WeekLabel,
): WprBusinessAsinRow[] {
  const sortKey = sortState.key as BusinessReportsSortKey
  return [...rows].sort((left, right) => {
    return compareSortValues(
      businessReportsSortValueForRow(left, sortKey, selectedWeek),
      businessReportsSortValueForRow(right, sortKey, selectedWeek),
      sortState.dir,
      sortKey === 'asin' ? 'text' : 'number',
    )
  })
}
