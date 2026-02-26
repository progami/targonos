#!/bin/bash
# Weekly Brand Metrics CSV Download
# Navigates to Amazon Advertising Brand Metrics page with date params,
# clicks Export, saves CSV to Google Drive.
# Runs Monday 3 AM CT via launchd (called by run-weekly.sh).
#
# Supports override: bash collect.sh 2026-02-02 2026-02-08
# (pass startDate endDate to backfill a specific week)

set -euo pipefail

DEST="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/04 Sales/Monitoring/Weekly/Ad Console/Brand Metrics"
DL="$HOME/Downloads"
LOG="/tmp/weekly-brand-metrics.log"

EPOCH_START=$(date -j -f '%Y-%m-%d' '2025-12-28' '+%s')

# Allow date override for backfill: collect.sh <startDate> <endDate>
if [ $# -eq 2 ]; then
  START_DATE="$1"
  END_DATE="$2"
  EPOCH_END=$(date -j -f '%Y-%m-%d' "$END_DATE" '+%s')
  WEEKS=$(( (EPOCH_END - EPOCH_START) / 604800 + 1 ))
  WEEK_NUM=$(printf "W%02d" $WEEKS)
  PREFIX="${WEEK_NUM}_${END_DATE}"
else
  # Previous week: Sunday to Saturday
  LAST_SAT=$(date -v-sat '+%Y-%m-%d')
  LAST_SUN=$(date -j -v-6d -f '%Y-%m-%d' "$LAST_SAT" '+%Y-%m-%d')
  START_DATE="$LAST_SUN"
  END_DATE="$LAST_SAT"
  EPOCH_SAT=$(date -j -f '%Y-%m-%d' "$LAST_SAT" '+%s')
  WEEKS=$(( (EPOCH_SAT - EPOCH_START) / 604800 + 1 ))
  WEEK_NUM=$(printf "W%02d" $WEEKS)
  PREFIX="${WEEK_NUM}_${LAST_SAT}"
fi

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
log "Starting weekly Brand Metrics: $PREFIX ($START_DATE to $END_DATE)"

if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
  log "ABORT: Chrome not running"; exit 1
fi

# Find the Advertising tab and navigate (don't hijack the SC tab)
# Must use window.location.href via JS to force full page reload (SPA ignores set URL)
URL="https://advertising.amazon.com/bb/bm/overview?entityId=ENTITY2JBRT701DBI1P&brand=1113309&category=228899&startDate=${START_DATE}&endDate=${END_DATE}"

osascript -e "
tell application \"Google Chrome\"
  set w to first window
  repeat with i from 1 to (count of tabs of w)
    if URL of tab i of w contains \"advertising.amazon.com\" then
      set active tab index of w to i
      tell tab i of w
        execute javascript \"window.location.href = '$URL'; 'ok'\"
      end tell
      return
    end if
  end repeat
  tell active tab of w
    execute javascript \"window.location.href = '$URL'; 'ok'\"
  end tell
end tell
"
sleep 25

# Click Export button
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    execute javascript "
      var btns = document.querySelectorAll(\"button\");
      var found = false;
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].textContent.trim() === \"Export\") {
          btns[i].click();
          found = true;
          break;
        }
      }
      found ? \"clicked\" : \"not found\";
    "
  end tell
end tell
'
sleep 15

# Find and copy the downloaded CSV
# Filename pattern: Caelum_Star_Paint,_Wall_Treatments_&_Supplies_Overview_*.csv
LATEST_CSV=$(ls -t "$DL"/Caelum_Star_*Overview_*.csv 2>/dev/null | head -1)
if [ -n "$LATEST_CSV" ]; then
  cp "$LATEST_CSV" "$DEST/${PREFIX}_BrandMetrics.csv"
  log "Saved: ${PREFIX}_BrandMetrics.csv"
else
  log "WARNING: No Brand Metrics CSV found in Downloads"
fi

log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
