#!/bin/bash
# Weekly Product Opportunity Explorer CSV download via Chrome.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

DEST="${ARGUS_POE_DEST:-/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Weekly/Product Opportunity Explorer (Browser)}"
LOG="${ARGUS_POE_LOG:-/tmp/weekly-poe.log}"
TARGET_URL_BASE="https://sellercentral.amazon.com/opportunity-explorer/explore/niche/84dd9c9ba70c2b6df8c7bacb37f9a326"

IFS='|' read -r WEEK_NUM START_DATE END_DATE PREFIX <<<"$(latest_complete_week_context)"

mkdir -p "$DEST"

TAB_ID=""

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
open_window() { TAB_ID="$(osascript "$CHROME_HELPER" open-window-tab "$1")"; }
run_js() { osascript "$CHROME_HELPER" run-js-tab-id "$TAB_ID" "$1"; }
wait_tab() { osascript "$CHROME_HELPER" wait-tab-id "$TAB_ID" >/dev/null; }
tab_url() { osascript "$CHROME_HELPER" get-url-tab-id "$TAB_ID"; }
navigate_tab() { osascript "$CHROME_HELPER" navigate-tab-id "$TAB_ID" "$1" >/dev/null; }

ensure_route_loaded() {
  local target_url="$1"

  if [ -z "$TAB_ID" ]; then
    open_window "$target_url"
  else
    navigate_tab "$target_url"
  fi
  wait_tab

  local current_url
  current_url=$(tab_url)
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

wait_for_expected_path() {
  local expected_path="$1"
  local actual_path=""

  for _ in $(seq 1 20); do
    actual_path=$(run_js "location.pathname")
    if [ "$actual_path" = "$expected_path" ]; then
      printf '%s' "$actual_path"
      return 0
    fi
    sleep 1
  done

  printf '%s' "$actual_path"
  return 1
}

download_export() {
  local route_path="$1"
  local expected_tab="$2"
  local output_name="$3"
  local target_url="${TARGET_URL_BASE}/${route_path}"
  local expected_path
  local download_js
  local download_payload=""
  local download_status=""

  ensure_route_loaded "$target_url"
  expected_path="/opportunity-explorer/explore/niche/84dd9c9ba70c2b6df8c7bacb37f9a326/${route_path}"

  if ! actual_path=$(wait_for_expected_path "$expected_path"); then
    log "FAILED: ${expected_tab} route stabilized on unexpected path ${actual_path}"
    exit 1
  fi

  download_js="$("$NODE_BIN" -e '
const expectedPath = process.argv[1];
const expectedTab = process.argv[2];
process.stdout.write(`(() => {
  const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
  if (location.pathname !== ${JSON.stringify(expectedPath)}) {
    return JSON.stringify({ status: "UNEXPECTED_PATH", path: location.pathname });
  }
  const tab = Array.from(document.querySelectorAll("kat-tab,button,a,span,div")).find((element) => normalize(element.innerText ?? element.textContent) === ${JSON.stringify(expectedTab)});
  if (!tab) {
    return JSON.stringify({ status: "MISSING_TAB", tab: ${JSON.stringify(expectedTab)} });
  }
  const link = Array.from(document.querySelectorAll("a,button")).find((element) => normalize(element.innerText ?? element.textContent) === "Download");
  if (!link) {
    return JSON.stringify({ status: "NO_DOWNLOAD_BUTTON", tab: ${JSON.stringify(expectedTab)} });
  }
  if (!link.href) {
    return JSON.stringify({ status: "NO_DOWNLOAD_BUTTON", tab: ${JSON.stringify(expectedTab)} });
  }
  const request = new XMLHttpRequest();
  request.open("GET", link.href, false);
  request.send();
  return JSON.stringify({
    status: request.status && request.status !== 200 ? \`FETCH_FAILED_\${request.status}\` : "OK",
    tab: ${JSON.stringify(expectedTab)},
    content: request.responseText ?? ""
  });
})();`);
' "$expected_path" "$expected_tab")"

  for _ in $(seq 1 10); do
    download_payload=$(run_js "$download_js")
    download_status=$("$NODE_BIN" -e 'const payload = JSON.parse(process.argv[1]); process.stdout.write(payload.status ?? "");' "$download_payload")
    if [ "$download_status" = "OK" ]; then
      break
    fi
    sleep 2
  done

  if [ "$download_status" != "OK" ]; then
    log "FAILED: ${expected_tab} download fetch returned $download_status"
    exit 1
  fi

  $NODE_BIN -e 'const payload = JSON.parse(process.argv[1]); process.stdout.write(payload.content ?? "");' "$download_payload" \
    | write_stdin_to_file_with_node "$DEST/$output_name"
  log "Saved: $output_name"
}

log "Starting weekly POE: $PREFIX"

download_export "product" "Products" "${PREFIX}_POE.csv"
download_export "search-queries" "Search Terms" "${PREFIX}_POE-SearchTerms.csv"
log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
