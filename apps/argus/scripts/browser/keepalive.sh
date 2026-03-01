#!/bin/bash
# Session Keepalive — Seller Central + ScaleInsights + Amazon Ads
# Runs every 55 minutes via launchd to prevent session cookie expiration.
# Finds existing tabs in Chrome and refreshes them.
# If no tab exists, creates one. Lightweight — no Claude API calls.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/sc-keepalive.log"

echo "$(date '+%Y-%m-%d %H:%M:%S') — Keepalive ping" >> "$LOG"

# Check if Chrome is running
if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Chrome not running, skipping" >> "$LOG"
  exit 0
fi

# --- Seller Central ---
osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  if (count of windows) = 0 then return

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
    tell last window
      make new tab with properties {URL:"https://sellercentral.amazon.com/home"}
    end tell
  end if
end tell
APPLESCRIPT

if [ $? -eq 0 ]; then
  # Wait for page load, then verify session is still alive
  sleep 10
  SC_URL=$(osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  if (count of windows) = 0 then return ""
  repeat with w in windows
    repeat with i from 1 to (count of tabs of w)
      if URL of tab i of w contains "sellercentral.amazon.com" or URL of tab i of w contains "signin" then
        return URL of tab i of w
      end if
    end repeat
  end repeat
  return ""
end tell
APPLESCRIPT
  )
  if [[ "$SC_URL" == *"signin"* ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') — SC Keepalive EXPIRED — attempting relogin" >> "$LOG"
    # Activate the signin tab so relogin.sh operates on it
    osascript -e '
    tell application "Google Chrome"
      repeat with w in windows
        repeat with i from 1 to (count of tabs of w)
          if URL of tab i of w contains "signin" then
            set active tab index of w to i
            return
          end if
        end repeat
      end repeat
    end tell
    '
    if bash "$SCRIPT_DIR/relogin.sh"; then
      echo "$(date '+%Y-%m-%d %H:%M:%S') — SC Keepalive RESTORED via relogin" >> "$LOG"
      # Navigate back to SC home after relogin
      osascript -e '
      tell application "Google Chrome"
        repeat with w in windows
          repeat with i from 1 to (count of tabs of w)
            if URL of tab i of w contains "sellercentral.amazon.com" then
              set URL of tab i of w to "https://sellercentral.amazon.com/home"
              return
            end if
          end repeat
        end repeat
      end tell
      '
    else
      echo "$(date '+%Y-%m-%d %H:%M:%S') — SC Keepalive RELOGIN FAILED" >> "$LOG"
      osascript -e 'display notification "SC session expired — relogin failed" with title "Keepalive"' 2>/dev/null
    fi
  else
    echo "$(date '+%Y-%m-%d %H:%M:%S') — SC Keepalive OK" >> "$LOG"
  fi
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') — SC Keepalive FAILED" >> "$LOG"
fi

sleep 5

# --- ScaleInsights ---
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

sleep 5

# --- Amazon Advertising (Brand Metrics) ---
osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  if (count of windows) = 0 then return

  set found to false
  repeat with w in windows
    repeat with i from 1 to (count of tabs of w)
      if URL of tab i of w contains "advertising.amazon.com" then
        set URL of tab i of w to "https://advertising.amazon.com/bb/bm/overview?entityId=ENTITY2JBRT701DBI1P"
        set found to true
        exit repeat
      end if
    end repeat
    if found then exit repeat
  end repeat

  if not found then
    tell last window
      make new tab with properties {URL:"https://advertising.amazon.com/bb/bm/overview?entityId=ENTITY2JBRT701DBI1P"}
    end tell
  end if
end tell
APPLESCRIPT

if [ $? -eq 0 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Ads Keepalive OK" >> "$LOG"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Ads Keepalive FAILED" >> "$LOG"
fi

# Trim log to last 100 lines
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
