#!/bin/bash
# Seller Central Relogin — Amazon SSO + OTP via Google Voice
# Called by collector scripts when signin redirect detected.
#
# Flow:
#   1. Fill email → click Continue
#   2. Fill password → click Sign In
#   3. If OTP page → fetch code from Google Voice → submit
#   4. Verify session restored
#
# Exit 0 = success (session restored), Exit 1 = failure
#
# Usage: bash relogin.sh

set -euo pipefail

LOG="/tmp/sc-relogin.log"
SC_EMAIL="jarrar@targonglobal.com"
SC_PASS='abc123efg$$$ABC'

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
log "=== Relogin starting ==="

# ── Step 1: Fill email ──────────────────────────────────────────────

log "Filling email"
osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  tell active tab of first window
    execute javascript "
      var e = document.getElementById('ap_email');
      if (e) { e.value = ''; e.focus(); }
    "
  end tell
end tell
APPLESCRIPT

# Use AppleScript typing for reliable input (handles special chars, autofill race conditions)
osascript -e "
tell application \"Google Chrome\" to activate
delay 0.5
tell application \"System Events\"
  keystroke \"$SC_EMAIL\"
end tell
"
sleep 2

# Click Continue
osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  tell active tab of first window
    execute javascript "
      var btn = document.getElementById('continue');
      if (btn) btn.click();
    "
  end tell
end tell
APPLESCRIPT

log "Email submitted, waiting for password page"
sleep 5

# ── Step 2: Fill password ───────────────────────────────────────────

# Check we're on the password page
PW_PAGE=$(osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  tell active tab of first window
    return execute javascript "
      document.getElementById('ap_password') ? 'yes' : 'no';
    "
  end tell
end tell
APPLESCRIPT
)

if [ "$PW_PAGE" != "yes" ]; then
  log "FAILED: Password field not found after email step"
  osascript -e 'display notification "Relogin: password page not found" with title "Relogin"' 2>/dev/null
  exit 1
fi

log "Filling password"
osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  tell active tab of first window
    execute javascript "
      var p = document.getElementById('ap_password');
      if (p) { p.value = ''; p.focus(); }
    "
  end tell
end tell
APPLESCRIPT

osascript -e "
tell application \"Google Chrome\" to activate
delay 0.5
tell application \"System Events\"
  keystroke \"$SC_PASS\"
end tell
"
sleep 2

# Click Sign In
osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  tell active tab of first window
    execute javascript "
      var btn = document.getElementById('signInSubmit');
      if (btn) btn.click();
    "
  end tell
end tell
APPLESCRIPT

log "Password submitted, waiting for response"
sleep 10

# ── Step 3: Check if OTP is needed ─────────────────────────────────

OTP_PAGE=$(osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  tell active tab of first window
    return execute javascript "
      document.getElementById('auth-mfa-otpcode') ? 'otp'
      : (window.location.href.indexOf('signin') === -1 ? 'done' : 'unknown');
    "
  end tell
end tell
APPLESCRIPT
)

if [ "$OTP_PAGE" = "done" ]; then
  log "Login successful — no OTP required"
  osascript -e 'display notification "Relogin: session restored (no OTP)" with title "Relogin"' 2>/dev/null
  exit 0
fi

if [ "$OTP_PAGE" != "otp" ]; then
  log "FAILED: unexpected state after password — $OTP_PAGE"
  osascript -e 'display notification "Relogin: unexpected state after password" with title "Relogin"' 2>/dev/null
  exit 1
fi

log "OTP required — fetching from Google Voice"

# ── Step 4: Get OTP from Google Voice ───────────────────────────────

# Find or create a Google Voice tab
GV_TAB=$(osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  set w to first window
  repeat with i from 1 to (count of tabs of w)
    if URL of tab i of w contains "voice.google.com" then
      return i
    end if
  end repeat
  return 0
end tell
APPLESCRIPT
)

if [ "$GV_TAB" = "0" ]; then
  log "Creating Google Voice tab"
  osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  tell first window
    make new tab with properties {URL:"https://voice.google.com/u/0/messages"}
  end tell
end tell
APPLESCRIPT
else
  log "Refreshing existing Google Voice tab"
  osascript -e "
tell application \"Google Chrome\"
  set URL of tab $GV_TAB of first window to \"https://voice.google.com/u/0/messages\"
  set active tab index of first window to $GV_TAB
end tell
"
fi

# Wait for OTP to arrive and page to load
log "Waiting 20s for OTP to arrive"
sleep 20

# Extract OTP from the first message preview
OTP=""
for attempt in 1 2 3; do
  OTP=$(osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  tell active tab of first window
    return execute javascript "
      var el = document.querySelector('gv-annotation.preview');
      if (!el) { '' }
      else {
        var m = el.innerText.match(/(\\d{6}) is your Amazon OTP/);
        m ? m[1] : '';
      }
    "
  end tell
end tell
APPLESCRIPT
  )

  if [ -n "$OTP" ] && [ "$OTP" != "" ]; then
    break
  fi

  log "OTP not found (attempt $attempt/3), refreshing and waiting 15s"
  osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  tell active tab of first window
    set URL to "https://voice.google.com/u/0/messages"
  end tell
end tell
APPLESCRIPT
  sleep 15
done

if [ -z "$OTP" ] || [ "$OTP" = "" ]; then
  log "FAILED: Could not extract OTP from Google Voice after 3 attempts"
  osascript -e 'display notification "Relogin: OTP extraction failed" with title "Relogin"' 2>/dev/null
  exit 1
fi

log "Got OTP: $OTP"

# ── Step 5: Switch back to SC tab and fill OTP ─────────────────────

# Find the SC signin tab
osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  set w to first window
  repeat with i from 1 to (count of tabs of w)
    if URL of tab i of w contains "sellercentral" or URL of tab i of w contains "amazon.com/ap/" then
      set active tab index of w to i
      exit repeat
    end if
  end repeat
end tell
APPLESCRIPT
sleep 2

# Fill OTP
osascript -e "
tell application \"Google Chrome\"
  tell active tab of first window
    execute javascript \"
      var otp = document.getElementById('auth-mfa-otpcode');
      if (otp) { otp.value = ''; otp.focus(); }
    \"
  end tell
end tell
"

osascript -e "
tell application \"Google Chrome\" to activate
delay 0.5
tell application \"System Events\"
  keystroke \"$OTP\"
end tell
"
sleep 2

# Click verify
osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  tell active tab of first window
    execute javascript "
      var btn = document.getElementById('auth-signin-button');
      if (btn) btn.click();
    "
  end tell
end tell
APPLESCRIPT

log "OTP submitted, verifying login"
sleep 10

# ── Step 6: Verify session restored ────────────────────────────────

FINAL_URL=$(osascript <<'APPLESCRIPT'
tell application "Google Chrome"
  tell active tab of first window
    return URL
  end tell
end tell
APPLESCRIPT
)

if [[ "$FINAL_URL" == *"signin"* ]]; then
  log "FAILED: Still on signin page after OTP — $FINAL_URL"
  osascript -e 'display notification "Relogin: still on signin after OTP" with title "Relogin"' 2>/dev/null
  exit 1
fi

log "=== Relogin successful ==="
osascript -e 'display notification "Relogin: SC session restored" with title "Relogin"' 2>/dev/null

# Trim log
tail -200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit 0
