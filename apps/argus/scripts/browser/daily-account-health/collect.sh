#!/bin/bash
# Daily Account Health Collector
# Navigates Chrome to Seller Central Account Health + VoC pages,
# extracts metrics via AppleScript + JavaScript, appends to CSV.
#
# No Claude needed. Just AppleScript + screencapture.
#
# Usage: bash apps/argus/scripts/daily-account-health/collect.sh
# Cron:  3 AM CT daily via launchd

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST_AH="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Daily/Account Health Dashboard"
DEST_VOC="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Daily/Voice of the Customer"
CSV="$DEST_AH/account-health.csv"
LOG="/tmp/daily-account-health.log"
TODAY=$(date '+%Y-%m-%d')

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
log "Starting daily collection"

if ! NODE_BIN="$(command -v node)"; then
  log "ABORT: Node.js not found in PATH=$PATH"
  exit 1
fi
ALERT_EMAIL_SCRIPT="$SCRIPT_DIR/../../lib/send-alert-email.mjs"

send_alert_email() {
  local subject="$1"
  local text="$2"

  "$NODE_BIN" "$ALERT_EMAIL_SCRIPT" --subject "$subject" --text "$text" >> "$LOG" 2>&1
}

# Check Chrome is running
if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
  log "ABORT: Chrome not running"
  osascript -e 'display notification "Account Health: Chrome not running" with title "Daily Monitor"' 2>/dev/null
  LOG_TAIL="$(tail -200 "$LOG")"
  send_alert_email "Argus: Account Health failed (Chrome not running)" "$(printf "Daily account health collection aborted: Chrome not running.\nDate: %s\nHost: %s\nLog: %s\n\nLast log lines:\n%s\n" "$TODAY" "$(hostname)" "$LOG" "$LOG_TAIL")"
  exit 1
fi

# --- Find SC tab and navigate to Account Health Dashboard ---
osascript -e '
tell application "Google Chrome"
  set w to first window
  repeat with i from 1 to (count of tabs of w)
    if URL of tab i of w contains "sellercentral.amazon.com" then
      set active tab index of w to i
      set URL of tab i of w to "https://sellercentral.amazon.com/performance/dashboard"
      return
    end if
  end repeat
  tell active tab of w
    set URL to "https://sellercentral.amazon.com/performance/dashboard"
  end tell
end tell
'
sleep 20

# Check for auth redirect
PAGE_URL=$(osascript -e '
tell application "Google Chrome"
  return URL of active tab of first window
end tell
')
if [[ "$PAGE_URL" != *"sellercentral.amazon.com"* ]] || [[ "$PAGE_URL" == *"signin"* ]]; then
  log "SC session expired — attempting relogin"
  if bash "$SCRIPT_DIR/../relogin.sh"; then
    log "Relogin successful — retrying navigation"
    osascript -e '
    tell application "Google Chrome"
      set w to first window
      repeat with i from 1 to (count of tabs of w)
        if URL of tab i of w contains "sellercentral.amazon.com" then
          set active tab index of w to i
          set URL of tab i of w to "https://sellercentral.amazon.com/performance/dashboard"
          return
        end if
      end repeat
      tell active tab of w
        set URL to "https://sellercentral.amazon.com/performance/dashboard"
      end tell
    end tell
    '
    sleep 20
  else
    log "ABORT: Relogin failed"
    osascript -e 'display notification "Account Health: relogin failed" with title "Daily Monitor"' 2>/dev/null
    LOG_TAIL="$(tail -200 "$LOG")"
    send_alert_email "Argus: Account Health failed (relogin failed)" "$(printf "Daily account health collection aborted: relogin failed.\nDate: %s\nHost: %s\nLog: %s\n\nLast log lines:\n%s\n" "$TODAY" "$(hostname)" "$LOG" "$LOG_TAIL")"
    exit 1
  fi
fi

# --- Extract Dashboard Metrics ---
DASHBOARD_JSON=$(osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    return execute javascript "
      const t = document.body.innerText;
      JSON.stringify({
        health_rating: t.match(/selling policies\\.\\s*Learn more\\.\\s*(\\d+)/)?.[1] || \"\",
        policy_status: t.match(/Policy Compliance\\s+(Healthy|At Risk|Critical|Warning)/)?.[1] || \"\",
        odr: (() => { const m = t.match(/Order Defect Rate\\s+Target: under 1%\\s+[\\w/.]+\\s+([\\d.]+%)/); return m?.[1] || \"\"; })(),
        negative_feedback: t.match(/Negative feedback\\s+[\\w/.]+\\s+([\\d.]+%)/)?.[1] || \"\",
        atoz_claims: t.match(/A-to-z Guarantee claims\\s+[\\w/.]+\\s+([\\d.]+%)/)?.[1] || \"\",
        chargebacks: t.match(/Chargeback claims\\s+[\\w/.]+\\s+([\\d.]+%)/)?.[1] || \"\",
        late_shipment: t.match(/Late Shipment Rate\\s+Target: under 4%\\s+([\\w/.]+)/)?.[1] || \"\",
        prefulfill_cancel: t.match(/Pre-fulfillment Cancel Rate\\s+Target: under 2\\.5%\\s+([\\w/.]+)/)?.[1] || \"\",
        valid_tracking: t.match(/Valid Tracking Rate\\s+Target: over 95%\\s+([\\w/.]+)/)?.[1] || \"\",
        ontime_delivery: t.match(/On-Time Delivery Rate\\s+Target: over 90%\\s+([\\w/.]+)/)?.[1] || \"\",
        violations_total: t.match(/View all \\((\\d+)\\)/)?.[1] || \"0\",
        total_orders_60d: t.match(/(\\d[\\d,]*) of ([\\d,]+) orders/)?.[0] || \"\"
      });
    "
  end tell
end tell
' 2>/dev/null)

log "Dashboard extracted"

# --- Navigate to VoC ---
osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    set URL to "https://sellercentral.amazon.com/voice-of-the-customer/ref=xx_voc_dnav_xx"
  end tell
end tell
'
sleep 20

# --- Extract VoC Metrics ---
VOC_JSON=$(osascript -e '
tell application "Google Chrome"
  tell active tab of first window
    return execute javascript "
      const t = document.body.innerText;
      const cx = t.match(/CX Health breakdown of your listings\\s+How is CX Health calculated\\?\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)/);
      const listings = [];
      const blocks = t.split(/(?=Caelum Star)/g).filter(b => b.startsWith(\"Caelum Star\"));
      blocks.forEach(b => {
        const asin = b.match(/\\n(B[A-Z0-9]+)\\n/)?.[1];
        const m = b.match(/([\\d.]+%)\\s+(\\d+)\\s+(\\d+)/);
        if (asin && m) listings.push({ asin: asin, ncx_rate: m[1], ncx_orders: m[2], total_orders: m[3] });
      });
      JSON.stringify({
        cx_very_poor: cx?.[1] || \"0\",
        cx_poor: cx?.[2] || \"0\",
        cx_fair: cx?.[3] || \"0\",
        cx_good: cx?.[4] || \"0\",
        cx_excellent: cx?.[5] || \"0\",
        listings: listings
      });
    "
  end tell
end tell
' 2>/dev/null)

log "VoC extracted"

# --- Write CSV ---

# Create header if file doesn't exist
if [ ! -f "$CSV" ]; then
  echo "date,health_rating,policy_status,order_defect_rate,negative_feedback,atoz_claims,chargebacks,late_shipment_rate,prefulfill_cancel_rate,valid_tracking_rate,ontime_delivery_rate,violations_total,total_orders_60d,cx_excellent,cx_good,cx_fair,cx_poor,cx_very_poor" > "$CSV"
fi

# Parse JSON and write row
ROW=$(python3 -c "
import json, sys
d = json.loads('''$DASHBOARD_JSON''')
v = json.loads('''$VOC_JSON''')
print(','.join([
  '$TODAY',
  d['health_rating'],
  d['policy_status'],
  d['odr'],
  d['negative_feedback'],
  d['atoz_claims'],
  d['chargebacks'],
  d['late_shipment'],
  d['prefulfill_cancel'],
  d['valid_tracking'],
  d['ontime_delivery'],
  d['violations_total'],
  '\"' + d['total_orders_60d'] + '\"',
  v['cx_excellent'],
  v['cx_good'],
  v['cx_fair'],
  v['cx_poor'],
  v['cx_very_poor']
]))
")

echo "$ROW" >> "$CSV"

# --- Write per-ASIN VoC CSV ---
VOC_CSV="$DEST_VOC/voc-by-asin.csv"
if [ ! -f "$VOC_CSV" ]; then
  echo "date,asin,ncx_rate,ncx_orders,total_orders" > "$VOC_CSV"
fi

python3 -c "
import json
v = json.loads('''$VOC_JSON''')
for l in v['listings']:
  print(f\"$TODAY,{l['asin']},{l['ncx_rate']},{l['ncx_orders']},{l['total_orders']}\")
" >> "$VOC_CSV"

log "CSVs written"
log "Done"

# Trim log
tail -200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
