#!/bin/bash
# Weekly ScaleInsights Keyword Ranking Export
# Navigates to ScaleInsights, exports keyword ranking XLSX.
# Runs Monday 3 AM CT via launchd.

set -euo pipefail

DEST="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Weekly/ScaleInsights/KeywordRanking"
DL="$HOME/Downloads"
LOG="/tmp/weekly-scaleinsights.log"

EPOCH_START=$(date -j -f '%Y-%m-%d' '2025-12-28' '+%s')
LAST_SAT=$(date -v-sat '+%Y-%m-%d')
LAST_SUN=$(date -j -v-6d -f '%Y-%m-%d' "$LAST_SAT" '+%Y-%m-%d')
EPOCH_SAT=$(date -j -f '%Y-%m-%d' "$LAST_SAT" '+%s')
WEEKS=$(( (EPOCH_SAT - EPOCH_START) / 604800 + 1 ))
WEEK_NUM=$(printf "W%02d" $WEEKS)
PREFIX="${WEEK_NUM}_${LAST_SAT}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
log "Starting weekly ScaleInsights: $PREFIX"

if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
  log "ABORT: Chrome not running"; exit 1
fi

# Find the ScaleInsights tab and navigate (don't hijack the SC tab)
osascript -e '
tell application "Google Chrome"
  set w to first window
  repeat with i from 1 to (count of tabs of w)
    if URL of tab i of w contains "scaleinsights.com" then
      set active tab index of w to i
      set URL of tab i of w to "https://portal.scaleinsights.com/KeywordRanking"
      return
    end if
  end repeat
  tell active tab of w
    set URL to "https://portal.scaleinsights.com/KeywordRanking"
  end tell
end tell
'
sleep 20

# Set exact Sunday–Saturday date range before download
osascript -e "
tell application \"Google Chrome\"
  tell active tab of first window
    execute javascript \"
      (function() {
        var dp = jQuery('#reportrange').data('daterangepicker');
        dp.setStartDate('${LAST_SUN}');
        dp.setEndDate('${LAST_SAT}');
        dp.clickApply();
      })()
    \"
  end tell
end tell
"
sleep 15

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
