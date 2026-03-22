#!/bin/bash
# Weekly Product Opportunity Explorer CSV Download
# Navigates to POE for "plastic drop cloth" niche, clicks into niche,
# clicks Products tab, downloads CSV.
# Runs Monday 3 AM CT via launchd.

set -euo pipefail

DEST="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Weekly/Product Opportunity Explorer"
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

# Navigate directly to POE niche Products tab
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    set URL to "https://sellercentral.amazon.com/opportunity-explorer/explore/niche/84dd9c9ba70c2b6df8c7bacb37f9a326/product"
  end tell
end tell
'
sleep 20

# Click Download button
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    execute javascript "
      var btns = document.querySelectorAll(\"a\");
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].textContent.trim() === \"Download\") {
          btns[i].click();
          break;
        }
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
