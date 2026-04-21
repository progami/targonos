import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

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
      W15: buildWeekBundle(),
      W16: buildWeekBundle(),
    },
    changeLogByWeek: {
      W15: [{ id: 'chg-15', kind: 'listing', source: 'LISTING ATTRIBUTES', week_label: 'W15', week_number: 15, timestamp: '2026-04-09T00:00:00Z', date_label: '09 Apr 2026', title: 'Week 15 title', summary: 'Week 15 summary', category: 'CONTENT', asins: ['B000000001'] }],
      W16: [{ id: 'chg-16', kind: 'listing', source: 'LISTING ATTRIBUTES', week_label: 'W16', week_number: 16, timestamp: '2026-04-16T00:00:00Z', date_label: '16 Apr 2026', title: 'Week 16 title', summary: 'Week 16 summary', category: 'CONTENT', asins: ['B000000001'] }],
    },
    audit: {},
  }
}

test('GET /api/wpr/changelog/[week] returns only the requested week entries', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'argus-wpr-changelog-week-route-'))
  process.env.WPR_DATA_DIR = dataDir
  writeFileSync(path.join(dataDir, 'wpr-data-latest.json'), JSON.stringify(buildPayload()))

  const mod = await import('./changelog/[week]/route')
  const response = await mod.GET(new Request('http://localhost/api/wpr/changelog/W16'), {
    params: Promise.resolve({ week: 'W16' }),
  })
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(payload, [
    {
      id: 'chg-16',
      kind: 'listing',
      source: 'LISTING ATTRIBUTES',
      week_label: 'W16',
      week_number: 16,
      timestamp: '2026-04-16T00:00:00Z',
      date_label: '16 Apr 2026',
      title: 'Week 16 title',
      summary: 'Week 16 summary',
      category: 'CONTENT',
      asins: ['B000000001'],
    },
  ])
})

test('GET /api/wpr/changelog/[week] returns 404 for an unknown week', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'argus-wpr-changelog-week-route-'))
  process.env.WPR_DATA_DIR = dataDir
  writeFileSync(path.join(dataDir, 'wpr-data-latest.json'), JSON.stringify(buildPayload()))

  const mod = await import('./changelog/[week]/route')
  const response = await mod.GET(new Request('http://localhost/api/wpr/changelog/W99'), {
    params: Promise.resolve({ week: 'W99' }),
  })
  const payload = await response.json()

  assert.equal(response.status, 404)
  assert.equal(payload.error, 'Unknown WPR week: W99')
})
