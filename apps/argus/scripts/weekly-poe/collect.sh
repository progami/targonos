#!/bin/bash
# Weekly Product Opportunity Explorer CSV Download
# Navigates to POE for "plastic drop cloth" niche, clicks into niche,
# clicks Products tab, downloads CSV.
# Runs Monday 3 AM CT via launchd.

set -euo pipefail

DEST="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/04 Sales/Monitoring/Weekly/Product Oppertunity Explorer"
DL="$HOME/Downloads"
LOG="/tmp/weekly-poe.log"

EPOCH_START=$(date -j -f '%Y-%m-%d' '2025-12-28' '+%s')
LAST_SAT=$(date -v-sat '+%Y-%m-%d')
EPOCH_SAT=$(date -j -f '%Y-%m-%d' "$LAST_SAT" '+%s')
WEEKS=$(( (EPOCH_SAT - EPOCH_START) / 604800 + 1 ))
WEEK_NUM=$(printf "W%02d" $WEEKS)
PREFIX="${WEEK_NUM}_${LAST_SAT}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
log "Starting weekly POE: $PREFIX"

if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
  log "ABORT: Chrome not running"; exit 1
fi

# Navigate to POE search results
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    set URL to "https://sellercentral.amazon.com/opportunity-explorer/explore/search?search=plastic+drop+cloth&search_type=KEYWORD"
  end tell
end tell
'
sleep 20

# Click the "plastic drop cloth" niche row
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    execute javascript "
      const links = document.querySelectorAll(\"a, span, td\");
      for (const el of links) {
        if (el.textContent.trim() === \"plastic drop cloth\") { el.click(); break; }
      }
    "
  end tell
end tell
'
sleep 15

# Click the "Products" tab
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    execute javascript "
      const tabs = document.querySelectorAll(\"button, a, [role=\\\"tab\\\"]\");
      for (const el of tabs) {
        if (el.textContent.trim() === \"Products\") { el.click(); break; }
      }
    "
  end tell
end tell
'
sleep 10

# Click Download button
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    execute javascript "
      const btns = document.querySelectorAll(\"button, a, [class*=\\\"download\\\"]\");
      for (const el of btns) {
        if (el.textContent.trim().includes(\"Download\")) { el.click(); break; }
      }
    "
  end tell
end tell
'
sleep 10

# Find and rename the downloaded CSV
LATEST_CSV=$(ls -t "$DL"/NicheDetailsProductsTab_*.csv 2>/dev/null | head -1)
if [ -n "$LATEST_CSV" ]; then
  cp "$LATEST_CSV" "$DEST/${PREFIX}_POE.csv"
  log "Saved: ${PREFIX}_POE.csv"
else
  log "WARNING: No POE CSV found in Downloads"
fi

log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
