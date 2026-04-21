import test from 'node:test'
import assert from 'node:assert/strict'
import { createSqpSelectionViewModel, sortSqpRootRows, sortSqpTermRows } from './sqp-view-model'
import type { WprWeekBundle } from './types'

function buildObserved(queryVolume: number, purchases: number) {
  return {
    week_label: 'W16',
    week_number: 16,
    start_date: '2026-04-12',
    market_impressions: 100,
    asin_impressions: 20,
    market_clicks: 40,
    asin_clicks: 10,
    market_cart_adds: 20,
    asin_cart_adds: 5,
    market_purchases: purchases * 5,
    asin_purchases: purchases,
    query_volume: queryVolume,
    ppc_impressions: 0,
    ppc_clicks: 0,
    ppc_spend: 0,
    ppc_sales: 0,
    ppc_orders: 0,
    rank_weight: 10,
    rank_sum: 30,
    rank_span_sum: 6,
    rank_term_count: 2,
    rank_weeks: 1,
    weeks_in_window: 1,
    avg_rank: 3,
    rank_volatility: 3,
    market_ctr: 0.4,
    market_cvr: 0.25,
    asin_ctr: 0.5,
    asin_cvr: 0.2,
    impression_share: 0.2,
    click_share: 0.25,
    cart_add_rate: 0.5,
    asin_cart_add_rate: 0.5,
    cart_add_share: 0.25,
    purchase_share: purchases === 0 ? 0 : 0.2,
    ppc_acos: 0,
    ppc_cvr: 0,
  }
}

function buildBundle(): WprWeekBundle {
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
      baselineWindow: ['W15', 'W16'],
      policy: {
        primary_window: 'recent_4w',
        baseline_window: 'baseline_13w',
        term_truth_set: 'tst',
        dashboard_policy: 'dashboard',
        benchmark_policy: 'benchmark',
      },
    },
    weeks: ['W15', 'W16'],
    clusters: [
      {
        id: 'cluster-1',
        cluster: 'Root One',
        family: 'Family',
        core: true,
        terms_count: 2,
        search_volume: 100,
        query_volume: 20,
        market_impressions: 100,
        asin_impressions: 20,
        market_clicks: 40,
        asin_clicks: 10,
        market_cart_adds: 20,
        asin_cart_adds: 5,
        market_purchases: 10,
        asin_purchases: 2,
        market_ctr: 0.4,
        market_cvr: 0.25,
        asin_ctr: 0.5,
        asin_cvr: 0.2,
        impression_share: 0.2,
        click_share: 0.25,
        cart_add_rate: 0.5,
        asin_cart_add_rate: 0.5,
        cart_add_share: 0.25,
        purchase_share: 0.2,
        avg_rank: 3,
        rank_change: 0,
        rank_gap: 0,
        rank_volatility: 3,
        rank_weeks: 1,
        weeks_covered: 2,
        ppc_clicks: 0,
        ppc_spend: 0,
        ppc_sales: 0,
        ppc_acos: 0,
        ppc_cvr: 0,
        expected_rank: 3,
        top_terms: ['alpha', 'beta'],
        weekly: [buildObserved(10, 1), buildObserved(20, 2)],
        coverage: {
          weeks_sqp: 1,
          weeks_rank: 1,
          weeks_ppc: 0,
          terms_total: 2,
          terms_sqp: 2,
          terms_rank: 1,
          terms_ppc: 0,
          recent_4w: { weeks_sqp: 1, weeks_rank: 1, weeks_ppc: 0, terms_sqp: 2, terms_rank: 1, terms_ppc: 0 },
          baseline_to_anchor: { weeks_sqp: 1, weeks_rank: 1, weeks_ppc: 0 },
        },
        eligibility: {},
        observed: {
          current_week: buildObserved(20, 2),
          recent_4w: buildObserved(20, 2),
          baseline_13w: buildObserved(20, 2),
        },
        benchmark: {
          competitor: {
            identity: { brand: 'Competitor', asin: 'B', config_source: 'cfg' },
            coverage: { weeks_keywords_recent_4w: 0, weeks_keywords_baseline_13w: 0, recent_rank_coverage_strength: 'none', benchmark_available: false },
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
          },
        },
        tstCompare: {
          recent_4w: { source: '', method: '', coverage: { terms_total: 0, terms_covered: 0, weeks_present: 0, term_weeks_covered: 0, avg_click_pool_share: 0, avg_purchase_pool_share: 0 }, observed: { total_click_pool_share: 0, total_purchase_pool_share: 0, our_click_share_points: 0, our_purchase_share_points: 0, competitor_click_share_points: 0, competitor_purchase_share_points: 0, other_click_share_points: 0, other_purchase_share_points: 0, our_click_share: 0, our_purchase_share: 0, competitor_click_share: 0, competitor_purchase_share: 0, other_click_share: 0, other_purchase_share: 0, click_gap: 0, purchase_gap: 0 }, term_rows: [], top_terms: [] },
          baseline_13w: { source: '', method: '', coverage: { terms_total: 0, terms_covered: 0, weeks_present: 0, term_weeks_covered: 0, avg_click_pool_share: 0, avg_purchase_pool_share: 0 }, observed: { total_click_pool_share: 0, total_purchase_pool_share: 0, our_click_share_points: 0, our_purchase_share_points: 0, competitor_click_share_points: 0, competitor_purchase_share_points: 0, other_click_share_points: 0, other_purchase_share_points: 0, our_click_share: 0, our_purchase_share: 0, competitor_click_share: 0, competitor_purchase_share: 0, other_click_share: 0, other_purchase_share: 0, click_gap: 0, purchase_gap: 0 }, term_rows: [], top_terms: [] },
          competitor: { brand: 'Competitor', asin: 'B', config_source: 'cfg' },
          weekly: [],
        },
      },
      {
        id: 'cluster-2',
        cluster: 'Root Two',
        family: 'Other Family',
        core: true,
        terms_count: 1,
        search_volume: 80,
        query_volume: 12,
        market_impressions: 50,
        asin_impressions: 10,
        market_clicks: 25,
        asin_clicks: 5,
        market_cart_adds: 12,
        asin_cart_adds: 3,
        market_purchases: 5,
        asin_purchases: 1,
        market_ctr: 0.5,
        market_cvr: 0.2,
        asin_ctr: 0.5,
        asin_cvr: 0.2,
        impression_share: 0.2,
        click_share: 0.2,
        cart_add_rate: 0.48,
        asin_cart_add_rate: 0.6,
        cart_add_share: 0.25,
        purchase_share: 0.2,
        avg_rank: 4,
        rank_change: 0,
        rank_gap: 0,
        rank_volatility: 3,
        rank_weeks: 1,
        weeks_covered: 2,
        ppc_clicks: 0,
        ppc_spend: 0,
        ppc_sales: 0,
        ppc_acos: 0,
        ppc_cvr: 0,
        expected_rank: 4,
        top_terms: ['gamma'],
        weekly: [buildObserved(6, 1), buildObserved(12, 1)],
        coverage: {
          weeks_sqp: 1,
          weeks_rank: 1,
          weeks_ppc: 0,
          terms_total: 1,
          terms_sqp: 1,
          terms_rank: 1,
          terms_ppc: 0,
          recent_4w: { weeks_sqp: 1, weeks_rank: 1, weeks_ppc: 0, terms_sqp: 1, terms_rank: 1, terms_ppc: 0 },
          baseline_to_anchor: { weeks_sqp: 1, weeks_rank: 1, weeks_ppc: 0 },
        },
        eligibility: {},
        observed: {
          current_week: buildObserved(12, 1),
          recent_4w: buildObserved(12, 1),
          baseline_13w: buildObserved(12, 1),
        },
        benchmark: {
          competitor: {
            identity: { brand: 'Competitor', asin: 'B', config_source: 'cfg' },
            coverage: { weeks_keywords_recent_4w: 0, weeks_keywords_baseline_13w: 0, recent_rank_coverage_strength: 'none', benchmark_available: false },
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
          },
        },
        tstCompare: {
          recent_4w: { source: '', method: '', coverage: { terms_total: 0, terms_covered: 0, weeks_present: 0, term_weeks_covered: 0, avg_click_pool_share: 0, avg_purchase_pool_share: 0 }, observed: { total_click_pool_share: 0, total_purchase_pool_share: 0, our_click_share_points: 0, our_purchase_share_points: 0, competitor_click_share_points: 0, competitor_purchase_share_points: 0, other_click_share_points: 0, other_purchase_share_points: 0, our_click_share: 0, our_purchase_share: 0, competitor_click_share: 0, competitor_purchase_share: 0, other_click_share: 0, other_purchase_share: 0, click_gap: 0, purchase_gap: 0 }, term_rows: [], top_terms: [] },
          baseline_13w: { source: '', method: '', coverage: { terms_total: 0, terms_covered: 0, weeks_present: 0, term_weeks_covered: 0, avg_click_pool_share: 0, avg_purchase_pool_share: 0 }, observed: { total_click_pool_share: 0, total_purchase_pool_share: 0, our_click_share_points: 0, our_purchase_share_points: 0, competitor_click_share_points: 0, competitor_purchase_share_points: 0, other_click_share_points: 0, other_purchase_share_points: 0, our_click_share: 0, our_purchase_share: 0, competitor_click_share: 0, competitor_purchase_share: 0, other_click_share: 0, other_purchase_share: 0, click_gap: 0, purchase_gap: 0 }, term_rows: [], top_terms: [] },
          competitor: { brand: 'Competitor', asin: 'B', config_source: 'cfg' },
          weekly: [],
        },
      },
    ],
    scatterClusterIds: [],
    lineClusterIds: [],
    shareClusterIds: [],
    ppcClusterIds: [],
    defaultClusterIds: ['cluster-1', 'cluster-2'],
    sqpTerms: [
      {
        id: 'cluster-1::term-1',
        term: 'alpha',
        family: 'Family',
        cluster: 'Root One',
        cluster_id: 'cluster-1',
        weekly: [buildObserved(5, 1), buildObserved(10, 2)],
        selection_status: 'selected',
        selection_reason: 'default',
        selection_volume_selected_week: 10,
        selection_volume_baseline_13w: 10,
        coverage: {
          weeks_sqp: 1,
          weeks_rank: 1,
          weeks_ppc: 0,
          has_sqp: true,
          has_rank: true,
          has_ppc: false,
          recent_4w: { weeks_sqp: 1, weeks_rank: 1, weeks_ppc: 0, has_sqp: true, has_rank: true, has_ppc: false },
          baseline_to_anchor: { weeks_sqp: 1, weeks_rank: 1, weeks_ppc: 0, has_sqp: true, has_rank: true, has_ppc: false },
        },
        observed: {
          current_week: buildObserved(10, 2),
          recent_4w: buildObserved(10, 2),
          baseline_13w: buildObserved(10, 2),
        },
        benchmark: {
          competitor: {
            identity: { brand: 'Competitor', asin: 'B', config_source: 'cfg' },
            coverage: { weeks_keywords_recent_4w: 0, weeks_keywords_baseline_13w: 0, recent_rank_coverage_strength: 'none', benchmark_available: false },
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
          },
        },
        search_volume: 10,
        query_volume: 10,
        query_volume_baseline: 10,
        volume_score: 1,
        market_ctr: 0.4,
        market_cvr: 0.25,
        asin_ctr: 0.5,
        asin_cvr: 0.2,
        impression_share: 0.2,
        click_share: 0.25,
        cart_add_share: 0.25,
        asin_cart_add_rate: 0.5,
        purchase_share: 0.2,
        competitor_rank: null,
        competitor_visibility: null,
      },
      {
        id: 'cluster-1::term-2',
        term: 'beta',
        family: 'Family',
        cluster: 'Root One',
        cluster_id: 'cluster-1',
        weekly: [buildObserved(2, 0), buildObserved(4, 0)],
        selection_status: 'selected',
        selection_reason: 'default',
        selection_volume_selected_week: 4,
        selection_volume_baseline_13w: 4,
        coverage: {
          weeks_sqp: 1,
          weeks_rank: 1,
          weeks_ppc: 0,
          has_sqp: true,
          has_rank: true,
          has_ppc: false,
          recent_4w: { weeks_sqp: 1, weeks_rank: 1, weeks_ppc: 0, has_sqp: true, has_rank: true, has_ppc: false },
          baseline_to_anchor: { weeks_sqp: 1, weeks_rank: 1, weeks_ppc: 0, has_sqp: true, has_rank: true, has_ppc: false },
        },
        observed: {
          current_week: buildObserved(4, 0),
          recent_4w: buildObserved(4, 0),
          baseline_13w: buildObserved(4, 0),
        },
        benchmark: {
          competitor: {
            identity: { brand: 'Competitor', asin: 'B', config_source: 'cfg' },
            coverage: { weeks_keywords_recent_4w: 0, weeks_keywords_baseline_13w: 0, recent_rank_coverage_strength: 'none', benchmark_available: false },
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
          },
        },
        search_volume: 4,
        query_volume: 4,
        query_volume_baseline: 4,
        volume_score: 1,
        market_ctr: 0.4,
        market_cvr: 0.25,
        asin_ctr: 0.5,
        asin_cvr: 0,
        impression_share: 0.2,
        click_share: 0.25,
        cart_add_share: 0.25,
        asin_cart_add_rate: 0.5,
        purchase_share: 0,
        competitor_rank: null,
        competitor_visibility: null,
      },
      {
        id: 'cluster-2::term-1',
        term: 'gamma',
        family: 'Other Family',
        cluster: 'Root Two',
        cluster_id: 'cluster-2',
        weekly: [buildObserved(3, 1), buildObserved(12, 1)],
        selection_status: 'selected',
        selection_reason: 'default',
        selection_volume_selected_week: 12,
        selection_volume_baseline_13w: 12,
        coverage: {
          weeks_sqp: 1,
          weeks_rank: 1,
          weeks_ppc: 0,
          has_sqp: true,
          has_rank: true,
          has_ppc: false,
          recent_4w: { weeks_sqp: 1, weeks_rank: 1, weeks_ppc: 0, has_sqp: true, has_rank: true, has_ppc: false },
          baseline_to_anchor: { weeks_sqp: 1, weeks_rank: 1, weeks_ppc: 0, has_sqp: true, has_rank: true, has_ppc: false },
        },
        observed: {
          current_week: buildObserved(12, 1),
          recent_4w: buildObserved(12, 1),
          baseline_13w: buildObserved(12, 1),
        },
        benchmark: {
          competitor: {
            identity: { brand: 'Competitor', asin: 'B', config_source: 'cfg' },
            coverage: { weeks_keywords_recent_4w: 0, weeks_keywords_baseline_13w: 0, recent_rank_coverage_strength: 'none', benchmark_available: false },
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
          },
        },
        search_volume: 12,
        query_volume: 12,
        query_volume_baseline: 12,
        volume_score: 1,
        market_ctr: 0.4,
        market_cvr: 0.25,
        asin_ctr: 0.5,
        asin_cvr: 0.2,
        impression_share: 0.2,
        click_share: 0.25,
        cart_add_share: 0.25,
        asin_cart_add_rate: 0.5,
        purchase_share: 0.2,
        competitor_rank: null,
        competitor_visibility: null,
      },
    ],
    sqpClusterTerms: {
      'cluster-1': ['cluster-1::term-1', 'cluster-1::term-2'],
      'cluster-2': ['cluster-2::term-1'],
    },
    sqpGlobalTermIds: ['cluster-1::term-1', 'cluster-1::term-2', 'cluster-2::term-1'],
    regression: { slope: 0, intercept: 0 },
    brandMetricsWindow: {},
    brandMetrics: {},
    competitorWeekly: [],
    scp: {
      meta: { targetAsin: 'A', recentWindow: ['W15', 'W16'], baselineWindow: ['W15', 'W16'] },
      current_week: { asin_count: 0, impressions: 0, clicks: 0, cart_adds: 0, purchases: 0, sales: 0, ctr: 0, atc_rate: 0, purchase_rate: 0, cvr: 0 },
      recent_4w: { asin_count: 0, impressions: 0, clicks: 0, cart_adds: 0, purchases: 0, sales: 0, ctr: 0, atc_rate: 0, purchase_rate: 0, cvr: 0 },
      baseline_to_anchor: { asin_count: 0, impressions: 0, clicks: 0, cart_adds: 0, purchases: 0, sales: 0, ctr: 0, atc_rate: 0, purchase_rate: 0, cvr: 0 },
      weekly: [],
      asins: [],
    },
    businessReports: {
      meta: { targetAsin: 'A', selectedWeek: 'W16', availableWeeks: ['W15', 'W16'] },
      current_week: { asin_count: 0, sessions: 0, page_views: 0, order_items: 0, units_ordered: 0, sales: 0, order_item_session_percentage: 0, unit_session_percentage: 0, buy_box_percentage: 0 },
      baseline_to_anchor: { asin_count: 0, sessions: 0, page_views: 0, order_items: 0, units_ordered: 0, sales: 0, order_item_session_percentage: 0, unit_session_percentage: 0, buy_box_percentage: 0 },
      weekly: [],
      dailyByWeek: {},
      asins: [],
    },
  }
}

test('createSqpSelectionViewModel aggregates selected term rows by root and current week', () => {
  const vm = createSqpSelectionViewModel({
    bundle: buildBundle(),
    selectedRootIds: new Set(['cluster-1']),
    selectedTermIds: new Set(['cluster-1::term-1']),
  })

  assert.equal(vm.scopeType, 'term')
  assert.equal(vm.rootRows[0]?.id, 'cluster-1')
  assert.equal(vm.rootRows[0]?.partial, true)
  assert.equal(vm.rootRows[0]?.coverageLabel, '2 / 2')
  assert.equal(vm.termRowsByRoot['cluster-1']?.[0]?.id, 'cluster-1::term-1')
  assert.equal(vm.termRowsByRoot['cluster-1']?.[0]?.selectionVolumeSelectedWeek, 10)
  assert.equal(vm.metrics?.asin_purchases, 2)
  assert.equal(vm.weekly[1]?.week_label, 'W16')
})

test('createSqpSelectionViewModel preserves root weekly context when a single root has no terms selected', () => {
  const vm = createSqpSelectionViewModel({
    bundle: buildBundle(),
    selectedRootIds: new Set(['cluster-1']),
    selectedTermIds: new Set(),
  })

  assert.equal(vm.scopeType, 'no-terms')
  assert.equal(vm.metrics?.query_volume, 20)
  assert.equal(vm.isAllSelected, false)
  assert.equal(vm.selectedRootLabels[0], 'Root One')
})

test('createSqpSelectionViewModel aggregates multiple selected roots by selected terms', () => {
  const vm = createSqpSelectionViewModel({
    bundle: buildBundle(),
    selectedRootIds: new Set(['cluster-1', 'cluster-2']),
    selectedTermIds: new Set(['cluster-1::term-1', 'cluster-2::term-1']),
  })

  assert.equal(vm.scopeType, 'multi-root')
  assert.equal(vm.selectedRootIds.length, 2)
  assert.equal(vm.selectedTermIds.length, 2)
  assert.equal(vm.metrics?.asin_purchases, 3)
})

test('sortSqpRootRows and sortSqpTermRows follow the HTML table sort order', () => {
  const vm = createSqpSelectionViewModel({
    bundle: buildBundle(),
    selectedRootIds: new Set(['cluster-1', 'cluster-2']),
    selectedTermIds: new Set(['cluster-1::term-1', 'cluster-2::term-1']),
  })

  const rootsByVolume = sortSqpRootRows(vm.rootRows, 'query_volume', 'desc')
  const termsByName = sortSqpTermRows(vm.termRowsByRoot['cluster-1'], 'term', 'asc')

  assert.deepEqual(
    rootsByVolume.map((row) => row.id),
    ['cluster-1', 'cluster-2'],
  )
  assert.deepEqual(
    termsByName.map((row) => row.id),
    ['cluster-1::term-1', 'cluster-1::term-2'],
  )
})
