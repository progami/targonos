#!/bin/bash
# Install launchd plists for API-based Argus collectors:
#   1. Tracking fetch — every hour
#   2. Hourly Listing Attributes (SP-API) — every hour
#   3. Daily Account Health (SP-API) — daily 3 AM CT
#   4. Weekly API sources (Monday 4 AM CT)
#
# Usage: bash apps/argus/scripts/api/install.sh
# To uninstall: bash apps/argus/scripts/api/install.sh --uninstall

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARGUS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TRACKING_FETCH_TSX="$ARGUS_DIR/node_modules/.bin/tsx"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LAUNCHD_DOMAIN="gui/$(id -u)"
mkdir -p "$LAUNCH_AGENTS_DIR"

TRACKING_FETCH_PLIST="$LAUNCH_AGENTS_DIR/com.targon.argus.tracking-fetch.plist"
HOURLY_LISTINGS_API_PLIST="$LAUNCH_AGENTS_DIR/com.targon.hourly-listing-attributes-api.plist"
DAILY_ACCOUNT_HEALTH_PLIST="$LAUNCH_AGENTS_DIR/com.targon.daily-account-health.plist"
WEEKLY_API_PLIST="$LAUNCH_AGENTS_DIR/com.targon.weekly-api-sources.plist"

hourly_start_calendar_interval() {
  echo "  <key>StartCalendarInterval</key>"
  echo "  <array>"
  for hour in $(seq 0 23); do
    cat <<PLIST
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
PLIST
  done
  echo "  </array>"
}

# Make scripts executable
chmod +x "$SCRIPT_DIR/hourly-listing-attributes/collect.sh"
chmod +x "$SCRIPT_DIR/daily-account-health/collect.sh"
chmod +x "$SCRIPT_DIR/weekly-sources/run.sh"
chmod +x "$SCRIPT_DIR/weekly-sources/filter-tst.py"
chmod +x "$SCRIPT_DIR/weekly-sources/collect-sp-ads.py"

if [ "${1:-}" = "--uninstall" ]; then
  echo "Uninstalling API launchd agents..."
  launchctl bootout "$LAUNCHD_DOMAIN" "$TRACKING_FETCH_PLIST" 2>/dev/null || true
  launchctl bootout "$LAUNCHD_DOMAIN" "$HOURLY_LISTINGS_API_PLIST" 2>/dev/null || true
  launchctl bootout "$LAUNCHD_DOMAIN" "$DAILY_ACCOUNT_HEALTH_PLIST" 2>/dev/null || true
  launchctl bootout "$LAUNCHD_DOMAIN" "$WEEKLY_API_PLIST" 2>/dev/null || true
  rm -f "$TRACKING_FETCH_PLIST" "$HOURLY_LISTINGS_API_PLIST" "$DAILY_ACCOUNT_HEALTH_PLIST" "$WEEKLY_API_PLIST"
  echo "Done. All API agents removed."
  exit 0
fi

echo "Installing API launchd agents..."

# 1. Tracking fetch — every hour
cat > "$TRACKING_FETCH_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NEXT_PUBLIC_APP_URL</key>
    <string>https://os.targonglobal.com/argus</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>Label</key>
  <string>com.targon.argus.tracking-fetch</string>
  <key>ProgramArguments</key>
  <array>
    <string>${TRACKING_FETCH_TSX}</string>
    <string>scripts/tracking-fetch.ts</string>
  </array>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>StandardOutPath</key>
  <string>/tmp/argus-tracking-fetch.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/argus-tracking-fetch.err</string>
  <key>WorkingDirectory</key>
  <string>${ARGUS_DIR}</string>
</dict>
</plist>
PLIST

# 2. Hourly Listing Attributes (API) — top of every hour
{
cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.targon.hourly-listing-attributes-api</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_DIR}/hourly-listing-attributes/collect.sh</string>
  </array>
PLIST
hourly_start_calendar_interval
cat <<PLIST
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/hourly-listing-attributes-api-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/hourly-listing-attributes-api-stderr.log</string>
</dict>
</plist>
PLIST
} > "$HOURLY_LISTINGS_API_PLIST"

# 3. Daily Account Health — 3:00 AM CT daily
cat > "$DAILY_ACCOUNT_HEALTH_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.targon.daily-account-health</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_DIR}/daily-account-health/collect.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/daily-account-health-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/daily-account-health-stderr.log</string>
</dict>
</plist>
PLIST

# 4. Weekly API sources — Monday 4:00 AM CT
cat > "$WEEKLY_API_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.targon.weekly-api-sources</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_DIR}/weekly-sources/run.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>1</integer>
    <key>Hour</key>
    <integer>4</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/weekly-api-sources-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/weekly-api-sources-stderr.log</string>
</dict>
</plist>
PLIST

# Load the agents
launchctl bootout "$LAUNCHD_DOMAIN" "$TRACKING_FETCH_PLIST" 2>/dev/null || true
launchctl bootout "$LAUNCHD_DOMAIN" "$HOURLY_LISTINGS_API_PLIST" 2>/dev/null || true
launchctl bootout "$LAUNCHD_DOMAIN" "$DAILY_ACCOUNT_HEALTH_PLIST" 2>/dev/null || true
launchctl bootout "$LAUNCHD_DOMAIN" "$WEEKLY_API_PLIST" 2>/dev/null || true
launchctl bootstrap "$LAUNCHD_DOMAIN" "$TRACKING_FETCH_PLIST"
launchctl bootstrap "$LAUNCHD_DOMAIN" "$HOURLY_LISTINGS_API_PLIST"
launchctl bootstrap "$LAUNCHD_DOMAIN" "$DAILY_ACCOUNT_HEALTH_PLIST"
launchctl bootstrap "$LAUNCHD_DOMAIN" "$WEEKLY_API_PLIST"

echo ""
echo "Installed and loaded:"
echo "  Tracking fetch:      $TRACKING_FETCH_PLIST (every hour)"
echo "  Hourly Listings API: $HOURLY_LISTINGS_API_PLIST (top of every hour)"
echo "  Daily Acct Health:   $DAILY_ACCOUNT_HEALTH_PLIST (daily 3:00 AM CT)"
echo "  Weekly API Sources:  $WEEKLY_API_PLIST (Monday 4:00 AM CT)"
echo ""
echo "To check status:"
echo "  launchctl list | grep targon"
echo ""
echo "To uninstall:"
echo "  bash $SCRIPT_DIR/install.sh --uninstall"
echo ""
echo "Logs:"
echo "  Tracking fetch:      /tmp/argus-tracking-fetch.log"
echo "  Hourly Listings API: /tmp/hourly-listing-attributes-api.log"
echo "  Daily Acct Health:   /tmp/daily-account-health.log"
echo "  Weekly API Sources:  /tmp/weekly-api-sources.log"
