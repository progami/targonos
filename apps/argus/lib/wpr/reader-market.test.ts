import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createWprWeekSummary, getWprWeekSummary } from './reader'

function buildScpMetrics() {
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

function buildWeekBundle(anchorWeek: string) {
  return {
    meta: {
      anchorWeek,
      competitorBrand: 'Competitor',
      competitorAsin: 'B000000002',
      benchmarkPolicy: 'policy',
      competitor: {
        brand: 'Competitor',
        asin: 'B000000002',
        config_source: 'config',
      },
      recentWindow: [anchorWeek],
      baselineWindow: [anchorWeek],
      policy: {
        primary_window: 'recent_4w',
        baseline_window: 'baseline_13w',
        term_truth_set: 'tst',
        dashboard_policy: 'dashboard',
        benchmark_policy: 'benchmark',
      },
    },
    weeks: [anchorWeek],
    clusters: [],
    scatterClusterIds: [],
    lineClusterIds: [],
    shareClusterIds: [],
    ppcClusterIds: [],
    defaultClusterIds: [],
    sqpTerms: [],
    sqpClusterTerms: {},
    sqpGlobalTermIds: [],
    regression: {
      slope: 0,
      intercept: 0,
    },
    brandMetricsWindow: {},
    brandMetrics: {},
    competitorWeekly: [],
    scp: {
      meta: {
        targetAsin: 'B000000001',
        recentWindow: [anchorWeek],
        baselineWindow: [anchorWeek],
      },
      current_week: buildScpMetrics(),
      recent_4w: buildScpMetrics(),
      baseline_to_anchor: buildScpMetrics(),
      weekly: [],
      asins: [],
    },
    businessReports: {
      meta: {
        targetAsin: 'B000000001',
        selectedWeek: anchorWeek,
        availableWeeks: [anchorWeek],
      },
      current_week: {
        asin_count: 0,
        sessions: 0,
        page_views: 0,
        order_items: 0,
        units_ordered: 0,
        sales: 0,
        order_item_session_percentage: 0,
        unit_session_percentage: 0,
        buy_box_percentage: 0,
      },
      baseline_to_anchor: {
        asin_count: 0,
        sessions: 0,
        page_views: 0,
        order_items: 0,
        units_ordered: 0,
        sales: 0,
        order_item_session_percentage: 0,
        unit_session_percentage: 0,
        buy_box_percentage: 0,
      },
      weekly: [],
      dailyByWeek: {},
      asins: [],
    },
  }
}

const weekStartDateByLabel: Record<string, string> = {
  W07: '2026-02-08',
  W08: '2026-02-15',
  W16: '2026-04-12',
  W17: '2026-04-19',
  W18: '2026-04-26',
}

function writePayload(dataDir: string, stableWeek: string, latestCompletedWeek: string) {
  const currentWeek = 'W18'
  const weeks = [stableWeek, latestCompletedWeek, currentWeek]
  const windowsByWeek: Record<string, ReturnType<typeof buildWeekBundle>> = {}
  const weekStartDates: Record<string, string> = {}
  const changeLogByWeek: Record<string, unknown[]> = {}
  for (const week of weeks) {
    windowsByWeek[week] = buildWeekBundle(week)
    weekStartDates[week] = weekStartDateByLabel[week]
    changeLogByWeek[week] = []
  }
  const bundle = windowsByWeek[currentWeek]
  writeFileSync(
    path.join(dataDir, 'wpr-data-latest.json'),
    JSON.stringify({
      ...bundle,
      defaultWeek: currentWeek,
      weeks,
      weekStartDates,
      sourceOverview: {
        week_labels: weeks,
        latest_week: currentWeek,
        weeks_with_data: weeks.length,
        source_completeness: 'ok',
        critical_gaps: [],
        matrix: [],
      },
      windowsByWeek,
      changeLogByWeek,
      audit: {},
    }),
  )
}

test('getWprWeekSummary caches payloads by market and path', async () => {
  const usDataDir = mkdtempSync(path.join(tmpdir(), 'argus-wpr-us-'))
  const ukDataDir = mkdtempSync(path.join(tmpdir(), 'argus-wpr-uk-'))
  writePayload(usDataDir, 'W16', 'W17')
  writePayload(ukDataDir, 'W07', 'W08')

  process.env.ARGUS_SALES_ROOT_US = path.join(usDataDir, '..', '..')
  process.env.ARGUS_SALES_ROOT_UK = path.join(ukDataDir, '..', '..')
  process.env.WPR_DATA_DIR_US = usDataDir
  process.env.WPR_DATA_DIR_UK = ukDataDir

  const usSummary = await getWprWeekSummary('us')
  const ukSummary = await getWprWeekSummary('uk')

  assert.equal(usSummary.defaultWeek, 'W16')
  assert.equal(ukSummary.defaultWeek, 'W07')
})

test('createWprWeekSummary excludes current and newest completed weeks by default', () => {
  const summary = createWprWeekSummary({
    defaultWeek: 'W18',
    weeks: ['W16', 'W17', 'W18'],
    weekStartDates: {
      W16: '2026-04-12',
      W17: '2026-04-19',
      W18: '2026-04-26',
    },
  }, new Date('2026-04-28T16:00:00.000Z'))

  assert.equal(summary.defaultWeek, 'W16')
  assert.deepEqual(summary.weeks, ['W16'])
  assert.deepEqual(summary.weekStartDates, {
    W16: '2026-04-12',
  })
})
