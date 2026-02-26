#!/bin/bash
# Daily Visuals — Full-page Amazon Listing Screenshots
# Uses GoFullPage Chrome extension to capture full-page listing screenshots,
# splits into 4 vertical parts, saves to Google Drive organized by brand and date.
#
# Competitors:
#   Caelum Star  — B09HXC3NL8
#   Axgatoxe     — B0DQDWV1SV
#   Ecotez       — B0CWS3848Y
#
# Runs daily at 3:30 AM CT via launchd.

set -euo pipefail

DEST="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/04 Sales/Monitoring/Daily/Visuals"
DL="$HOME/Downloads"
LOG="/tmp/daily-visuals.log"
TODAY=$(date '+%Y-%m-%d')

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
log "Starting daily visuals capture: $TODAY"

if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
  log "ABORT: Chrome not running"; exit 1
fi

# ASINs and their brand folder names
declare -a ASINS=("B09HXC3NL8" "B0DQDWV1SV" "B0CWS3848Y")
declare -a BRANDS=("Caelum Star" "Axgatoxe" "Ecotez")

FAILED=0

# Create a temporary tab for captures (don't hijack existing tabs)
osascript -e '
tell application "Google Chrome"
  tell first window
    make new tab with properties {URL:"about:blank"}
  end tell
end tell
'
sleep 2

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
  # Retry once if the shortcut doesn't trigger (timing issues with activate).
  for attempt in 1 2; do
    osascript -e '
    tell application "Google Chrome"
      activate
    end tell
    delay 1
    tell application "System Events"
      key code 35 using {option down, shift down}
    end tell
    '

    # Wait for GoFullPage to scroll and capture (can take 15-30s for long pages)
    sleep 35

    TAB_COUNT_AFTER=$(osascript -e '
    tell application "Google Chrome"
      return count of tabs of first window
    end tell
    ')

    if [ "$TAB_COUNT_AFTER" -gt "$TAB_COUNT_BEFORE" ]; then
      break
    fi

    log "GoFullPage attempt $attempt did not create capture tab for $brand"
  done

  if [ "$TAB_COUNT_AFTER" -le "$TAB_COUNT_BEFORE" ]; then
    log "WARNING: GoFullPage failed after 2 attempts for $brand"
    return 1
  fi

  # Download the screenshot via canvas-to-blob (filesystem: URLs can't be
  # downloaded via a.btn-download click — the click returns but no file saves).
  # Instead: draw the extension's <img> onto a canvas, convert to blob, and
  # trigger a real download via blob URL.
  cat > /tmp/gfp-download.js << 'JSEOF'
var img = document.querySelectorAll("img")[2];
if (!img || !img.complete) {
  "image not loaded";
} else {
  var canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  var ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  canvas.toBlob(function(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "ASIN_PLACEHOLDER.png";
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }, "image/png");
  "started: " + img.naturalWidth + "x" + img.naturalHeight;
}
JSEOF
  sed -i '' "s/ASIN_PLACEHOLDER/$asin/" /tmp/gfp-download.js
  JS_CODE=$(sed 's/\\/\\\\/g; s/"/\\"/g' /tmp/gfp-download.js | tr '\n' ' ')

  osascript -e "
  tell application \"Google Chrome\"
    set tabCount to count of tabs of first window
    tell tab tabCount of first window
      return execute javascript \"$JS_CODE\"
    end tell
  end tell
  "
  sleep 10

  # Close the GoFullPage capture tab
  osascript -e '
  tell application "Google Chrome"
    set tabCount to count of tabs of first window
    tell tab tabCount of first window
      close
    end tell
  end tell
  '
  sleep 2

  # Find the downloaded screenshot
  LATEST_PNG=$(ls -t "$DL"/${asin}.png 2>/dev/null | head -1)

  if [ -z "$LATEST_PNG" ]; then
    log "WARNING: No GoFullPage PNG found for $brand"
    return 1
  fi

  # Copy to /tmp to avoid macOS sandbox restrictions on ~/Downloads
  TMP_PNG="/tmp/${asin}.png"
  cp "$LATEST_PNG" "$TMP_PNG"

  # Split into 4 vertical parts using Python + Pillow
  python3 - "$TMP_PNG" "$dest_dir" <<'PYEOF'
import sys
from PIL import Image

src = sys.argv[1]
dest_dir = sys.argv[2]

img = Image.open(src)
w, h = img.size
part_h = h // 4

for i in range(4):
    top = i * part_h
    bottom = h if i == 3 else (i + 1) * part_h
    part = img.crop((0, top, w, bottom))
    part.save(f"{dest_dir}/part{i+1}.png")

img.close()
PYEOF

  if [ $? -eq 0 ]; then
    log "Saved: $brand/$TODAY/part{1..4}.png"
    rm -f "$LATEST_PNG" "$TMP_PNG"
  else
    log "WARNING: Failed to split image for $brand"
    rm -f "$TMP_PNG"
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

# Close the temporary tab
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    close
  end tell
end tell
' 2>/dev/null

log "Daily visuals done ($FAILED failures)"
tail -200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
