#!/bin/bash
# Weekly Category Insights text extraction via Safari.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

DEST="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Weekly/Category Insights"
LOG="/tmp/weekly-category-insights.log"
TARGET_URL="https://sellercentral.amazon.com/selection/category-insights"

EPOCH_START=$(date -j -f '%Y-%m-%d' '2025-12-28' '+%s')
LAST_SAT=$(date -v-sat '+%Y-%m-%d')
EPOCH_SAT=$(date -j -f '%Y-%m-%d' "$LAST_SAT" '+%s')
WEEKS=$(( (EPOCH_SAT - EPOCH_START) / 604800 + 1 ))
WEEK_NUM=$(printf "W%02d" "$WEEKS")
PREFIX="${WEEK_NUM}_${LAST_SAT}"
TODAY=$(date '+%Y-%m-%d')

mkdir -p "$DEST"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
run_js() { osascript "$SAFARI_HELPER" run-js "$1" "$2" "$3"; }
wait_tab() { osascript "$SAFARI_HELPER" wait-tab "$1" "$2" >/dev/null; }
navigate_tab() { osascript "$SAFARI_HELPER" navigate-tab "$1" "$2" "$3" >/dev/null; }
tab_url() { osascript "$SAFARI_HELPER" get-url "$1" "$2"; }

log "Starting weekly Category Insights: $PREFIX"

tab_info=$(osascript "$SAFARI_HELPER" ensure-tab "$TARGET_URL" "sellercentral.amazon.com,amazon.com")
parse_tab_info "$tab_info"

navigate_tab "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX" "$TARGET_URL"
wait_tab "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX"

current_url=$(tab_url "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX")
if is_amazon_login_url "$current_url"; then
  log "Seller Central session expired — attempting relogin"
  bash "$SCRIPT_DIR/../relogin.sh" "$TARGET_URL"
  tab_info=$(osascript "$SAFARI_HELPER" ensure-tab "$TARGET_URL" "sellercentral.amazon.com,amazon.com")
  parse_tab_info "$tab_info"
  navigate_tab "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX" "$TARGET_URL"
  wait_tab "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX"
fi

search_js='(() => {
  const input = document.getElementById("search-predictive-input") || document.querySelector("input[placeholder*=\"Search categories\"]");
  if (!input) return "NO_SEARCH_INPUT";
  input.focus();
  input.value = "Painting Drop Cloths";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return "SEARCH_FILLED";
})();'

search_status=""
for _ in $(seq 1 15); do
  search_status=$(run_js "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX" "$search_js")
  if [ "$search_status" = "SEARCH_FILLED" ]; then
    break
  fi
  sleep 2
done

if [ "$search_status" != "SEARCH_FILLED" ]; then
  log "FAILED: Category search input not found"
  exit 1
fi

sleep 5

select_js='(() => {
  const options = Array.from(document.querySelectorAll("div.list-item"));
  const target = options.find((option) => option.textContent.includes("Painting Drop"));
  if (!target) return "NO_CATEGORY_OPTION";
  target.click();
  return "CATEGORY_SELECTED";
})();'

if [ "$(run_js "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX" "$select_js")" != "CATEGORY_SELECTED" ]; then
  log "FAILED: Category option not found"
  exit 1
fi

sleep 20

extract_js='(() => {
  const main = document.querySelector("#sc-content-container") || document.body;
  return (main?.innerText || "").trim();
})();'
PAGE_DATA=$(run_js "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX" "$extract_js")

if [ -z "${PAGE_DATA// }" ]; then
  log "FAILED: Extracted Category Insights content is empty"
  exit 1
fi

OUTFILE="$DEST/${PREFIX}_CategoryInsights.txt"
PAGE_OUTPUT=$({
  echo "Category Insights — Painting Drop Cloths Plastic Sheeting"
  echo "Category: Tools & Home Improvement > Building Material > Painting Drop Cloths Plastic Sheeting"
  echo "Store: United States"
  echo "Captured: $TODAY"
  echo ""
  echo "$PAGE_DATA"
})

printf '%s\n' "$PAGE_OUTPUT" | write_stdin_to_file_with_node "$OUTFILE"

log "Saved: ${PREFIX}_CategoryInsights.txt"
log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
