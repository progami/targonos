#!/bin/bash
# Weekly Category Insights Text Extraction
# Navigates to Category Insights for Painting Drop Cloths Plastic Sheeting,
# extracts data via JS, saves as structured text.
# Runs Monday 3 AM CT via launchd.

set -euo pipefail

DEST="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/04 Sales/Monitoring/Weekly/Category Insights"
LOG="/tmp/weekly-category-insights.log"

EPOCH_START=$(date -j -f '%Y-%m-%d' '2025-12-28' '+%s')
LAST_SAT=$(date -v-sat '+%Y-%m-%d')
EPOCH_SAT=$(date -j -f '%Y-%m-%d' "$LAST_SAT" '+%s')
WEEKS=$(( (EPOCH_SAT - EPOCH_START) / 604800 + 1 ))
WEEK_NUM=$(printf "W%02d" $WEEKS)
PREFIX="${WEEK_NUM}_${LAST_SAT}"
TODAY=$(date '+%Y-%m-%d')

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
log "Starting weekly Category Insights: $PREFIX"

if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
  log "ABORT: Chrome not running"; exit 1
fi

# Navigate to Category Insights
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    set URL to "https://sellercentral.amazon.com/selection/category-insights"
  end tell
end tell
'
sleep 20

# Use search box to navigate to the right category
# Type into search input, wait for dropdown, click the suggestion
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    execute javascript "
      var input = document.querySelector(\"input[placeholder*=\\\"Search categories\\\"]\");
      input.focus();
      input.value = \"Painting Drop Cloths\";
      input.dispatchEvent(new Event(\"input\", {bubbles: true}));
    "
  end tell
end tell
'
sleep 5

# Click the dropdown suggestion
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    execute javascript "
      var all = document.querySelectorAll(\"div.list-item\");
      for (var i = 0; i < all.length; i++) {
        if (all[i].textContent.indexOf(\"Painting Drop\") !== -1) {
          all[i].click();
          break;
        }
      }
    "
  end tell
end tell
'
sleep 20

# Extract the page data
TEXT=$(osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    return execute javascript "document.body.innerText"
  end tell
end tell
' 2>/dev/null)

# Write structured text file
cat > "$DEST/${PREFIX}_CategoryInsights.txt" << TXTEOF
Category Insights — Painting Drop Cloths Plastic Sheeting
Category: Tools & Home Improvement > Building Material > Painting Drop Cloths Plastic Sheeting
Store: United States
Captured: $TODAY

$TEXT
TXTEOF

log "Saved: ${PREFIX}_CategoryInsights.txt"
log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
