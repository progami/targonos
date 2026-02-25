#!/bin/bash
# Install launchd plists for:
#   1. Seller Central session keepalive (every 4 hours)
#   2. Weekly manual sources collection (Monday 3 AM CT)
#   3. Daily Account Health collector (3 AM CT daily)
#   4. Hourly Listing Attributes (API) collector (every hour)
#   5. Weekly API sources collection (Monday 4 AM CT)
#
# Usage: bash apps/argus/scripts/weekly-manual-sources/install.sh
# To uninstall: bash apps/argus/scripts/weekly-manual-sources/install.sh --uninstall

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
mkdir -p "$LAUNCH_AGENTS_DIR"

KEEPALIVE_PLIST="$LAUNCH_AGENTS_DIR/com.targon.sc-keepalive.plist"
WEEKLY_PLIST="$LAUNCH_AGENTS_DIR/com.targon.weekly-manual-sources.plist"
DAILY_AH_PLIST="$LAUNCH_AGENTS_DIR/com.targon.daily-account-health.plist"
HOURLY_LISTINGS_API_PLIST="$LAUNCH_AGENTS_DIR/com.targon.hourly-listing-attributes-api.plist"
WEEKLY_API_PLIST="$LAUNCH_AGENTS_DIR/com.targon.weekly-api-sources.plist"

# Make all scripts executable
chmod +x "$SCRIPT_DIR/keepalive.sh"
chmod +x "$SCRIPT_DIR/run.sh"
chmod +x "$PARENT_DIR/daily-account-health/collect.sh"
chmod +x "$PARENT_DIR/hourly-listing-attributes-api/collect.sh"
chmod +x "$PARENT_DIR/weekly-api-sources/run.sh"
chmod +x "$PARENT_DIR/weekly-api-sources/filter-tst.py"
chmod +x "$PARENT_DIR/weekly-api-sources/collect-sp-ads.py"
chmod +x "$PARENT_DIR/weekly-category-insights/collect.sh"
chmod +x "$PARENT_DIR/weekly-poe/collect.sh"
chmod +x "$PARENT_DIR/weekly-scaleinsights/collect.sh"

if [ "${1:-}" = "--uninstall" ]; then
  echo "Uninstalling launchd agents..."
  launchctl unload "$KEEPALIVE_PLIST" 2>/dev/null || true
  launchctl unload "$WEEKLY_PLIST" 2>/dev/null || true
  launchctl unload "$DAILY_AH_PLIST" 2>/dev/null || true
  launchctl unload "$HOURLY_LISTINGS_API_PLIST" 2>/dev/null || true
  launchctl unload "$WEEKLY_API_PLIST" 2>/dev/null || true
  rm -f "$KEEPALIVE_PLIST" "$WEEKLY_PLIST" "$DAILY_AH_PLIST" "$HOURLY_LISTINGS_API_PLIST" "$WEEKLY_API_PLIST"
  echo "Done. All agents removed."
  exit 0
fi

echo "Installing launchd agents..."

# 1. Keepalive — every 4 hours
cat > "$KEEPALIVE_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.targon.sc-keepalive</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_DIR}/keepalive.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>14400</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/sc-keepalive-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/sc-keepalive-stderr.log</string>
</dict>
</plist>
PLIST

# 2. Weekly manual sources — Monday 3:00 AM CT
#    Master runner calls all 5 weekly scripts in sequence.
cat > "$WEEKLY_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.targon.weekly-manual-sources</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_DIR}/run.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>1</integer>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/weekly-manual-sources-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/weekly-manual-sources-stderr.log</string>
</dict>
</plist>
PLIST

# 3. Daily Account Health — 3:00 AM CT daily
cat > "$DAILY_AH_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.targon.daily-account-health</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${PARENT_DIR}/daily-account-health/collect.sh</string>
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

# 4. Hourly Listing Attributes (API) — every hour
cat > "$HOURLY_LISTINGS_API_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.targon.hourly-listing-attributes-api</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${PARENT_DIR}/hourly-listing-attributes-api/collect.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/hourly-listing-attributes-api-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/hourly-listing-attributes-api-stderr.log</string>
</dict>
</plist>
PLIST

# 5. Weekly API sources — Monday 4:00 AM CT
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
    <string>${PARENT_DIR}/weekly-api-sources/run.sh</string>
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
launchctl unload "$KEEPALIVE_PLIST" 2>/dev/null || true
launchctl unload "$WEEKLY_PLIST" 2>/dev/null || true
launchctl unload "$DAILY_AH_PLIST" 2>/dev/null || true
launchctl unload "$HOURLY_LISTINGS_API_PLIST" 2>/dev/null || true
launchctl unload "$WEEKLY_API_PLIST" 2>/dev/null || true
launchctl load "$KEEPALIVE_PLIST"
launchctl load "$WEEKLY_PLIST"
launchctl load "$DAILY_AH_PLIST"
launchctl load "$HOURLY_LISTINGS_API_PLIST"
launchctl load "$WEEKLY_API_PLIST"

echo ""
echo "Installed and loaded:"
echo "  Keepalive:        $KEEPALIVE_PLIST (every 4 hours)"
echo "  Weekly run:       $WEEKLY_PLIST (Monday 3:00 AM CT)"
echo "  Daily Acct Health: $DAILY_AH_PLIST (daily 3:00 AM CT)"
echo "  Hourly Listings API: $HOURLY_LISTINGS_API_PLIST (every 1 hour)"
echo "  Weekly API Sources: $WEEKLY_API_PLIST (Monday 4:00 AM CT)"
echo ""
echo "Weekly master runner calls:"
echo "  1. weekly-category-insights (text extraction)"
echo "  2. weekly-poe (CSV download)"
echo "  3. weekly-scaleinsights (XLSX export)"
echo ""
echo "To check status:"
echo "  launchctl list | grep targon"
echo ""
echo "To uninstall:"
echo "  bash $SCRIPT_DIR/install.sh --uninstall"
echo ""
echo "Logs:"
echo "  Keepalive:    /tmp/sc-keepalive.log"
echo "  Weekly:       /tmp/weekly-manual-sources.log"
echo "  Daily AH:     /tmp/daily-account-health.log"
echo "  Hourly Listings API: /tmp/hourly-listing-attributes-api.log"
echo "  Weekly API Sources: /tmp/weekly-api-sources.log"
