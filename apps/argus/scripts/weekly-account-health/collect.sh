#!/bin/bash
# Weekly Account Health Screenshots
# Captures Account Health Dashboard + VoC pages via screencapture.
# Runs Monday 3 AM CT via launchd.

set -euo pipefail

DEST="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/04 Sales/Monitoring/Weekly/Account Health"
LOG="/tmp/weekly-account-health.log"

# Week calculation: BA weeks run Sun-Sat, W01 starts Dec 28 2025
EPOCH_START=$(date -j -f '%Y-%m-%d' '2025-12-28' '+%s')
# Find last Saturday
LAST_SAT=$(date -v-sat '+%Y-%m-%d')
EPOCH_SAT=$(date -j -f '%Y-%m-%d' "$LAST_SAT" '+%s')
WEEKS=$(( (EPOCH_SAT - EPOCH_START) / 604800 + 1 ))
WEEK_NUM=$(printf "W%02d" $WEEKS)
PREFIX="${WEEK_NUM}_${LAST_SAT}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
log "Starting weekly AH screenshots: $PREFIX"

if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
  log "ABORT: Chrome not running"; exit 1
fi

capture() {
  local url="$1"
  local filename="$2"
  local subfolder="$3"
  local wait_secs="${4:-20}"

  osascript -e "
tell application \"Google Chrome\"
  activate
  set bounds of first window to {0, 0, 1920, 1080}
  tell active tab of first window
    set URL to \"$url\"
  end tell
end tell
"
  sleep "$wait_secs"

  local bounds
  bounds=$(osascript -e 'tell application "Google Chrome" to get bounds of first window')
  local x1 y1 x2 y2
  x1=$(echo "$bounds" | cut -d',' -f1 | tr -d ' ')
  y1=$(echo "$bounds" | cut -d',' -f2 | tr -d ' ')
  x2=$(echo "$bounds" | cut -d',' -f3 | tr -d ' ')
  y2=$(echo "$bounds" | cut -d',' -f4 | tr -d ' ')
  screencapture -x -R"${x1},${y1},$((x2-x1)),$((y2-y1))" "$DEST/$subfolder/$filename"
  log "Captured: $subfolder/$filename"
}

# Dashboard
capture "https://sellercentral.amazon.com/performance/dashboard" \
  "${PREFIX}_AH-Dashboard.png" "Dashboard" 20

# VoC Overview
capture "https://sellercentral.amazon.com/voice-of-the-customer/ref=xx_voc_dnav_xx" \
  "${PREFIX}_AH-VoC-Overview.png" "VoC" 25

# VoC Details (scroll down on same page)
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    execute javascript "window.scrollTo(0, document.body.scrollHeight)"
  end tell
end tell
'
sleep 3
bounds=$(osascript -e 'tell application "Google Chrome" to get bounds of first window')
x1=$(echo "$bounds" | cut -d',' -f1 | tr -d ' ')
y1=$(echo "$bounds" | cut -d',' -f2 | tr -d ' ')
x2=$(echo "$bounds" | cut -d',' -f3 | tr -d ' ')
y2=$(echo "$bounds" | cut -d',' -f4 | tr -d ' ')
screencapture -x -R"${x1},${y1},$((x2-x1)),$((y2-y1))" "$DEST/VoC/${PREFIX}_AH-VoC-Details.png"
log "Captured: VoC/${PREFIX}_AH-VoC-Details.png"

log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
