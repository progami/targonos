#!/bin/bash
# Weekly Product Opportunity Explorer CSV capture via the authenticated POE GraphQL backend.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"
load_monitoring_env

DEST="${ARGUS_POE_DEST:-$(argus_monitoring_root)/Weekly/Product Opportunity Explorer (Browser)}"
LOG="${ARGUS_POE_LOG:-$(argus_tmp_log_path weekly-poe)}"
TARGET_URL_BASE="$(require_market_env ARGUS_POE_TARGET_URL_BASE)"
TARGET_URL_BASE_PATH="$("$NODE_BIN" -e 'const url = new URL(process.argv[1]); process.stdout.write(url.pathname.replace(/\/$/, ""));' "$TARGET_URL_BASE")"
TARGET_NICHE_ID="$("$NODE_BIN" -e 'const parts = new URL(process.argv[1]).pathname.split("/").filter(Boolean); const index = parts.indexOf("niche"); if (index === -1) throw new Error("POE target URL must include /niche/{id}"); if (!parts[index + 1]) throw new Error("POE target URL must include /niche/{id}"); process.stdout.write(parts[index + 1]);' "$TARGET_URL_BASE")"
TARGET_MARKETPLACE_ID="$(require_market_env AMAZON_MARKETPLACE_ID)"

IFS='|' read -r WEEK_NUM START_DATE END_DATE PREFIX <<<"$(latest_complete_week_context)"

mkdir -p "$DEST"

TAB_ID=""

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
open_window() { TAB_ID="$(run_chrome_helper open-window-tab "$1")"; }
run_js() { run_chrome_helper run-js-tab-id "$TAB_ID" "$1"; }
wait_tab() { run_chrome_helper wait-tab-id "$TAB_ID" >/dev/null; }
tab_url() { run_chrome_helper get-url-tab-id "$TAB_ID"; }
navigate_tab() { run_chrome_helper navigate-tab-id "$TAB_ID" "$1" >/dev/null; }

wait_for_expected_path() {
  local expected_path="$1"
  local actual_path=""

  for _ in $(seq 1 60); do
    actual_path="$(run_js "location.pathname")"
    if [ "$actual_path" = "$expected_path" ]; then
      printf '%s' "$actual_path"
      return 0
    fi
    sleep 1
  done

  printf '%s' "$actual_path"
  return 1
}

ensure_route_loaded() {
  local target_url="$1"

  if [ -z "$TAB_ID" ]; then
    open_window "$target_url"
  else
    navigate_tab "$target_url"
  fi
  wait_tab

  local current_url
  current_url="$(tab_url)"
  if is_amazon_login_url "$current_url"; then
    log "Seller Central session expired — attempting relogin"
    bash "$SCRIPT_DIR/../relogin.sh" "$target_url"
    if [ -z "$TAB_ID" ]; then
      open_window "$target_url"
    else
      navigate_tab "$target_url"
    fi
    wait_tab
  fi
}

fetch_graphql_payload() {
  local js
  js="$("$NODE_BIN" - "$TARGET_NICHE_ID" "$TARGET_MARKETPLACE_ID" <<'NODE'
const nicheId = process.argv[2];
const marketplaceId = process.argv[3];
const query = `
query getNiche($nicheInput: NicheInput!) {
  niche(request: $nicheInput) {
    nicheId
    obfuscatedMarketplaceId
    nicheTitle
    currency
    lastUpdatedTimeISO8601
  }
  asinMetrics(request: $nicheInput) {
    asin
    asinTitle
    brand
    category
    launchDate
    clickCountT360
    clickShareT360
    avgPriceT360
    currency
    totalReviews
    customerRating
    bestSellersRanking
    avgSellerVendorCountT360
  }
  searchTermMetrics(request: $nicheInput) {
    searchTerm
    searchVolumeT360
    searchVolumeQoq
    searchVolumeGrowthT180
    clickShareT360
    searchConversionRateT360
    topClickedProducts {
      asin
      asinTitle
      obfuscatedMarketplaceId
    }
  }
}
`;

const body = JSON.stringify({
  operationName: 'getNiche',
  query,
  variables: {
    nicheInput: {
      nicheId,
      obfuscatedMarketplaceId: marketplaceId,
    },
  },
});

process.stdout.write(`(() => fetch('/ox-api/graphql', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {
    'content-type': 'application/json',
    'anti-csrftoken-a2z': document.querySelector('meta[name="anti-csrftoken-a2z"]')?.content ?? '',
  },
  body: ${JSON.stringify(body)},
}).then(async (response) => {
  const text = await response.text();
  if (!response.ok) {
    throw new Error('POE GraphQL HTTP ' + response.status + ': ' + text.slice(0, 500));
  }
  return text;
}))();`);
NODE
)"
  run_js "$js"
}

write_csvs() {
  local payload="$1"
  local payload_file

  payload_file="$(mktemp "/tmp/argus-poe-$(argus_market)-XXXXXX.json")"
  printf '%s' "$payload" | write_stdin_to_file_with_node "$payload_file"
  "$NODE_BIN" "$SCRIPT_DIR/write-graphql-csvs.mjs" \
    "$payload_file" \
    "$DEST/${PREFIX}_POE.csv" \
    "$DEST/${PREFIX}_POE-SearchTerms.csv"
  rm -f "$payload_file"
}

log "Starting weekly POE: $PREFIX"

ensure_route_loaded "${TARGET_URL_BASE}/product"

expected_path="${TARGET_URL_BASE_PATH}/product"
if ! current_path="$(wait_for_expected_path "$expected_path")"; then
  log "FAILED: POE route stabilized on unexpected path $current_path"
  exit 1
fi

payload="$(fetch_graphql_payload)"
write_csvs "$payload"

log "Saved: ${PREFIX}_POE.csv"
log "Saved: ${PREFIX}_POE-SearchTerms.csv"
log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
