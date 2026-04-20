import test from 'node:test'
import assert from 'node:assert/strict'
import { createBusinessReportsSelectionViewModel } from './business-reports-view-model'
import type {
  WprBusinessAsinRow,
  WprBusinessDailyPoint,
  WprBusinessMetrics,
  WprBusinessReportsWindow,
  WprBusinessWeekMetrics,
} from './types'

function buildBusinessMetrics(overrides: Partial<WprBusinessMetrics>): WprBusinessMetrics {
  return {
    asin_count: 1,
    sessions: 0,
    page_views: 0,
    order_items: 0,
    units_ordered: 0,
    sales: 0,
    order_item_session_percentage: 0,
    unit_session_percentage: 0,
    buy_box_percentage: 0,
    ...overrides,
  }
}

function buildBusinessWeekMetrics(
  weekLabel: 'W15' | 'W16',
  overrides: Partial<WprBusinessWeekMetrics>,
): WprBusinessWeekMetrics {
  return {
    week_label: weekLabel,
    week_number: weekLabel === 'W15' ? 15 : 16,
    start_date: weekLabel === 'W15' ? '2026-04-05' : '2026-04-12',
    ...buildBusinessMetrics({}),
    ...overrides,
  }
}

function buildBusinessAsinRow(
  id: string,
  asin: string,
  currentWeek: WprBusinessMetrics,
  weekly: WprBusinessWeekMetrics[],
): WprBusinessAsinRow {
  return {
    id,
    asin,
    is_target: id === 'asin-a',
    weeks_present_selected_week: 1,
    weeks_present_baseline: weekly.length,
    current_week: currentWeek,
    baseline_to_anchor: currentWeek,
    weekly,
    ...currentWeek,
  }
}

function buildDailyPoint(
  date: string,
  overrides: Partial<WprBusinessDailyPoint>,
): WprBusinessDailyPoint {
  return {
    date,
    date_label: date,
    day_label: date,
    weekday_label: 'Sun',
    change_count: 0,
    change_titles: [],
    ...buildBusinessMetrics({}),
    ...overrides,
  }
}

function buildBusinessWindow(): WprBusinessReportsWindow {
  const asinAWeek15 = buildBusinessWeekMetrics('W15', {
    sessions: 90,
    page_views: 130,
    order_items: 10,
    units_ordered: 13,
    sales: 140,
    order_item_session_percentage: 10 / 90,
    unit_session_percentage: 13 / 90,
    buy_box_percentage: 0.8,
  })
  const asinAWeek16 = buildBusinessWeekMetrics('W16', {
    sessions: 120,
    page_views: 180,
    order_items: 16,
    units_ordered: 22,
    sales: 220,
    order_item_session_percentage: 16 / 120,
    unit_session_percentage: 22 / 120,
    buy_box_percentage: 0.75,
  })
  const asinBWeek15 = buildBusinessWeekMetrics('W15', {
    sessions: 50,
    page_views: 80,
    order_items: 4,
    units_ordered: 5,
    sales: 60,
    order_item_session_percentage: 4 / 50,
    unit_session_percentage: 5 / 50,
    buy_box_percentage: 0.5,
  })
  const asinBWeek16 = buildBusinessWeekMetrics('W16', {
    sessions: 60,
    page_views: 90,
    order_items: 5,
    units_ordered: 7,
    sales: 70,
    order_item_session_percentage: 5 / 60,
    unit_session_percentage: 7 / 60,
    buy_box_percentage: 0.6,
  })

  return {
    meta: {
      targetAsin: 'TARGETASIN',
      selectedWeek: 'W16',
      availableWeeks: ['W15', 'W16'],
    },
    current_week: buildBusinessMetrics({
      asin_count: 2,
      sessions: 180,
      page_views: 270,
      order_items: 21,
      units_ordered: 29,
      sales: 290,
      order_item_session_percentage: 21 / 180,
      unit_session_percentage: 29 / 180,
      buy_box_percentage: (0.75 * 180 + 0.6 * 90) / 270,
    }),
    baseline_to_anchor: buildBusinessMetrics({ asin_count: 2 }),
    weekly: [
      buildBusinessWeekMetrics('W15', {
        asin_count: 2,
        sessions: 140,
        page_views: 210,
        order_items: 14,
        units_ordered: 18,
        sales: 200,
        order_item_session_percentage: 14 / 140,
        unit_session_percentage: 18 / 140,
        buy_box_percentage: (0.8 * 130 + 0.5 * 80) / 210,
      }),
      buildBusinessWeekMetrics('W16', {
        asin_count: 2,
        sessions: 180,
        page_views: 270,
        order_items: 21,
        units_ordered: 29,
        sales: 290,
        order_item_session_percentage: 21 / 180,
        unit_session_percentage: 29 / 180,
        buy_box_percentage: (0.75 * 180 + 0.6 * 90) / 270,
      }),
    ],
    dailyByWeek: {
      W16: [
        buildDailyPoint('2026-04-12', {
          sessions: 20,
          page_views: 30,
          order_items: 2,
          units_ordered: 3,
          sales: 25,
          order_item_session_percentage: 0.1,
          unit_session_percentage: 0.15,
          buy_box_percentage: 0.7,
        }),
      ],
    },
    asins: [
      buildBusinessAsinRow('asin-a', 'ASIN-A', asinAWeek16, [asinAWeek15, asinAWeek16]),
      buildBusinessAsinRow('asin-b', 'ASIN-B', asinBWeek16, [asinBWeek15, asinBWeek16]),
    ],
  }
}

test('createBusinessReportsSelectionViewModel aggregates selected ASINs into current-week sessions', () => {
  const vm = createBusinessReportsSelectionViewModel({
    window: buildBusinessWindow(),
    selectedAsinIds: new Set(['asin-a']),
    selectedWeek: 'W16',
  })

  assert.equal(vm.scopeType, 'asin')
  assert.equal(vm.current?.sessions, 120)
  assert.equal(vm.current?.page_views, 180)
  assert.equal(vm.current?.order_items, 16)
  assert.equal(vm.current?.buy_box_percentage, 0.75)
  assert.deepEqual(vm.selectedIds, ['asin-a'])
})

test('createBusinessReportsSelectionViewModel returns all rows when every ASIN is selected', () => {
  const window = buildBusinessWindow()
  const vm = createBusinessReportsSelectionViewModel({
    window,
    selectedAsinIds: new Set(['asin-a', 'asin-b']),
    selectedWeek: 'W16',
  })

  assert.equal(vm.scopeType, 'all')
  assert.equal(vm.current?.sessions, 180)
  assert.equal(vm.current?.buy_box_percentage, (0.75 * 180 + 0.6 * 90) / 270)
  assert.equal(vm.weekly.length, window.weekly.length)
  assert.equal(vm.isAllSelected, true)
})
