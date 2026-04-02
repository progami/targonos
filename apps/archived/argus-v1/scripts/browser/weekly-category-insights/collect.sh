#!/bin/bash
# Weekly Category Insights snapshot via Seller Central APIs in Chrome.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

DEST="${ARGUS_CATEGORY_INSIGHTS_DEST:-/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Weekly/Category Insights (Browser)}"
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
open_window() { TAB_ID="$(osascript "$CHROME_HELPER" open-window-tab "$1")"; }
run_js() { osascript "$CHROME_HELPER" run-js-tab-id "$TAB_ID" "$1"; }
wait_tab() { osascript "$CHROME_HELPER" wait-tab-id "$TAB_ID" >/dev/null; }
tab_url() { osascript "$CHROME_HELPER" get-url-tab-id "$TAB_ID"; }

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
      throw new Error('HTTP ' + xhr.status + ' from ' + ${path_literal} + ': ' + (xhr.responseText || '').slice(0, 500));
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

if (!Array.isArray(results) || results.length === 0) {
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

build_report() {
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

const demand = performance.demand || {};
const competition = performance.competition || {};
const featuresList = features.featuresList || [];
const featuresName = features.featuresName || [];
const periods = [
  ["l7d", "7d"],
  ["l30d", "30d"],
  ["l90d", "90d"],
  ["l12m", "12m"],
];

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatInteger(value) {
  if (value == null) return "n/a";
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatDecimal(value, digits = 4) {
  if (value == null) return "n/a";
  return Number(value).toFixed(digits);
}

function formatMoneyString(value) {
  return clean(value) || "n/a";
}

function metricValue(metric, periodKey) {
  return metric?.[periodKey] || null;
}

function ratioLines(label, metric) {
  const lines = [label];
  for (const [periodKey, periodLabel] of periods) {
    const value = metricValue(metric, periodKey);
    if (!value) continue;
    const pieces = [`  ${periodLabel}: ${formatDecimal(value.value)}`];
    if (value.averageValue != null) {
      pieces.push(`avg ${formatDecimal(value.averageValue)}`);
    }
    lines.push(pieces.join(" | "));
  }
  return lines;
}

function competitionLines() {
  return [
    `Sellers (12m): ${metricValue(competition.sellerCount, "l12m")?.range || "n/a"}`,
    `New brands (12m): ${formatInteger(metricValue(competition.newBrandCount, "l12m")?.value)}`,
    `ASINs (12m): ${formatInteger(metricValue(competition.asinCount, "l12m")?.value)}`,
    `New ASINs (12m): ${formatInteger(metricValue(competition.newAsinCount, "l12m")?.value)}`,
    `Offers per ASIN (12m): ${formatInteger(metricValue(competition.offersPerAsin, "l12m")?.value)}`,
    `Average daily ad spend (12m): ${formatMoneyString(metricValue(competition.avgAdSpendPerClick, "l12m")?.stringValue)}`,
    `Majority ad spend up to (12m): ${formatMoneyString(metricValue(competition.majorityAdSpendPerClick, "l12m")?.stringValue)}`,
  ];
}

function renderSeries(title, metric, periodKey) {
  const series = metricValue(metric, periodKey)?.graphDataPointsList || [];
  const lines = [title];
  for (const point of series) {
    lines.push(`  ${point.label}: ${formatInteger(point.value)}`);
  }
  return lines;
}

function renderKeywords() {
  const rows = metricValue(demand.mostPopularKeywords, "l12m")?.graphDataPointsList || [];
  const lines = ["Most Popular Keywords (12m)"];
  for (const row of rows) {
    lines.push(`  ${formatInteger(row.value)}\t${clean(row.label)}`);
  }
  return lines;
}

function renderReturnReasons() {
  const rows = metricValue(demand.returnReasons, "l12m")?.graphDataPointsList || [];
  const lines = ["Return Reasons (12m)"];
  for (const row of rows) {
    const percent = `${Math.round(Number(row.value || 0) * 100)}%`;
    lines.push(`  ${percent}\t${clean(row.label)}`);
  }
  return lines;
}

function renderStarRatings() {
  const rows = metricValue(competition.starRatings, "l12m")?.graphDataPointsList || [];
  const lines = ["Star Ratings (12m)"];
  for (const row of rows) {
    lines.push(`  ${clean(row.label)}\t${formatInteger(row.value)}`);
  }
  return lines;
}

function renderFeatures() {
  const lines = ["Feature Breakdown (12m)"];
  for (let index = 0; index < featuresName.length; index += 1) {
    const name = clean(featuresName[index]);
    const entries = featuresList[index] || [];
    const maxScore = entries.reduce((best, entry) => Math.max(best, Number(entry.score || 0)), 0);
    lines.push(name);
    for (const entry of entries) {
      const score = Number(entry.score || 0);
      const relative = maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0;
      lines.push(`  ${clean(entry.label)}\t${relative}%`);
    }
  }
  return lines;
}

const browseNodeLabel = clean(resolved.browseNodeLabel);
const categoryLabel = clean(resolved.categoryLabel);
const productTypeLabel = clean(resolved.productTypeLabel);
const searchPath = clean(resolved.searchResponseString);

const lines = [
  `Category Insights — ${browseNodeLabel}`,
  `Captured: ${capturedDate}`,
  `Captured At (UTC): ${capturedAtUtc}`,
  `Source: ${sourceUrl}`,
  `Capture Mode: Seller Central API snapshot via Chrome-authenticated session`,
  `Search Term: ${searchTerm}`,
  `Marketplace: ${marketplaceLabel} (${marketplaceId})`,
  `Category: ${categoryLabel}`,
  `Product Type: ${productTypeLabel} (${resolved.productTypeId})`,
  `Browse Node: ${browseNodeLabel} (${resolved.browseNodeId})`,
  `Resolved Path: ${searchPath}`,
  `Time Period: 12 months default view with 7d/30d/90d/12m summary`,
  `ASIN View: All ASINs`,
  "",
  "================================================================================",
  "SUMMARY",
  "================================================================================",
  ...ratioLines("Search to Purchase Ratio", demand.searchToPurchaseRatio),
  "",
  ...ratioLines("Return Ratio", demand.returnRatio),
  "",
  ...competitionLines(),
  "",
  "================================================================================",
  "KEYWORDS & RETURNS",
  "================================================================================",
  ...renderKeywords(),
  "",
  ...renderReturnReasons(),
  "",
  ...renderStarRatings(),
  "",
  "================================================================================",
  "CHARTS (12M)",
  "================================================================================",
  ...renderSeries("Units Sold (12m monthly)", demand.unitSold, "mly"),
  "",
  ...renderSeries("Net Sales (12m monthly)", demand.netShippedGMS, "mly"),
  "",
  ...renderSeries("Search Volume (12m monthly)", demand.searchVolume, "mly"),
  "",
  ...renderSeries("Click Count (12m monthly)", demand.clickCount, "mly"),
  "",
  ...renderSeries("Glance Views (12m monthly)", demand.glanceViews, "mly"),
  "",
  "================================================================================",
  "FEATURES",
  "================================================================================",
  ...renderFeatures(),
];

process.stdout.write(lines.join("\n"));
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

OUTFILE="$DEST/${PREFIX}_CategoryInsights.txt"
REPORT="$(build_report "$RESOLVED_RESULT" "$PERFORMANCE_RESPONSE" "$FEATURES_RESPONSE")"

if [ -z "${REPORT// }" ]; then
  log "FAILED: Category Insights report is empty"
  exit 1
fi

printf '%s\n' "$REPORT" | write_stdin_to_file_with_node "$OUTFILE"

log "Saved: ${PREFIX}_CategoryInsights.txt"
log "Resolved path: $TARGET_CATEGORY_ID > $TARGET_PRODUCT_TYPE_LABEL > $TARGET_SEARCH_TERM"
log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
