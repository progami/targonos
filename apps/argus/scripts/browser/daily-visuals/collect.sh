#!/bin/bash
# Daily Visuals — Full-page Amazon Listing Screenshots
# Uses Playwright (headless Chromium) to capture full-page listing screenshots,
# splits into 4 vertical parts, saves to Google Drive organized by brand, ASIN, and date.
#
# Tracked:
#   All ASINs present in Monitoring hourly listing state:
#   /Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Hourly/Listing Attributes (API)/latest_state.json
#
# Runs daily at 3:30 AM CT via launchd.

set -euo pipefail

DEST="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Daily/Visuals"
LOG="/tmp/daily-visuals.log"
TODAY=$(date '+%Y-%m-%d')
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
log "Starting daily visuals capture: $TODAY"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if ! NODE_BIN="$(command -v node)"; then
  log "ABORT: Node.js not found in PATH=$PATH"
  exit 1
fi

if ! command -v magick >/dev/null 2>&1; then
  log "ABORT: ImageMagick not found (magick)"
  exit 1
fi

# Resolve ASINs + brand folders from hourly listing state (tracks all variations).
if ! ASIN_MAP="$("$NODE_BIN" "$SCRIPT_DIR/resolve-asins.mjs" 2>>"$LOG")"; then
  log "ABORT: resolve-asins.mjs failed"
  exit 1
fi
if [ -z "${ASIN_MAP:-}" ]; then
  log "ABORT: No ASINs returned from resolve-asins.mjs"
  exit 1
fi

FAILED=0

capture_listing() {
  local asin="$1"
  local brand="$2"
  local dest_dir="$DEST/$brand/$asin/$TODAY"
  mkdir -p "$dest_dir"

  log "Capturing $brand ($asin)"
  TMP_PNG="/tmp/${asin}.png"

  if ! "$NODE_BIN" "$SCRIPT_DIR/capture.mjs" --asin "$asin" --output "$TMP_PNG" >> "$LOG" 2>&1; then
    log "WARNING: Playwright capture failed for $brand ($asin)"
    rm -f "$TMP_PNG"
    return 1
  fi

  if ! DIMS=$(magick identify -format "%w %h" "$TMP_PNG" 2>>"$LOG"); then
    log "WARNING: Failed to identify screenshot dimensions for $brand ($asin)"
    rm -f "$TMP_PNG"
    return 1
  fi
  WIDTH=$(echo "$DIMS" | awk '{print $1}')
  HEIGHT=$(echo "$DIMS" | awk '{print $2}')

  if [ -z "${WIDTH:-}" ] || [ -z "${HEIGHT:-}" ]; then
    log "WARNING: Failed to parse screenshot dimensions for $brand ($asin)"
    rm -f "$TMP_PNG"
    return 1
  fi

  PART_H=$((HEIGHT / 4))
  for idx in 1 2 3 4; do
    TOP=$(( (idx - 1) * PART_H ))
    if [ "$idx" -eq 4 ]; then
      CROP_H=$((HEIGHT - TOP))
    else
      CROP_H=$PART_H
    fi

    if ! magick "$TMP_PNG" -crop "${WIDTH}x${CROP_H}+0+${TOP}" +repage "$dest_dir/part${idx}.png" >> "$LOG" 2>&1; then
      log "WARNING: Failed to crop part${idx} for $brand ($asin)"
      rm -f "$TMP_PNG"
      return 1
    fi
  done

  log "Saved: $brand/$asin/$TODAY/part{1..4}.png"
  rm -f "$TMP_PNG"

  return 0
}

while IFS=$'\t' read -r asin brand; do
  if [ -z "${asin:-}" ] || [ -z "${brand:-}" ]; then
    continue
  fi
  if ! capture_listing "$asin" "$brand"; then
    FAILED=$((FAILED + 1))
  fi
  sleep 5
done <<< "$ASIN_MAP"

log "Daily visuals done ($FAILED failures)"
tail -200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
