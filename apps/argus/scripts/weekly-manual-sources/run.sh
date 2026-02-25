#!/bin/bash
# Weekly Manual Sources — Master Runner
# Calls each weekly collection script in sequence.
# Runs Monday 3 AM CT via launchd.
#
# No Claude needed. Pure AppleScript + screencapture + JS extraction.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
LOG="/tmp/weekly-manual-sources.log"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
log "=== Weekly Master Run Starting ==="

# Check Chrome is running
if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
  log "ABORT: Chrome not running"
  osascript -e 'display notification "Weekly sources: Chrome not running" with title "Weekly Monitor"' 2>/dev/null
  exit 1
fi

# Check Seller Central session
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    set URL to "https://sellercentral.amazon.com/home"
  end tell
end tell
'
sleep 20

PAGE_URL=$(osascript -e '
tell application "Google Chrome"
  return URL of active tab of first window
end tell
')
if [[ "$PAGE_URL" == *"signin"* ]]; then
  log "ABORT: Seller Central session expired"
  osascript -e 'display notification "Weekly sources: SC session expired — login required" with title "Weekly Monitor"' 2>/dev/null
  exit 1
fi

log "Session OK"

FAILED=0

run_script() {
  local name="$1"
  local script="$2"
  log "Running: $name"
  if bash "$script"; then
    log "OK: $name"
  else
    log "FAILED: $name (exit $?)"
    FAILED=$((FAILED + 1))
  fi
  sleep 5
}

run_script "Category Insights" "$PARENT_DIR/weekly-category-insights/collect.sh"
run_script "Product Opportunity Explorer" "$PARENT_DIR/weekly-poe/collect.sh"
run_script "ScaleInsights" "$PARENT_DIR/weekly-scaleinsights/collect.sh"

log "=== Weekly Master Run Done ($FAILED failures) ==="

if [ $FAILED -gt 0 ]; then
  osascript -e "display notification \"Weekly sources: $FAILED script(s) failed\" with title \"Weekly Monitor\"" 2>/dev/null
else
  osascript -e 'display notification "Weekly sources: All collections complete" with title "Weekly Monitor"' 2>/dev/null
fi

# Trim log
tail -200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
