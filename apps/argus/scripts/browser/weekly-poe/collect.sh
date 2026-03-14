#!/bin/bash
# Weekly Product Opportunity Explorer CSV download via Safari.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

DEST="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Weekly/Product Opportunity Explorer"
LOG="/tmp/weekly-poe.log"
TARGET_URL="https://sellercentral.amazon.com/opportunity-explorer/explore/niche/84dd9c9ba70c2b6df8c7bacb37f9a326/product"

EPOCH_START=$(date -j -f '%Y-%m-%d' '2025-12-28' '+%s')
LAST_SAT=$(date -v-sat '+%Y-%m-%d')
EPOCH_SAT=$(date -j -f '%Y-%m-%d' "$LAST_SAT" '+%s')
WEEKS=$(( (EPOCH_SAT - EPOCH_START) / 604800 + 1 ))
WEEK_NUM=$(printf "W%02d" "$WEEKS")
PREFIX="${WEEK_NUM}_${LAST_SAT}"

mkdir -p "$DEST"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
run_js() { osascript "$SAFARI_HELPER" run-js "$1" "$2" "$3"; }
wait_tab() { osascript "$SAFARI_HELPER" wait-tab "$1" "$2" >/dev/null; }
navigate_tab() { osascript "$SAFARI_HELPER" navigate-tab "$1" "$2" "$3" >/dev/null; }
tab_url() { osascript "$SAFARI_HELPER" get-url "$1" "$2"; }

log "Starting weekly POE: $PREFIX"

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

download_js='(() => {
  const link = Array.from(document.querySelectorAll("a,button")).find((el) => (el.innerText || el.textContent || "").trim() === "Download");
  if (!link) return JSON.stringify({ status: "NO_DOWNLOAD_BUTTON" });
  const request = new XMLHttpRequest();
  request.open("GET", link.href, false);
  request.send();
  return JSON.stringify({
    status: request.status && request.status !== 200 ? `FETCH_FAILED_${request.status}` : "OK",
    content: request.responseText || ""
  });
})();'

download_payload=""
for _ in $(seq 1 10); do
  download_payload=$(run_js "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX" "$download_js")
  download_status=$("$NODE_BIN" -e 'const payload = JSON.parse(process.argv[1]); process.stdout.write(payload.status || "");' "$download_payload")
  if [ "$download_status" = "OK" ]; then
    break
  fi
  sleep 2
done

if [ "$download_status" != "OK" ]; then
  log "FAILED: POE download fetch returned $download_status"
  exit 1
fi

$NODE_BIN -e 'const payload = JSON.parse(process.argv[1]); process.stdout.write(payload.content || "");' "$download_payload" \
  | write_stdin_to_file_with_node "$DEST/${PREFIX}_POE.csv"
log "Saved: ${PREFIX}_POE.csv"
log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
