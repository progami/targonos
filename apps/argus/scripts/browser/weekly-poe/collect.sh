#!/bin/bash
# Weekly Product Opportunity Explorer CSV download via Chrome.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

DEST="${ARGUS_POE_DEST:-/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Weekly/Product Opportunity Explorer (Browser)}"
LOG="${ARGUS_POE_LOG:-/tmp/weekly-poe.log}"
TARGET_URL="https://sellercentral.amazon.com/opportunity-explorer/explore/niche/84dd9c9ba70c2b6df8c7bacb37f9a326/product"

IFS='|' read -r WEEK_NUM START_DATE END_DATE PREFIX <<<"$(latest_complete_week_context)"

mkdir -p "$DEST"

TAB_ID=""

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
open_window() { TAB_ID="$(osascript "$CHROME_HELPER" open-window-tab "$1")"; }
run_js() { osascript "$CHROME_HELPER" run-js-tab-id "$TAB_ID" "$1"; }
wait_tab() { osascript "$CHROME_HELPER" wait-tab-id "$TAB_ID" >/dev/null; }
tab_url() { osascript "$CHROME_HELPER" get-url-tab-id "$TAB_ID"; }

log "Starting weekly POE: $PREFIX"

open_window "$TARGET_URL"
wait_tab

current_url=$(tab_url)
if is_amazon_login_url "$current_url"; then
  log "Seller Central session expired — attempting relogin"
  bash "$SCRIPT_DIR/../relogin.sh" "$TARGET_URL"
  open_window "$TARGET_URL"
  wait_tab
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
  download_payload=$(run_js "$download_js")
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
