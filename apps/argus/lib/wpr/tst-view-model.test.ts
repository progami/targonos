import test from 'node:test'
import assert from 'node:assert/strict'
import { competitorTermKey, createTstViewModel } from './tst-view-model'
import type {
  WprBenchmarkCompetitor,
  WprBusinessReportsWindow,
  WprCluster,
  WprCompetitorSummary,
  WprScpWindow,
  WprTstObserved,
  WprTstTermRow,
  WprTstWeeklyWindow,
  WprTstWindow,
  WprWeekBundle,
} from './types'

function buildCompetitor(): WprBenchmarkCompetitor {
  return {
    identity: { brand: 'Competitor', asin: 'B000TEST', config_source: 'config' },
    coverage: {
      weeks_keywords_recent_4w: 0,
      weeks_keywords_baseline_13w: 0,
      recent_rank_coverage_strength: 'none',
      benchmark_available: false,
    },
    raw_input: {
      recent_4w: { weeks_present: [], weeks_keywords: 0, avg_rank: null, best_rank: null, visibility_est: null },
      baseline_13w: { weeks_present: [], weeks_keywords: 0, avg_rank: null, best_rank: null, visibility_est: null },
    },
    estimated_output: {
      recent_4w: { visibility_est: null },
      baseline_13w: { visibility_est: null },
    },
    gap_to_target: { rank_recent_4w: null, rank_best_recent_4w: null, rank_baseline_13w: null },
    benchmark_available: false,
  }
}

function buildCompetitorSummary(): WprCompetitorSummary {
  return { brand: 'Competitor', asin: 'B000TEST', config_source: 'config' }
}

function buildObserved(overrides: Partial<WprTstObserved>): WprTstObserved {
  return {
    total_click_pool_share: 0.7,
    total_purchase_pool_share: 0.6,
    our_click_share_points: 0.14,
    our_purchase_share_points: 0.15,
    competitor_click_share_points: 0.21,
    competitor_purchase_share_points: 0.18,
    other_click_share_points: 0.35,
    other_purchase_share_points: 0.27,
    our_click_share: 0.2,
    our_purchase_share: 0.25,
    competitor_click_share: 0.3,
    competitor_purchase_share: 0.3,
    other_click_share: 0.5,
    other_purchase_share: 0.45,
    click_gap: -0.1,
    purchase_gap: -0.05,
    ...overrides,
  }
}

function buildTermRow(term: string, overrides: Partial<WprTstTermRow>): WprTstTermRow {
  return {
    term,
    weeks_present: 2,
    search_frequency_rank: 10,
    click_pool_share: 0.4,
    purchase_pool_share: 0.35,
    avg_click_pool_share: 0.2,
    avg_purchase_pool_share: 0.18,
    our_click_share: 0.14,
    our_purchase_share: 0.12,
    competitor_click_share: 0.27,
    competitor_purchase_share: 0.31,
    other_click_share: 0.59,
    other_purchase_share: 0.57,
    click_gap: -0.13,
    purchase_gap: -0.19,
    ...overrides,
  }
}

function buildWindow(termRows: WprTstTermRow[], overrides?: Partial<WprTstWindow>): WprTstWindow {
  return {
    source: 'TST',
    method: 'observed_top_clicked_asin_pool',
    coverage: {
      terms_total: 2,
      terms_covered: termRows.length,
      weeks_present: 2,
      term_weeks_covered: termRows.reduce((sum, row) => sum + row.weeks_present, 0),
      avg_click_pool_share: 0.24,
      avg_purchase_pool_share: 0.22,
    },
    observed: buildObserved({ competitor_purchase_share: 0.29 }),
    term_rows: termRows,
    top_terms: termRows,
    ...overrides,
  }
}

function buildWeeklyWindow(weekLabel: 'W15' | 'W16', termRows: WprTstTermRow[], overrides?: Partial<WprTstWeeklyWindow>): WprTstWeeklyWindow {
  return {
    ...buildWindow(termRows, overrides),
    week_label: weekLabel,
    week_number: weekLabel === 'W15' ? 15 : 16,
    start_date: weekLabel === 'W15' ? '2026-04-05' : '2026-04-12',
  }
}

function buildCluster(id: string, cluster: string, family: string, weekly: WprTstWeeklyWindow[]): WprCluster {
  const competitor = buildCompetitor()
  return {
    id,
    cluster,
    family,
    core: true,
    terms_count: 2,
    search_volume: 100,
    query_volume: 50,
    market_impressions: 1000,
    asin_impressions: 200,
    market_clicks: 250,
    asin_clicks: 60,
    market_cart_adds: 90,
    asin_cart_adds: 20,
    market_purchases: 45,
    asin_purchases: 12,
    market_ctr: 0.25,
    market_cvr: 0.18,
    asin_ctr: 0.3,
    asin_cvr: 0.2,
    impression_share: 0.2,
    click_share: 0.24,
    cart_add_rate: 0.36,
    asin_cart_add_rate: 0.33,
    cart_add_share: 0.22,
    purchase_share: 0.27,
    avg_rank: 8,
    rank_change: -1,
    rank_gap: -2,
    rank_volatility: 1.5,
    rank_weeks: 2,
    weeks_covered: 2,
    ppc_clicks: 10,
    ppc_spend: 50,
    ppc_sales: 100,
    ppc_acos: 0.5,
    ppc_cvr: 0.2,
    expected_rank: 7,
    top_terms: weekly[1]?.term_rows.map((row) => row.term) ?? [],
    weekly: [],
    coverage: {
      weeks_sqp: 0,
      weeks_rank: 2,
      weeks_ppc: 2,
      recent_4w: { weeks_sqp: 0, weeks_rank: 2, weeks_ppc: 2 },
      baseline_to_anchor: { weeks_sqp: 0, weeks_rank: 2, weeks_ppc: 2 },
    },
    eligibility: { rank_eligible: true },
    observed: {
      current_week: {
        week_label: 'W16',
        week_number: 16,
        start_date: '2026-04-12',
        market_impressions: 0,
        asin_impressions: 0,
        market_clicks: 0,
        asin_clicks: 0,
        market_cart_adds: 0,
        asin_cart_adds: 0,
        market_purchases: 0,
        asin_purchases: 0,
        query_volume: 0,
        ppc_impressions: 0,
        ppc_clicks: 0,
        ppc_spend: 0,
        ppc_sales: 0,
        ppc_orders: 0,
        rank_weight: 0,
        rank_sum: 0,
        rank_span_sum: 0,
        rank_term_count: 0,
        rank_weeks: 0,
        weeks_in_window: 0,
        avg_rank: null,
        rank_volatility: null,
        market_ctr: 0,
        market_cvr: 0,
        asin_ctr: 0,
        asin_cvr: 0,
        impression_share: 0,
        click_share: 0,
        cart_add_rate: 0,
        asin_cart_add_rate: 0,
        cart_add_share: 0,
        purchase_share: 0,
        ppc_acos: 0,
        ppc_cvr: 0,
      },
      recent_4w: {
        week_label: 'W16',
        week_number: 16,
        start_date: '2026-04-12',
        market_impressions: 0,
        asin_impressions: 0,
        market_clicks: 0,
        asin_clicks: 0,
        market_cart_adds: 0,
        asin_cart_adds: 0,
        market_purchases: 0,
        asin_purchases: 0,
        query_volume: 0,
        ppc_impressions: 0,
        ppc_clicks: 0,
        ppc_spend: 0,
        ppc_sales: 0,
        ppc_orders: 0,
        rank_weight: 0,
        rank_sum: 0,
        rank_span_sum: 0,
        rank_term_count: 0,
        rank_weeks: 0,
        weeks_in_window: 0,
        avg_rank: null,
        rank_volatility: null,
        market_ctr: 0,
        market_cvr: 0,
        asin_ctr: 0,
        asin_cvr: 0,
        impression_share: 0,
        click_share: 0,
        cart_add_rate: 0,
        asin_cart_add_rate: 0,
        cart_add_share: 0,
        purchase_share: 0,
        ppc_acos: 0,
        ppc_cvr: 0,
      },
      baseline_13w: {
        week_label: 'W16',
        week_number: 16,
        start_date: '2026-04-12',
        market_impressions: 0,
        asin_impressions: 0,
        market_clicks: 0,
        asin_clicks: 0,
        market_cart_adds: 0,
        asin_cart_adds: 0,
        market_purchases: 0,
        asin_purchases: 0,
        query_volume: 0,
        ppc_impressions: 0,
        ppc_clicks: 0,
        ppc_spend: 0,
        ppc_sales: 0,
        ppc_orders: 0,
        rank_weight: 0,
        rank_sum: 0,
        rank_span_sum: 0,
        rank_term_count: 0,
        rank_weeks: 0,
        weeks_in_window: 0,
        avg_rank: null,
        rank_volatility: null,
        market_ctr: 0,
        market_cvr: 0,
        asin_ctr: 0,
        asin_cvr: 0,
        impression_share: 0,
        click_share: 0,
        cart_add_rate: 0,
        asin_cart_add_rate: 0,
        cart_add_share: 0,
        purchase_share: 0,
        ppc_acos: 0,
        ppc_cvr: 0,
      },
    },
    benchmark: { competitor },
    tstCompare: {
      recent_4w: buildWindow(weekly[1]?.term_rows ?? []),
      baseline_13w: buildWindow(weekly[1]?.term_rows ?? []),
      competitor: buildCompetitorSummary(),
      weekly,
    },
  }
}

function buildBundle(): WprWeekBundle {
  const rootOneWeekly = [
    buildWeeklyWindow('W15', [
      buildTermRow('term 1', { competitor_purchase_share: 0.31, our_purchase_share: 0.17, purchase_gap: -0.14 }),
      buildTermRow('term 2', { competitor_purchase_share: 0.22, our_purchase_share: 0.2, purchase_gap: -0.02, search_frequency_rank: 25 }),
    ], { observed: buildObserved({ competitor_purchase_share: 0.28, our_purchase_share: 0.18, purchase_gap: -0.10 }) }),
    buildWeeklyWindow('W16', [
      buildTermRow('term 1', { competitor_purchase_share: 0.31, our_purchase_share: 0.19, purchase_gap: -0.12 }),
      buildTermRow('term 2', { competitor_purchase_share: 0.24, our_purchase_share: 0.18, purchase_gap: -0.06, search_frequency_rank: 25 }),
    ], { observed: buildObserved({ competitor_purchase_share: 0.3, our_purchase_share: 0.2, purchase_gap: -0.1 }) }),
  ]

  const rootTwoWeekly = [
    buildWeeklyWindow('W15', [buildTermRow('term 3', { competitor_purchase_share: 0.2, our_purchase_share: 0.22, purchase_gap: 0.02 })]),
    buildWeeklyWindow('W16', [buildTermRow('term 3', { competitor_purchase_share: 0.18, our_purchase_share: 0.24, purchase_gap: 0.06 })]),
  ]

  return {
    meta: {
      anchorWeek: 'W16',
      competitorBrand: 'Competitor',
      competitorAsin: 'B000TEST',
      benchmarkPolicy: 'context_only',
      competitor: { brand: 'Competitor', asin: 'B000TEST', config_source: 'config' },
      recentWindow: ['W15', 'W16'],
      baselineWindow: ['W15', 'W16'],
      policy: {
        primary_window: 'selected_week',
        baseline_window: 'baseline_13w',
        term_truth_set: 'sqp_backed_only',
        dashboard_policy: 'raw_first',
        benchmark_policy: 'context_only',
      },
    },
    weeks: ['W15', 'W16'],
    clusters: [
      buildCluster('cluster-1', 'Root One', 'Family A', rootOneWeekly),
      buildCluster('cluster-2', 'Root Two', 'Family B', rootTwoWeekly),
    ],
    scatterClusterIds: ['cluster-1', 'cluster-2'],
    lineClusterIds: ['cluster-1', 'cluster-2'],
    shareClusterIds: ['cluster-1'],
    ppcClusterIds: ['cluster-1', 'cluster-2'],
    defaultClusterIds: ['cluster-1'],
    sqpTerms: [],
    sqpClusterTerms: {},
    sqpGlobalTermIds: [],
    regression: { slope: 0, intercept: 0 },
    brandMetrics: {
      W15: { awareness: 100, consideration: 80, purchase: 40 },
      W16: { awareness: 120, consideration: 90, purchase: 50 },
    },
    brandMetricsWindow: {
      W15: { awareness: 100, consideration: 80, purchase: 40 },
      W16: { awareness: 120, consideration: 90, purchase: 50 },
    },
    competitorWeekly: [],
    scp: buildScpWindow(),
    businessReports: buildBusinessReportsWindow(),
  }
}

function buildScpWindow(): WprScpWindow {
  return {
    meta: {
      targetAsin: 'B000TEST',
      recentWindow: ['W15', 'W16'],
      baselineWindow: ['W15', 'W16'],
    },
    current_week: {
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
    },
    recent_4w: {
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
    },
    baseline_to_anchor: {
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
    },
    weekly: [],
    asins: [],
  }
}

function buildBusinessReportsWindow(): WprBusinessReportsWindow {
  return {
    meta: {
      targetAsin: 'B000TEST',
      selectedWeek: 'W16',
      availableWeeks: ['W15', 'W16'],
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
  }
}

test('createTstViewModel aggregates competitor term selection into current and weekly rows', () => {
  const vm = createTstViewModel({
    bundle: buildBundle(),
    selectedRootIds: new Set(['cluster-1']),
    selectedTermIds: new Set([competitorTermKey('Root One', 'term 1')]),
    selectedWeek: 'W16',
  })

  assert.equal(vm.scopeType, 'term')
  assert.equal(vm.current?.observed.competitor_purchase_share, 0.31)
  assert.equal(vm.weekly[0]?.week_label, 'W15')
  assert.equal(vm.rootRows[0]?.id, 'cluster-1')
  assert.equal(vm.termRowsByRoot['cluster-1']?.[0]?.id, competitorTermKey('Root One', 'term 1'))
})
