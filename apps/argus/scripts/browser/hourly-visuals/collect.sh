#!/bin/bash
# Hourly Visuals — Full-page Amazon Listing Screenshots
# Uses GoFullPage Chrome extension to capture full-page listing screenshots,
# splits into 4 vertical parts, saves to Google Drive organized by brand and date.
#
# Competitors:
#   Caelum Star  — B09HXC3NL8
#   Axgatoxe     — B0DQDWV1SV
#   Ecotez       — B0CWS3848Y
#
# Runs every hour via launchd.

set -euo pipefail

DEST="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/04 Sales/Monitoring/Hourly/Visuals"
DL="$HOME/Downloads"
LOG="/tmp/hourly-visuals.log"
TODAY=$(date '+%Y-%m-%d')
HOUR=$(date '+%H')

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
log "Starting hourly visuals capture: $TODAY $HOUR:00"

if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
  log "ABORT: Chrome not running"; exit 1
fi

# ASINs and their brand folder names
declare -a ASINS=("B09HXC3NL8" "B0DQDWV1SV" "B0CWS3848Y")
declare -a BRANDS=("Caelum Star" "Axgatoxe" "Ecotez")

FAILED=0

capture_listing() {
  local asin="$1"
  local brand="$2"
  local dest_dir="$DEST/$brand/$TODAY"
  mkdir -p "$dest_dir"

  log "Capturing $brand ($asin)"

  # Record tab count before GoFullPage opens its capture tab
  TAB_COUNT_BEFORE=$(osascript -e '
  tell application "Google Chrome"
    return count of tabs of first window
  end tell
  ')

  # Navigate to listing
  osascript -e "
  tell application \"Google Chrome\"
    tell active tab of first window
      set URL to \"https://www.amazon.com/dp/$asin\"
    end tell
  end tell
  "
  sleep 20

  # Trigger GoFullPage via keyboard shortcut (Option+Shift+P)
  osascript -e '
  tell application "Google Chrome"
    activate
  end tell
  tell application "System Events"
    key code 35 using {option down, shift down}
  end tell
  '

  # Wait for GoFullPage to scroll and capture (can take 15-30s for long pages)
  sleep 30

  # GoFullPage opens a new tab with the screenshot
  # Check if a new tab was created
  TAB_COUNT_AFTER=$(osascript -e '
  tell application "Google Chrome"
    return count of tabs of first window
  end tell
  ')

  if [ "$TAB_COUNT_AFTER" -le "$TAB_COUNT_BEFORE" ]; then
    log "WARNING: GoFullPage did not open capture tab for $brand"
    return 1
  fi

  # Click the PNG download button in the GoFullPage capture tab
  osascript -e '
  tell application "Google Chrome"
    tell active tab of first window
      execute javascript "
        var imgs = document.querySelectorAll(\"img[src^=\\\"blob:\\\"]\");
        if (imgs.length > 0) {
          var a = document.createElement(\"a\");
          a.href = imgs[0].src;
          a.download = \"GoFullPage-capture.png\";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      "
    end tell
  end tell
  '
  sleep 10

  # Close the GoFullPage capture tab
  osascript -e '
  tell application "Google Chrome"
    tell active tab of first window
      close
    end tell
  end tell
  '
  sleep 2

  # Find the downloaded screenshot
  LATEST_PNG=$(ls -t "$DL"/GoFullPage*.png 2>/dev/null | head -1)
  if [ -z "$LATEST_PNG" ]; then
    # Try alternate naming pattern
    LATEST_PNG=$(ls -t "$DL"/*capture*.png 2>/dev/null | head -1)
  fi

  if [ -z "$LATEST_PNG" ]; then
    log "WARNING: No GoFullPage PNG found for $brand"
    return 1
  fi

  # Split into 4 vertical parts using Python + Pillow
  python3 - "$LATEST_PNG" "$dest_dir" "$HOUR" <<'PYEOF'
import sys
from PIL import Image

src = sys.argv[1]
dest_dir = sys.argv[2]
hour = sys.argv[3]

img = Image.open(src)
w, h = img.size
part_h = h // 4

for i in range(4):
    top = i * part_h
    bottom = h if i == 3 else (i + 1) * part_h
    part = img.crop((0, top, w, bottom))
    part.save(f"{dest_dir}/{hour}00_part{i+1}.png")

img.close()
PYEOF

  if [ $? -eq 0 ]; then
    log "Saved: $brand/$TODAY/${HOUR}00_part{1..4}.png"
    rm -f "$LATEST_PNG"
  else
    log "WARNING: Failed to split image for $brand"
    return 1
  fi

  return 0
}

for i in "${!ASINS[@]}"; do
  if ! capture_listing "${ASINS[$i]}" "${BRANDS[$i]}"; then
    FAILED=$((FAILED + 1))
  fi
  sleep 5
done

log "Hourly visuals done ($FAILED failures)"
tail -200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
