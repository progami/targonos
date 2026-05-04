export type WeekLabel = string;

export interface WprMeta {
  anchorWeek: WeekLabel;
  competitorBrand: string;
  competitorAsin: string;
  benchmarkPolicy: string;
  competitor: WprCompetitorSummary;
  recentWindow: WeekLabel[];
  baselineWindow: WeekLabel[];
  policy: {
    primary_window: string;
    baseline_window: string;
    term_truth_set: string;
    dashboard_policy: string;
    benchmark_policy: string;
  };
}

export interface WprWeeklyMetrics {
  week_label: WeekLabel;
  week_number: number;
  start_date: string;
  market_impressions: number;
  asin_impressions: number;
  market_clicks: number;
  asin_clicks: number;
  market_cart_adds: number;
  asin_cart_adds: number;
  market_purchases: number;
  asin_purchases: number;
  query_volume: number;
  ppc_impressions: number;
  ppc_clicks: number;
  ppc_spend: number;
  ppc_sales: number;
  ppc_orders: number;
  rank_weight: number;
  rank_sum: number;
  rank_span_sum: number;
  rank_term_count: number;
  rank_weeks: number;
  weeks_in_window: number;
  avg_rank: number | null;
  rank_volatility: number | null;
  market_ctr: number;
  market_cvr: number;
  asin_ctr: number;
  asin_cvr: number;
  impression_share: number;
  click_share: number;
  cart_add_rate: number;
  asin_cart_add_rate: number;
  cart_add_share: number;
  purchase_share: number;
  ppc_acos: number;
  ppc_cvr: number;
}

export interface WprCoverageSummary {
  weeks_sqp: number;
  weeks_rank: number;
  weeks_ppc: number;
  has_sqp?: boolean;
  has_rank?: boolean;
  has_ppc?: boolean;
  terms_total?: number;
  terms_sqp?: number;
  terms_rank?: number;
  terms_ppc?: number;
  excluded_non_sqp_terms?: number;
  excluded_ppc_only_terms?: number;
  excluded_rank_only_terms?: number;
}

export interface WprCoverage extends WprCoverageSummary {
  recent_4w: WprCoverageSummary;
  baseline_to_anchor: WprCoverageSummary;
}

export type WprObservedWindow = WprWeeklyMetrics;

export interface WprBenchmarkIdentity {
  brand: string;
  asin: string;
  config_source: string;
}

export interface WprCompetitorSummary {
  brand: string;
  asin: string;
  config_source: string;
}

export interface WprBenchmarkCoverage {
  weeks_keywords_recent_4w: number;
  weeks_keywords_baseline_13w: number;
  recent_rank_coverage_strength: string;
  benchmark_available: boolean;
}

export interface WprBenchmarkWindowInput {
  weeks_present: WeekLabel[];
  weeks_keywords: number;
  avg_rank: number | null;
  best_rank: number | null;
  visibility_est: number | null;
}

export interface WprBenchmarkWindowOutput {
  visibility_est: number | null;
}

export interface WprBenchmarkCompetitor {
  identity: WprBenchmarkIdentity;
  coverage: WprBenchmarkCoverage;
  raw_input: {
    recent_4w: WprBenchmarkWindowInput;
    baseline_13w: WprBenchmarkWindowInput;
  };
  estimated_output: {
    recent_4w: WprBenchmarkWindowOutput;
    baseline_13w: WprBenchmarkWindowOutput;
  };
  gap_to_target: {
    rank_recent_4w: number | null;
    rank_best_recent_4w: number | null;
    rank_baseline_13w: number | null;
  };
  benchmark_available: boolean;
}

export interface WprTstObserved {
  total_click_pool_share: number;
  total_purchase_pool_share: number;
  our_click_share_points: number;
  our_purchase_share_points: number;
  competitor_click_share_points: number;
  competitor_purchase_share_points: number;
  other_click_share_points: number;
  other_purchase_share_points: number;
  our_click_share: number;
  our_purchase_share: number;
  competitor_click_share: number;
  competitor_purchase_share: number;
  other_click_share: number;
  other_purchase_share: number;
  click_gap: number;
  purchase_gap: number;
}

export interface WprTstCoverage {
  terms_total: number;
  terms_covered: number;
  weeks_present: number;
  term_weeks_covered: number;
  avg_click_pool_share: number;
  avg_purchase_pool_share: number;
}

export interface WprTstTermRow {
  term: string;
  weeks_present: number;
  search_frequency_rank: number;
  click_pool_share: number;
  purchase_pool_share: number;
  avg_click_pool_share: number;
  avg_purchase_pool_share: number;
  our_click_share: number;
  our_purchase_share: number;
  competitor_click_share: number;
  competitor_purchase_share: number;
  other_click_share: number;
  other_purchase_share: number;
  click_gap: number;
  purchase_gap: number;
}

export interface WprTstWindow {
  source: string;
  method: string;
  coverage: WprTstCoverage;
  observed: WprTstObserved;
  term_rows: WprTstTermRow[];
  top_terms: WprTstTermRow[];
}

export interface WprTstWeeklyWindow extends WprTstWindow {
  week_label: WeekLabel;
  week_number: number;
  start_date: string;
}

export interface WprCluster {
  id: string;
  cluster: string;
  family: string;
  core: boolean;
  terms_count: number;
  search_volume: number;
  query_volume: number;
  market_impressions: number;
  asin_impressions: number;
  market_clicks: number;
  asin_clicks: number;
  market_cart_adds: number;
  asin_cart_adds: number;
  market_purchases: number;
  asin_purchases: number;
  market_ctr: number;
  market_cvr: number;
  asin_ctr: number;
  asin_cvr: number;
  impression_share: number;
  click_share: number;
  cart_add_rate: number;
  asin_cart_add_rate: number;
  cart_add_share: number;
  purchase_share: number;
  avg_rank: number | null;
  rank_change: number | null;
  rank_gap: number | null;
  rank_volatility: number | null;
  rank_weeks: number;
  weeks_covered: number;
  ppc_clicks: number;
  ppc_spend: number;
  ppc_sales: number;
  ppc_acos: number;
  ppc_cvr: number;
  expected_rank: number | null;
  top_terms: string[];
  weekly: WprWeeklyMetrics[];
  coverage: WprCoverage;
  eligibility: Record<string, boolean | number | string | null>;
  observed: {
    current_week: WprObservedWindow;
    recent_4w: WprObservedWindow;
    baseline_13w: WprObservedWindow;
  };
  benchmark: {
    competitor: WprBenchmarkCompetitor;
  };
  tstCompare: {
    recent_4w: WprTstWindow;
    baseline_13w: WprTstWindow;
    competitor: WprCompetitorSummary;
    weekly: WprTstWeeklyWindow[];
  };
}

export interface WprSourceMatrixCell {
  present: boolean;
}

export interface WprSourceMatrixRow {
  group: string;
  name: string;
  weeks: Record<WeekLabel, WprSourceMatrixCell>;
}

export interface WprSourceOverview {
  week_labels: WeekLabel[];
  latest_week: WeekLabel;
  weeks_with_data: number;
  source_completeness: string;
  critical_gaps: string[];
  matrix: WprSourceMatrixRow[];
}

export interface WprChangeLogEntry {
  id: string;
  kind: string;
  source: string;
  week_label: WeekLabel;
  week_number: number;
  timestamp: string;
  date_label: string;
  title: string;
  summary: string;
  category: string;
  asins: string[];
  field_labels?: string[];
  highlights?: string[];
}

export interface WprSqpTerm {
  id: string;
  term: string;
  family: string;
  cluster: string;
  cluster_id: string;
  weekly: WprWeeklyMetrics[];
  selection_status: string;
  selection_reason: string;
  selection_volume_selected_week: number;
  selection_volume_baseline_13w: number;
  coverage: WprCoverage;
  observed: {
    current_week: WprObservedWindow;
    recent_4w: WprObservedWindow;
    baseline_13w: WprObservedWindow;
  };
  benchmark: {
    competitor: WprBenchmarkCompetitor;
  };
  search_volume: number;
  query_volume: number;
  query_volume_baseline: number;
  volume_score: number;
  market_ctr: number;
  market_cvr: number;
  asin_ctr: number;
  asin_cvr: number;
  impression_share: number;
  click_share: number;
  cart_add_share: number;
  asin_cart_add_rate: number;
  purchase_share: number;
  competitor_rank: number | null;
  competitor_visibility: number | null;
}

export interface WprCompetitorWeeklyPoint {
  week_label: WeekLabel;
  present: boolean;
  price: number | null;
  sales: number | null;
  kw_ranked_p1_pct: number | null;
  sv_ranked_p1_pct: number | null;
  listing_juice: number | null;
}

export interface WprBrandMetricsPoint {
  awareness: number;
  consideration: number;
  purchase: number;
}

export interface WprScpMetrics {
  asin_count: number;
  impressions: number;
  clicks: number;
  cart_adds: number;
  purchases: number;
  sales: number;
  ctr: number;
  atc_rate: number;
  purchase_rate: number;
  cvr: number;
}

export interface WprScpWeekMetrics extends WprScpMetrics {
  week_label: WeekLabel;
  week_number: number;
  start_date: string;
}

export interface WprScpMeta {
  targetAsin: string;
  recentWindow: WeekLabel[];
  baselineWindow: WeekLabel[];
}

export interface WprScpAsinRow extends WprScpMetrics {
  id: string;
  asin: string;
  is_target: boolean;
  impression_share: number;
  click_share: number;
  cart_add_share: number;
  purchase_share: number;
  sales_share: number;
  weeks_present_selected_week: number;
  weeks_present_baseline: number;
  current_week: WprScpMetrics;
  recent_4w: WprScpMetrics;
  baseline_to_anchor: WprScpMetrics;
  weekly: WprScpWeekMetrics[];
}

export interface WprScpWindow {
  meta: WprScpMeta;
  current_week: WprScpMetrics;
  recent_4w: WprScpMetrics;
  baseline_to_anchor: WprScpMetrics;
  weekly: WprScpWeekMetrics[];
  asins: WprScpAsinRow[];
}

export interface WprBusinessMetrics {
  asin_count: number;
  sessions: number;
  page_views: number;
  order_items: number;
  units_ordered: number;
  sales: number;
  order_item_session_percentage: number;
  unit_session_percentage: number;
  buy_box_percentage: number;
}

export interface WprBusinessWeekMetrics extends WprBusinessMetrics {
  week_label: WeekLabel;
  week_number: number;
  start_date: string;
}

export interface WprBusinessDailyPoint extends WprBusinessMetrics {
  date: string;
  date_label: string;
  day_label: string;
  weekday_label: string;
  change_count: number;
  change_titles: string[];
}

export interface WprBusinessMeta {
  targetAsin: string;
  selectedWeek: WeekLabel;
  availableWeeks: WeekLabel[];
}

export interface WprBusinessAsinRow extends WprBusinessMetrics {
  id: string;
  asin: string;
  is_target: boolean;
  weeks_present_selected_week: number;
  weeks_present_baseline: number;
  current_week: WprBusinessMetrics;
  baseline_to_anchor: WprBusinessMetrics;
  weekly: WprBusinessWeekMetrics[];
}

export interface WprBusinessReportsWindow {
  meta: WprBusinessMeta;
  current_week: WprBusinessMetrics;
  baseline_to_anchor: WprBusinessMetrics;
  weekly: WprBusinessWeekMetrics[];
  dailyByWeek: Record<WeekLabel, WprBusinessDailyPoint[]>;
  asins: WprBusinessAsinRow[];
}

export interface WprWeekBundleBase {
  meta: WprMeta;
  weeks: WeekLabel[];
  clusters: WprCluster[];
  scatterClusterIds: string[];
  lineClusterIds: string[];
  shareClusterIds: string[];
  ppcClusterIds: string[];
  defaultClusterIds: string[];
  sqpTerms: WprSqpTerm[];
  sqpClusterTerms: Record<string, string[]>;
  sqpGlobalTermIds: string[];
  regression: {
    slope: number;
    intercept: number;
  };
  brandMetrics: Record<WeekLabel, WprBrandMetricsPoint>;
  competitorWeekly: WprCompetitorWeeklyPoint[];
  scp: WprScpWindow;
  businessReports: WprBusinessReportsWindow;
}

export interface WprWeekBundle extends WprWeekBundleBase {
  brandMetricsWindow: Record<WeekLabel, WprBrandMetricsPoint>;
}

export interface WprPayload extends WprWeekBundleBase {
  defaultWeek: WeekLabel;
  weekStartDates: Record<WeekLabel, string>;
  sourceOverview: WprSourceOverview;
  windowsByWeek: Record<WeekLabel, WprWeekBundle>;
  changeLogByWeek: Record<WeekLabel, WprChangeLogEntry[]>;
  audit: Record<string, unknown>;
}

export interface WprWeekSummaryResponse {
  defaultWeek: WeekLabel;
  weeks: WeekLabel[];
  weekStartDates: Record<WeekLabel, string>;
}
