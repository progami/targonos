#!/bin/bash
# Weekly Category Insights snapshot via Seller Central APIs in Chrome.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"
load_monitoring_env

DEST="${ARGUS_CATEGORY_INSIGHTS_DEST:-$(argus_monitoring_root)/Weekly/Category Insights (Browser)}"
LOG="${ARGUS_CATEGORY_INSIGHTS_LOG:-/tmp/weekly-category-insights.log}"
TARGET_URL="https://sellercentral.amazon.com/selection/category-insights"
TARGET_MARKETPLACE_ID="ATVPDKIKX0DER"
TARGET_MARKETPLACE_LABEL="United States"
TARGET_SEARCH_TERM="Painting Drop Cloths"
TARGET_CATEGORY_ID="Tools & Home Improvement"
TARGET_PRODUCT_TYPE_ID="BUILDING_MATERIAL"
TARGET_PRODUCT_TYPE_LABEL="Building Material"
TARGET_BROWSE_NODE_ID="13399811"

IFS='|' read -r WEEK_NUM START_DATE END_DATE PREFIX <<<"$(latest_complete_week_context)"
TODAY=$(date '+%Y-%m-%d')
CAPTURED_AT_UTC=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

mkdir -p "$DEST"

TAB_ID=""

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
open_window() { TAB_ID="$(run_chrome_helper open-window-tab "$1")"; }
run_js() { run_chrome_helper run-js-tab-id "$TAB_ID" "$1"; }
wait_tab() { run_chrome_helper wait-tab-id "$TAB_ID" >/dev/null; }
tab_url() { run_chrome_helper get-url-tab-id "$TAB_ID"; }

json_stringify() {
  "$NODE_BIN" -e '
const input = process.argv[1];
process.stdout.write(JSON.stringify(input));
' "$1"
}

build_search_payload() {
  "$NODE_BIN" -e '
process.stdout.write(JSON.stringify({
  program: "sg_np_ar",
  searchTerm: process.argv[1],
  producerId: "NEXT_SG_NP_AR_MODEL",
  marketplaceId: process.argv[2],
}));
' "$TARGET_SEARCH_TERM" "$TARGET_MARKETPLACE_ID"
}

build_performance_payload() {
  "$NODE_BIN" -e '
process.stdout.write(JSON.stringify({
  program: "sg_np_ar",
  targetMarketplaceId: process.argv[1],
  producerId: "NEXT_SG_NP_AR_MODEL",
  filter: {
    logicalOperator: "AND",
    filters: [
      { key: "type", value: "MP_CAT_PTD_BN", conditionalOperator: "EQUALS" },
      { key: "catId", value: process.argv[2], conditionalOperator: "EQUALS" },
      { key: "ptdId", value: process.argv[3], conditionalOperator: "EQUALS" },
      { key: "bnId", value: process.argv[4], conditionalOperator: "EQUALS" },
    ],
  },
}));
' "$TARGET_MARKETPLACE_ID" "$1" "$2" "$3"
}

build_features_payload() {
  "$NODE_BIN" -e '
process.stdout.write(JSON.stringify({
  program: "sg_np_ar",
  targetMarketplaceId: process.argv[1],
  producerId: "NEXT_SG_NP_AR_MODEL",
  pageSize: 1000,
  filter: {
    logicalOperator: "AND",
    filters: [
      { key: "type", value: "MP_CAT_PTD_BN_FEA", conditionalOperator: "EQUALS" },
      { key: "catId", value: process.argv[2], conditionalOperator: "EQUALS" },
      { key: "ptdId", value: process.argv[3], conditionalOperator: "EQUALS" },
      { key: "bnId", value: process.argv[4], conditionalOperator: "EQUALS" },
    ],
  },
}));
' "$TARGET_MARKETPLACE_ID" "$1" "$2" "$3"
}

post_json_from_page() {
  local path="$1"
  local payload="$2"
  local path_literal
  local payload_literal
  local js

  path_literal=$(json_stringify "$path")
  payload_literal=$(json_stringify "$payload")
  js="(() => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', ${path_literal}, false);
    xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    xhr.send(${payload_literal});
    if (xhr.status !== 200) {
      const responseText = xhr.responseText ?? '';
      throw new Error('HTTP ' + xhr.status + ' from ' + ${path_literal} + ': ' + responseText.slice(0, 500));
    }
    return xhr.responseText;
  })();"

  run_js "$js"
}

resolve_search_result() {
  "$NODE_BIN" -e '
const results = JSON.parse(process.argv[1]);
const expectedCategory = process.argv[2];
const expectedProductType = process.argv[3];
const expectedBrowseNode = process.argv[4];

if (!Array.isArray(results)) {
  throw new Error("Category Insights search returned non-array results");
}

if (results.length === 0) {
  throw new Error("Category Insights search returned no results");
}

const match = results.find((result) =>
  result.categoryId === expectedCategory &&
  result.productTypeId === expectedProductType &&
  result.browseNodeId === expectedBrowseNode
);

if (!match) {
  throw new Error(`Category Insights search did not return ${expectedCategory} / ${expectedProductType} / ${expectedBrowseNode}`);
}

process.stdout.write(JSON.stringify(match));
' "$1" "$TARGET_CATEGORY_ID" "$TARGET_PRODUCT_TYPE_ID" "$TARGET_BROWSE_NODE_ID"
}

build_csv() {
  "$NODE_BIN" - "$CAPTURED_AT_UTC" "$TODAY" "$TARGET_URL" "$TARGET_SEARCH_TERM" "$TARGET_MARKETPLACE_LABEL" "$TARGET_MARKETPLACE_ID" "$1" "$2" "$3" <<'NODE'
const [
  ,
  ,
  capturedAtUtc,
  capturedDate,
  sourceUrl,
  searchTerm,
  marketplaceLabel,
  marketplaceId,
  resolvedRaw,
  performanceRaw,
  featuresRaw,
] = process.argv;

const resolved = JSON.parse(resolvedRaw);
const performance = JSON.parse(performanceRaw);
const features = JSON.parse(featuresRaw);

const demand = performance.demand ?? {};
const competition = performance.competition ?? {};
const featuresList = features.featuresList ?? [];
const featuresName = features.featuresName ?? [];
const weekCode = process.env.WEEK_CODE;
const weekStart = process.env.WEEK_START;
const weekEnd = process.env.WEEK_END;
const periods = [
  ["l7d", "7d"],
  ["l30d", "30d"],
  ["l90d", "90d"],
  ["l12m", "12m"],
];

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function metricValue(metric, periodKey) {
  const value = metric?.[periodKey];
  return value ?? null;
}

const browseNodeLabel = clean(resolved.browseNodeLabel);
const categoryLabel = clean(resolved.categoryLabel);
const productTypeLabel = clean(resolved.productTypeLabel);
const searchPath = clean(resolved.searchResponseString);

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const headers = [
  "week_code",
  "week_start",
  "week_end",
  "captured_date",
  "captured_at_utc",
  "source",
  "marketplace",
  "marketplace_id",
  "search_term",
  "category",
  "product_type",
  "product_type_id",
  "browse_node",
  "browse_node_id",
  "resolved_path",
  "section",
  "metric",
  "period",
  "position",
  "label",
  "value",
  "average_value",
  "range",
  "display_value",
];

const baseRow = {
  week_code: clean(weekCode),
  week_start: clean(weekStart),
  week_end: clean(weekEnd),
  captured_date: clean(capturedDate),
  captured_at_utc: clean(capturedAtUtc),
  source: clean(sourceUrl),
  marketplace: clean(marketplaceLabel),
  marketplace_id: clean(marketplaceId),
  search_term: clean(searchTerm),
  category: categoryLabel,
  product_type: productTypeLabel,
  product_type_id: clean(resolved.productTypeId),
  browse_node: browseNodeLabel,
  browse_node_id: clean(resolved.browseNodeId),
  resolved_path: searchPath,
};

const rows = [];

function pushRow(section, metric, period, position, label, value, averageValue, range, displayValue) {
  rows.push({
    ...baseRow,
    section,
    metric,
    period,
    position,
    label: clean(label),
    value: value ?? "",
    average_value: averageValue ?? "",
    range: clean(range),
    display_value: clean(displayValue),
  });
}

function pushRatioRows(metricName, metric) {
  for (const [periodKey, periodLabel] of periods) {
    const value = metricValue(metric, periodKey);
    if (!value) continue;
    pushRow("summary", metricName, periodLabel, "", "", value.value, value.averageValue, value.range, value.stringValue);
  }
}

function pushSeriesRows(metricName, metric) {
  const series = metricValue(metric, "mly")?.graphDataPointsList ?? [];
  for (let index = 0; index < series.length; index += 1) {
    const point = series[index];
    pushRow("chart", metricName, "12m_monthly", index + 1, point.label, point.value, "", "", point.stringValue);
  }
}

function pushLabeledRows(section, metricName, rowsList, periodLabel, valueFormatter) {
  for (let index = 0; index < rowsList.length; index += 1) {
    const row = rowsList[index];
    const rawValue = row?.value ?? "";
    const displayValue = valueFormatter ? valueFormatter(rawValue) : "";
    pushRow(section, metricName, periodLabel, index + 1, row?.label ?? "", rawValue, "", row?.range ?? "", displayValue);
  }
}

function formatPercent(rawValue) {
  if (rawValue == null) return "";
  if (rawValue === "") return "";
  return `${Math.round(Number(rawValue) * 100)}%`;
}

pushRatioRows("search_to_purchase_ratio", demand.searchToPurchaseRatio);
pushRatioRows("return_ratio", demand.returnRatio);

pushRow("summary", "seller_count", "12m", "", "", "", "", metricValue(competition.sellerCount, "l12m")?.range, "");
pushRow("summary", "new_brand_count", "12m", "", "", metricValue(competition.newBrandCount, "l12m")?.value, "", "", metricValue(competition.newBrandCount, "l12m")?.stringValue);
pushRow("summary", "asin_count", "12m", "", "", metricValue(competition.asinCount, "l12m")?.value, "", "", metricValue(competition.asinCount, "l12m")?.stringValue);
pushRow("summary", "new_asin_count", "12m", "", "", metricValue(competition.newAsinCount, "l12m")?.value, "", "", metricValue(competition.newAsinCount, "l12m")?.stringValue);
pushRow("summary", "offers_per_asin", "12m", "", "", metricValue(competition.offersPerAsin, "l12m")?.value, "", "", metricValue(competition.offersPerAsin, "l12m")?.stringValue);
pushRow("summary", "avg_ad_spend_per_click", "12m", "", "", metricValue(competition.avgAdSpendPerClick, "l12m")?.value, "", "", metricValue(competition.avgAdSpendPerClick, "l12m")?.stringValue);
pushRow("summary", "majority_ad_spend_per_click", "12m", "", "", metricValue(competition.majorityAdSpendPerClick, "l12m")?.value, "", "", metricValue(competition.majorityAdSpendPerClick, "l12m")?.stringValue);

pushLabeledRows("keywords", "most_popular_keywords", metricValue(demand.mostPopularKeywords, "l12m")?.graphDataPointsList ?? [], "12m", "");
pushLabeledRows("returns", "return_reasons", metricValue(demand.returnReasons, "l12m")?.graphDataPointsList ?? [], "12m", formatPercent);
pushLabeledRows("ratings", "star_ratings", metricValue(competition.starRatings, "l12m")?.graphDataPointsList ?? [], "12m", "");

pushSeriesRows("units_sold", demand.unitSold);
pushSeriesRows("net_sales", demand.netShippedGMS);
pushSeriesRows("search_volume", demand.searchVolume);
pushSeriesRows("click_count", demand.clickCount);
pushSeriesRows("glance_views", demand.glanceViews);

for (let featureIndex = 0; featureIndex < featuresName.length; featureIndex += 1) {
  const featureName = clean(featuresName[featureIndex]);
  const entries = featuresList[featureIndex] ?? [];
  const maxScore = entries.reduce((best, entry) => Math.max(best, Number(entry.score ?? 0)), 0);
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    const entry = entries[entryIndex];
    const score = Number(entry.score ?? 0);
    const relative = maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0;
    pushRow("features", featureName, "12m", entryIndex + 1, entry.label, relative, "", "", `${relative}%`);
  }
}

const output = [headers.join(",")];
for (const row of rows) {
  output.push(headers.map((header) => csvEscape(row[header] ?? "")).join(","));
}

process.stdout.write(`${output.join("\n")}\n`);
NODE
}

log "Starting weekly Category Insights: $PREFIX"

open_window "$TARGET_URL"
wait_tab

current_url=$(tab_url)
if is_amazon_login_url "$current_url"; then
  log "Seller Central session expired — attempting relogin"
  bash "$SCRIPT_DIR/../relogin.sh" "$TARGET_URL"
  open_window "$TARGET_URL"
  wait_tab
fi

SEARCH_PAYLOAD="$(build_search_payload)"
SEARCH_RESPONSE="$(post_json_from_page "/next/v2/searchSGAR" "$SEARCH_PAYLOAD")"
RESOLVED_RESULT="$(resolve_search_result "$SEARCH_RESPONSE")"

PERFORMANCE_PAYLOAD="$(build_performance_payload "$TARGET_CATEGORY_ID" "$TARGET_PRODUCT_TYPE_ID" "$TARGET_BROWSE_NODE_ID")"
FEATURES_PAYLOAD="$(build_features_payload "$TARGET_CATEGORY_ID" "$TARGET_PRODUCT_TYPE_ID" "$TARGET_BROWSE_NODE_ID")"

PERFORMANCE_RESPONSE="$(post_json_from_page "/next/v2/getPerformanceDashboard" "$PERFORMANCE_PAYLOAD")"
FEATURES_RESPONSE="$(post_json_from_page "/next/v2/getFeaturesDashboard" "$FEATURES_PAYLOAD")"

OUTFILE="$DEST/${PREFIX}_CategoryInsights.csv"
CSV_OUTPUT="$(WEEK_CODE="$WEEK_NUM" WEEK_START="$START_DATE" WEEK_END="$END_DATE" build_csv "$RESOLVED_RESULT" "$PERFORMANCE_RESPONSE" "$FEATURES_RESPONSE")"

if [ -z "${CSV_OUTPUT// }" ]; then
  log "FAILED: Category Insights CSV is empty"
  exit 1
fi

printf '%s' "$CSV_OUTPUT" | write_stdin_to_file_with_node "$OUTFILE"

log "Saved: ${PREFIX}_CategoryInsights.csv"
log "Resolved path: $TARGET_CATEGORY_ID > $TARGET_PRODUCT_TYPE_LABEL > $TARGET_SEARCH_TERM"
log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
