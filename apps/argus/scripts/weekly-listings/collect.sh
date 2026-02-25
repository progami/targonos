#!/bin/bash
# Weekly Listing Screenshots
# Captures product listing pages for Caelum Star + competitors via screencapture.
# Runs Monday 3 AM CT via launchd.

set -euo pipefail

DEST="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/04 Sales/Monitoring/Weekly/Listings"
LOG="/tmp/weekly-listings.log"

EPOCH_START=$(date -j -f '%Y-%m-%d' '2025-12-28' '+%s')
LAST_SAT=$(date -v-sat '+%Y-%m-%d')
EPOCH_SAT=$(date -j -f '%Y-%m-%d' "$LAST_SAT" '+%s')
WEEKS=$(( (EPOCH_SAT - EPOCH_START) / 604800 + 1 ))
WEEK_NUM=$(printf "W%02d" $WEEKS)
PREFIX="${WEEK_NUM}_${LAST_SAT}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
log "Starting weekly listing screenshots: $PREFIX"

if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
  log "ABORT: Chrome not running"; exit 1
fi

capture_listing() {
  local asin="$1"
  local brand="$2"

  osascript -e "
tell application \"Google Chrome\"
  activate
  set bounds of first window to {0, 0, 1920, 1080}
  tell active tab of first window
    set URL to \"https://www.amazon.com/dp/$asin\"
  end tell
end tell
"
  sleep 15

  local bounds
  bounds=$(osascript -e 'tell application "Google Chrome" to get bounds of first window')
  local x1 y1 x2 y2
  x1=$(echo "$bounds" | cut -d',' -f1 | tr -d ' ')
  y1=$(echo "$bounds" | cut -d',' -f2 | tr -d ' ')
  x2=$(echo "$bounds" | cut -d',' -f3 | tr -d ' ')
  y2=$(echo "$bounds" | cut -d',' -f4 | tr -d ' ')
  screencapture -x -R"${x1},${y1},$((x2-x1)),$((y2-y1))" "$DEST/$brand/${PREFIX}_Listing.png"
  log "Captured: $brand/${PREFIX}_Listing.png"
}

capture_listing "B09HXC3NL8" "Caelum Star"
capture_listing "B0DQDWV1SV" "Axgatoxe"
capture_listing "B0CWS3848Y" "Ecotez"

log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
