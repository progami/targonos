#!/bin/bash
# Weekly Browser Sources — Master Runner
# Calls each weekly collection script in sequence.
# Runs Monday 3 AM CT via launchd.
#
# Uses Safari for Seller Central + ScaleInsights and Chrome for Brand Metrics export.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

LOG="/tmp/weekly-browser-sources.log"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
log "=== Weekly Master Run Starting ==="

open -a Safari
open -a "Google Chrome"
sleep 2

FAILED=0

run_script() {
  local name="$1"
  local script="$2"
  log "Running: $name"
  if bash "$script"; then
    log "OK: $name"
  else
    local exit_code=$?
    log "FAILED: $name (exit $exit_code)"
    FAILED=$((FAILED + 1))
  fi
  sleep 5
}

run_script "Category Insights" "$SCRIPT_DIR/weekly-category-insights/collect.sh"
run_script "Product Opportunity Explorer" "$SCRIPT_DIR/weekly-poe/collect.sh"
run_script "ScaleInsights" "$SCRIPT_DIR/weekly-scaleinsights/collect.sh"
run_script "Brand Metrics" "$SCRIPT_DIR/weekly-brand-metrics/collect.sh"

log "=== Weekly Master Run Done ($FAILED failures) ==="

if [ "$FAILED" -gt 0 ]; then
  EMAIL_SUBJECT="Argus: Weekly Browser Sources failed ($FAILED)"
  LOG_TAIL="$(tail -200 "$LOG")"
  EMAIL_TEXT="$(printf "Weekly browser sources: %s script(s) failed.\nHost: %s\nLog: %s\n\nLast log lines:\n%s\n" "$FAILED" "$(hostname)" "$LOG" "$LOG_TAIL")"
  "$NODE_BIN" "$REPO_ROOT/apps/argus/scripts/lib/send-alert-email.mjs" --subject "$EMAIL_SUBJECT" --text "$EMAIL_TEXT"
  osascript -e "display notification \"Weekly sources: $FAILED script(s) failed\" with title \"Weekly Monitor\"" 2>/dev/null
else
  osascript -e 'display notification "Weekly sources: All collections complete" with title "Weekly Monitor"' 2>/dev/null
fi

tail -200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
