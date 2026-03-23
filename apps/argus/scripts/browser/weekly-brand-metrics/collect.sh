#!/bin/bash
# Weekly Brand Metrics text capture via Safari.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

DEST="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Weekly/Ad Console/Brand Metrics (Browser)"
DL="$HOME/Downloads"
LOG="/tmp/weekly-brand-metrics.log"

if [ "$#" -eq 2 ]; then
  START_DATE="$1"
  END_DATE="$2"
  IFS='|' read -r WEEK_NUM _ _ PREFIX <<<"$(week_context_for_end_date "$END_DATE")"
else
  IFS='|' read -r WEEK_NUM START_DATE END_DATE PREFIX <<<"$(latest_complete_week_context)"
fi

TARGET_URL="https://advertising.amazon.com/bb/bm/overview?entityId=ENTITY2JBRT701DBI1P&brand=1113309&category=228899&startDate=${START_DATE}&endDate=${END_DATE}"

mkdir -p "$DEST"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
run_js() { osascript "$SAFARI_HELPER" run-js "$1" "$2" "$3"; }
wait_tab() { osascript "$SAFARI_HELPER" wait-tab "$1" "$2" >/dev/null; }
tab_url() { osascript "$SAFARI_HELPER" get-url "$1" "$2"; }

log "Starting weekly Brand Metrics: $PREFIX ($START_DATE to $END_DATE)"

tab_info=$(osascript "$SAFARI_HELPER" open-tab "$TARGET_URL")
parse_tab_info "$tab_info"
sleep 25
wait_tab "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX"

current_url=$(tab_url "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX")
if is_amazon_login_url "$current_url"; then
  log "Amazon Ads session expired — attempting relogin"
  bash "$SCRIPT_DIR/../relogin.sh" "$TARGET_URL"
  tab_info=$(osascript "$SAFARI_HELPER" open-tab "$TARGET_URL")
  parse_tab_info "$tab_info"
  sleep 25
  wait_tab "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX"
fi

extract_js='(() => {
  const main = document.querySelector("#sc-content-container, #app-content") || document.body;
  const url = location.href || "";
  const title = document.title || "";
  const text = (main?.innerText || "").trim();
  if (!text) return "";
  return [
    "Brand Metrics",
    "Source URL: " + url,
    "Page Title: " + title,
    "",
    text
  ].join("\n");
})();'

PAGE_DATA=$(run_js "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX" "$extract_js")
if [ -z "${PAGE_DATA// }" ]; then
  log "FAILED: Brand Metrics page content is empty"
  exit 1
fi

OUTFILE="$DEST/${PREFIX}_BrandMetrics.txt"
printf '%s\n' "$PAGE_DATA" | write_stdin_to_file_with_node "$OUTFILE"
log "Saved: ${PREFIX}_BrandMetrics.txt"
log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
