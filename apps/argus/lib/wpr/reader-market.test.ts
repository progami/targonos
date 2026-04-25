import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getWprWeekSummary } from './reader'

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

function writePayload(dataDir: string, week: string) {
  const bundle = buildWeekBundle(week)
  writeFileSync(
    path.join(dataDir, 'wpr-data-latest.json'),
    JSON.stringify({
      ...bundle,
      defaultWeek: week,
      weekStartDates: {
        [week]: '2026-04-12',
      },
      sourceOverview: {
        week_labels: [week],
        latest_week: week,
        weeks_with_data: 1,
        source_completeness: 'ok',
        critical_gaps: [],
        matrix: [],
      },
      windowsByWeek: {
        [week]: bundle,
      },
      changeLogByWeek: {
        [week]: [],
      },
      audit: {},
    }),
  )
}

test('getWprWeekSummary caches payloads by market and path', async () => {
  const usDataDir = mkdtempSync(path.join(tmpdir(), 'argus-wpr-us-'))
  const ukDataDir = mkdtempSync(path.join(tmpdir(), 'argus-wpr-uk-'))
  writePayload(usDataDir, 'W16')
  writePayload(ukDataDir, 'W07')

  process.env.ARGUS_SALES_ROOT_US = path.join(usDataDir, '..', '..')
  process.env.ARGUS_SALES_ROOT_UK = path.join(ukDataDir, '..', '..')
  process.env.WPR_DATA_DIR_US = usDataDir
  process.env.WPR_DATA_DIR_UK = ukDataDir

  const usSummary = await getWprWeekSummary('us')
  const ukSummary = await getWprWeekSummary('uk')

  assert.equal(usSummary.defaultWeek, 'W16')
  assert.equal(ukSummary.defaultWeek, 'W07')
})
