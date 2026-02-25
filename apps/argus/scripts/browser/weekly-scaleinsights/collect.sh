#!/bin/bash
# Weekly ScaleInsights Keyword Ranking Export
# Navigates to ScaleInsights, exports keyword ranking XLSX.
# Runs Monday 3 AM CT via launchd.

set -euo pipefail

DEST="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/04 Sales/Monitoring/Weekly/ScaleInsights/KeywordRanking"
DL="$HOME/Downloads"
LOG="/tmp/weekly-scaleinsights.log"

EPOCH_START=$(date -j -f '%Y-%m-%d' '2025-12-28' '+%s')
LAST_SAT=$(date -v-sat '+%Y-%m-%d')
EPOCH_SAT=$(date -j -f '%Y-%m-%d' "$LAST_SAT" '+%s')
WEEKS=$(( (EPOCH_SAT - EPOCH_START) / 604800 + 1 ))
WEEK_NUM=$(printf "W%02d" $WEEKS)
PREFIX="${WEEK_NUM}_${LAST_SAT}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
log "Starting weekly ScaleInsights: $PREFIX"

if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
  log "ABORT: Chrome not running"; exit 1
fi

# Navigate directly to Keyword Ranking page
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    set URL to "https://portal.scaleinsights.com/KeywordRanking"
  end tell
end tell
'
sleep 20

# Click Download link (exports XLSX)
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    execute javascript "
      var links = document.querySelectorAll(\"a\");
      for (var i = 0; i < links.length; i++) {
        if (links[i].textContent.trim() === \"Download\") {
          links[i].click();
          break;
        }
      }
    "
  end tell
end tell
'
sleep 15

# Find and rename the downloaded XLSX
LATEST_XLSX=$(ls -t "$DL"/KeywordRanking_*.xlsx 2>/dev/null | head -1)
if [ -n "$LATEST_XLSX" ]; then
  cp "$LATEST_XLSX" "$DEST/${PREFIX}_SI-KeywordRanking.xlsx"
  log "Saved: ${PREFIX}_SI-KeywordRanking.xlsx"
else
  log "WARNING: No ScaleInsights XLSX found in Downloads"
fi

log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
