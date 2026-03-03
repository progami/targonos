#!/bin/bash
# Session Keepalive — Seller Central + ScaleInsights + Amazon Ads
# Runs every 30 minutes via launchd to prevent session cookie expiration.
# Only refreshes existing tabs in Chrome (does not open new tabs).
# Lightweight — no Claude API calls.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/sc-keepalive.log"

echo "$(date '+%Y-%m-%d %H:%M:%S') — Keepalive ping" >> "$LOG"

# Check if Chrome is running
if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Chrome not running, skipping" >> "$LOG"
  exit 0
fi

navigate_existing_tab() {
  local domain="$1"
  local target_url="$2"
  osascript - "$domain" "$target_url" <<'APPLESCRIPT'
on run argv
  set domain to item 1 of argv
  set targetUrl to item 2 of argv

  tell application "Google Chrome"
    if (count of windows) = 0 then return "missing"
    repeat with w from 1 to (count of windows)
      repeat with i from 1 to (count of tabs of window w)
        if URL of tab i of window w contains domain then
          set URL of tab i of window w to targetUrl
          return "ok"
        end if
      end repeat
    end repeat
  end tell
  return "missing"
end run
APPLESCRIPT
}

find_sc_or_signin_url() {
  osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  if (count of windows) = 0 then return ""
  repeat with w from 1 to (count of windows)
    repeat with i from 1 to (count of tabs of window w)
      set tabUrl to URL of tab i of window w
      if tabUrl contains "sellercentral.amazon.com" or tabUrl contains "signin" then
        return tabUrl
      end if
    end repeat
  end repeat
  return ""
end tell
APPLESCRIPT
}

# --- Seller Central ---
SC_NAV_RESULT="$(navigate_existing_tab "sellercentral.amazon.com" "https://sellercentral.amazon.com/home")"
if [ "$SC_NAV_RESULT" = "ok" ]; then
  sleep 10
  SC_URL="$(find_sc_or_signin_url)"
  if [[ "$SC_URL" == *"signin"* ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') — SC Keepalive EXPIRED — login required" >> "$LOG"
  else
    echo "$(date '+%Y-%m-%d %H:%M:%S') — SC Keepalive OK" >> "$LOG"
  fi
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') — SC Keepalive SKIP — no Seller Central tab found" >> "$LOG"
fi

sleep 5

# --- ScaleInsights ---
SI_NAV_RESULT="$(navigate_existing_tab "scaleinsights.com" "https://portal.scaleinsights.com/KeywordRanking")"
if [ "$SI_NAV_RESULT" = "ok" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — SI Keepalive OK" >> "$LOG"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') — SI Keepalive SKIP — no ScaleInsights tab found" >> "$LOG"
fi

sleep 5

# --- Amazon Advertising (Brand Metrics) ---
ADS_NAV_RESULT="$(navigate_existing_tab "advertising.amazon.com" "https://advertising.amazon.com/bb/bm/overview?entityId=ENTITY2JBRT701DBI1P")"
if [ "$ADS_NAV_RESULT" = "ok" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Ads Keepalive OK" >> "$LOG"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Ads Keepalive SKIP — no Ads tab found" >> "$LOG"
fi

# Trim log to last 100 lines
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
