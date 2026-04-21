import test from 'node:test'
import assert from 'node:assert/strict'
import { assertWprPayloadContract } from './payload-contract'

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

function buildScpWindow() {
  return {
    meta: {
      targetAsin: 'B000000001',
      recentWindow: ['W15', 'W16'],
      baselineWindow: ['W03', 'W16'],
    },
    current_week: buildScpMetrics(),
    recent_4w: buildScpMetrics(),
    baseline_to_anchor: buildScpMetrics(),
    weekly: [],
    asins: [],
  }
}

function buildBusinessMetrics() {
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

function buildBusinessReportsWindow() {
  return {
    meta: {
      targetAsin: 'B000000001',
      selectedWeek: 'W16',
      availableWeeks: ['W15', 'W16'],
    },
    current_week: buildBusinessMetrics(),
    baseline_to_anchor: buildBusinessMetrics(),
    weekly: [],
    dailyByWeek: {},
    asins: [],
  }
}

function buildWeekBundle() {
  return {
    meta: {
      anchorWeek: 'W16',
      competitorBrand: 'Competitor',
      competitorAsin: 'B000000002',
      benchmarkPolicy: 'policy',
      competitor: {
        brand: 'Competitor',
        asin: 'B000000002',
        config_source: 'config',
      },
      recentWindow: ['W15', 'W16'],
      baselineWindow: ['W03', 'W16'],
      policy: {
        primary_window: 'recent_4w',
        baseline_window: 'baseline_13w',
        term_truth_set: 'tst',
        dashboard_policy: 'dashboard',
        benchmark_policy: 'benchmark',
      },
    },
    weeks: ['W15', 'W16'],
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
    scp: buildScpWindow(),
    businessReports: buildBusinessReportsWindow(),
  }
}

function buildPayload() {
  return {
    ...buildWeekBundle(),
    defaultWeek: 'W16',
    weekStartDates: {
      W15: '2026-04-05',
      W16: '2026-04-12',
    },
    sourceOverview: {
      week_labels: ['W15', 'W16'],
      latest_week: 'W16',
      weeks_with_data: 2,
      source_completeness: 'ok',
      critical_gaps: [],
      matrix: [],
    },
    windowsByWeek: {
      W16: buildWeekBundle(),
    },
    changeLogByWeek: {
      W16: [],
    },
    audit: {},
  }
}

test('assertWprPayloadContract accepts a minimal valid payload', () => {
  const payload = buildPayload()

  assert.doesNotThrow(() => {
    assertWprPayloadContract(payload)
  })
})

test('assertWprPayloadContract rejects payloads missing top-level scp', () => {
  const payload = buildPayload() as Record<string, unknown>
  delete payload.scp

  assert.throws(() => {
    assertWprPayloadContract(payload)
  }, /payload\.scp is required/)
})

test('assertWprPayloadContract rejects payloads missing week bundle businessReports', () => {
  const payload = buildPayload() as {
    windowsByWeek: Record<string, Record<string, unknown>>
  }
  delete payload.windowsByWeek.W16.businessReports

  assert.throws(() => {
    assertWprPayloadContract(payload)
  }, /payload\.windowsByWeek\.W16\.businessReports is required/)
})
