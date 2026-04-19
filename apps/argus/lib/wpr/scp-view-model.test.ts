import test from 'node:test'
import assert from 'node:assert/strict'
import { createScpSelectionViewModel } from './scp-view-model'
import type { WprScpAsinRow, WprScpMetrics, WprScpWeekMetrics, WprScpWindow } from './types'

function buildScpMetrics(overrides: Partial<WprScpMetrics>): WprScpMetrics {
  return {
    asin_count: 1,
    impressions: 0,
    clicks: 0,
    cart_adds: 0,
    purchases: 0,
    sales: 0,
    ctr: 0,
    atc_rate: 0,
    purchase_rate: 0,
    cvr: 0,
    ...overrides,
  }
}

function buildScpWeekMetrics(
  weekLabel: 'W15' | 'W16',
  overrides: Partial<WprScpWeekMetrics>,
): WprScpWeekMetrics {
  return {
    week_label: weekLabel,
    week_number: weekLabel === 'W15' ? 15 : 16,
    start_date: weekLabel === 'W15' ? '2026-04-05' : '2026-04-12',
    ...buildScpMetrics({}),
    ...overrides,
  }
}

function buildScpAsinRow(
  id: string,
  asin: string,
  currentWeek: WprScpMetrics,
  weekly: WprScpWeekMetrics[],
): WprScpAsinRow {
  return {
    id,
    asin,
    is_target: id === 'asin-a',
    impression_share: 0,
    click_share: 0,
    cart_add_share: 0,
    purchase_share: 0,
    sales_share: 0,
    weeks_present_selected_week: 1,
    weeks_present_baseline: weekly.length,
    current_week: currentWeek,
    recent_4w: currentWeek,
    baseline_to_anchor: currentWeek,
    weekly,
    ...currentWeek,
  }
}

function buildScpWindow(): WprScpWindow {
  const asinAWeek15 = buildScpWeekMetrics('W15', {
    impressions: 80,
    clicks: 12,
    cart_adds: 6,
    purchases: 4,
    sales: 90,
    ctr: 0.15,
    atc_rate: 0.5,
    purchase_rate: 4 / 6,
    cvr: 4 / 12,
  })
  const asinAWeek16 = buildScpWeekMetrics('W16', {
    impressions: 120,
    clicks: 20,
    cart_adds: 10,
    purchases: 14,
    sales: 210,
    ctr: 20 / 120,
    atc_rate: 0.5,
    purchase_rate: 14 / 10,
    cvr: 14 / 20,
  })
  const asinBWeek15 = buildScpWeekMetrics('W15', {
    impressions: 40,
    clicks: 8,
    cart_adds: 4,
    purchases: 2,
    sales: 45,
    ctr: 0.2,
    atc_rate: 0.5,
    purchase_rate: 0.5,
    cvr: 0.25,
  })
  const asinBWeek16 = buildScpWeekMetrics('W16', {
    impressions: 60,
    clicks: 12,
    cart_adds: 6,
    purchases: 3,
    sales: 70,
    ctr: 0.2,
    atc_rate: 0.5,
    purchase_rate: 0.5,
    cvr: 0.25,
  })

  return {
    meta: {
      targetAsin: 'TARGETASIN',
      recentWindow: ['W15', 'W16'],
      baselineWindow: ['W15', 'W16'],
    },
    current_week: buildScpMetrics({
      asin_count: 2,
      impressions: 180,
      clicks: 32,
      cart_adds: 16,
      purchases: 17,
      sales: 280,
      ctr: 32 / 180,
      atc_rate: 0.5,
      purchase_rate: 17 / 16,
      cvr: 17 / 32,
    }),
    recent_4w: buildScpMetrics({ asin_count: 2 }),
    baseline_to_anchor: buildScpMetrics({ asin_count: 2 }),
    weekly: [
      buildScpWeekMetrics('W15', {
        asin_count: 2,
        impressions: 120,
        clicks: 20,
        cart_adds: 10,
        purchases: 6,
        sales: 135,
        ctr: 20 / 120,
        atc_rate: 0.5,
        purchase_rate: 0.6,
        cvr: 0.3,
      }),
      buildScpWeekMetrics('W16', {
        asin_count: 2,
        impressions: 180,
        clicks: 32,
        cart_adds: 16,
        purchases: 17,
        sales: 280,
        ctr: 32 / 180,
        atc_rate: 0.5,
        purchase_rate: 17 / 16,
        cvr: 17 / 32,
      }),
    ],
    asins: [
      buildScpAsinRow('asin-a', 'ASIN-A', asinAWeek16, [asinAWeek15, asinAWeek16]),
      buildScpAsinRow('asin-b', 'ASIN-B', asinBWeek16, [asinBWeek15, asinBWeek16]),
    ],
  }
}

test('createScpSelectionViewModel aggregates selected ASINs into current-week shares', () => {
  const vm = createScpSelectionViewModel({
    window: buildScpWindow(),
    selectedAsinIds: new Set(['asin-a']),
    selectedWeek: 'W16',
  })

  assert.equal(vm.scopeType, 'asin')
  assert.equal(vm.current?.purchases, 14)
  assert.equal(vm.current?.impressions, 120)
  assert.equal(vm.current?.asin_count, 1)
  assert.equal(vm.weekly[0]?.purchases, 4)
  assert.deepEqual(vm.selectedIds, ['asin-a'])
})

test('createScpSelectionViewModel returns an empty selection when no ASINs are selected', () => {
  const vm = createScpSelectionViewModel({
    window: buildScpWindow(),
    selectedAsinIds: new Set(),
    selectedWeek: 'W16',
  })

  assert.equal(vm.scopeType, 'empty')
  assert.equal(vm.current, null)
  assert.deepEqual(vm.weekly, [])
  assert.equal(vm.isAllSelected, false)
})
