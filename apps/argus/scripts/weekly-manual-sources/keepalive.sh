#!/bin/bash
# Session Keepalive — Seller Central + ScaleInsights
# Runs every 4 hours via launchd to prevent session cookie expiration.
# Finds existing tabs in Chrome and refreshes them.
# If no tab exists, creates one. Lightweight — no Claude API calls.

LOG="/tmp/sc-keepalive.log"

echo "$(date '+%Y-%m-%d %H:%M:%S') — Keepalive ping" >> "$LOG"

# Check if Chrome is running
if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Chrome not running, skipping" >> "$LOG"
  exit 0
fi

osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  if (count of windows) = 0 then return

  -- Look for an existing Seller Central tab
  set found to false
  repeat with w in windows
    repeat with i from 1 to (count of tabs of w)
      if URL of tab i of w contains "sellercentral.amazon.com" then
        set URL of tab i of w to "https://sellercentral.amazon.com/home"
        set found to true
        exit repeat
      end if
    end repeat
    if found then exit repeat
  end repeat

  if not found then
    -- Create a new tab in the last window (least disruptive)
    tell last window
      make new tab with properties {URL:"https://sellercentral.amazon.com/home"}
    end tell
  end if
end tell
APPLESCRIPT

if [ $? -eq 0 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — SC Keepalive OK" >> "$LOG"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') — SC Keepalive FAILED" >> "$LOG"
fi

sleep 5

# ScaleInsights keepalive — refresh session cookie
osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  if (count of windows) = 0 then return

  set found to false
  repeat with w in windows
    repeat with i from 1 to (count of tabs of w)
      if URL of tab i of w contains "scaleinsights.com" then
        set URL of tab i of w to "https://portal.scaleinsights.com/KeywordRanking"
        set found to true
        exit repeat
      end if
    end repeat
    if found then exit repeat
  end repeat

  if not found then
    tell last window
      make new tab with properties {URL:"https://portal.scaleinsights.com/KeywordRanking"}
    end tell
  end if
end tell
APPLESCRIPT

if [ $? -eq 0 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — SI Keepalive OK" >> "$LOG"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') — SI Keepalive FAILED" >> "$LOG"
fi

# Trim log to last 100 lines
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
