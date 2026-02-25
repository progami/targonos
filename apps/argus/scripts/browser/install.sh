#!/bin/bash
# Install launchd plists for browser-automated Argus collectors:
#   1. Session keepalive — SC + ScaleInsights + Ads (every 55 min)
#   2. Weekly browser sources collection (Monday 3 AM CT)
#   3. Daily Account Health collector (3 AM CT daily)
#   4. Hourly Visuals screenshot collector (every hour)
#
# Usage: bash apps/argus/scripts/browser/install.sh
# To uninstall: bash apps/argus/scripts/browser/install.sh --uninstall

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
mkdir -p "$LAUNCH_AGENTS_DIR"

KEEPALIVE_PLIST="$LAUNCH_AGENTS_DIR/com.targon.sc-keepalive.plist"
WEEKLY_PLIST="$LAUNCH_AGENTS_DIR/com.targon.weekly-browser-sources.plist"
DAILY_AH_PLIST="$LAUNCH_AGENTS_DIR/com.targon.daily-account-health.plist"
HOURLY_VISUALS_PLIST="$LAUNCH_AGENTS_DIR/com.targon.hourly-visuals.plist"

# Make all scripts executable
chmod +x "$SCRIPT_DIR/keepalive.sh"
chmod +x "$SCRIPT_DIR/run-weekly.sh"
chmod +x "$SCRIPT_DIR/daily-account-health/collect.sh"
chmod +x "$SCRIPT_DIR/weekly-category-insights/collect.sh"
chmod +x "$SCRIPT_DIR/weekly-poe/collect.sh"
chmod +x "$SCRIPT_DIR/weekly-scaleinsights/collect.sh"
chmod +x "$SCRIPT_DIR/weekly-brand-metrics/collect.sh"
chmod +x "$SCRIPT_DIR/hourly-visuals/collect.sh"

if [ "${1:-}" = "--uninstall" ]; then
  echo "Uninstalling browser launchd agents..."
  launchctl unload "$KEEPALIVE_PLIST" 2>/dev/null || true
  launchctl unload "$WEEKLY_PLIST" 2>/dev/null || true
  launchctl unload "$DAILY_AH_PLIST" 2>/dev/null || true
  launchctl unload "$HOURLY_VISUALS_PLIST" 2>/dev/null || true
  rm -f "$KEEPALIVE_PLIST" "$WEEKLY_PLIST" "$DAILY_AH_PLIST" "$HOURLY_VISUALS_PLIST"
  echo "Done. All browser agents removed."
  exit 0
fi

echo "Installing browser launchd agents..."

# 1. Keepalive — every 55 minutes (SC + ScaleInsights + Ads)
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
  <integer>3300</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/sc-keepalive-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/sc-keepalive-stderr.log</string>
</dict>
</plist>
PLIST

# 2. Weekly browser sources — Monday 3:00 AM CT
cat > "$WEEKLY_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.targon.weekly-browser-sources</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_DIR}/run-weekly.sh</string>
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
  <string>/tmp/weekly-browser-sources-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/weekly-browser-sources-stderr.log</string>
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

# 4. Hourly Visuals — every hour
cat > "$HOURLY_VISUALS_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.targon.hourly-visuals</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_DIR}/hourly-visuals/collect.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/hourly-visuals-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/hourly-visuals-stderr.log</string>
</dict>
</plist>
PLIST

# Load the agents
launchctl unload "$KEEPALIVE_PLIST" 2>/dev/null || true
launchctl unload "$WEEKLY_PLIST" 2>/dev/null || true
launchctl unload "$DAILY_AH_PLIST" 2>/dev/null || true
launchctl unload "$HOURLY_VISUALS_PLIST" 2>/dev/null || true
# Unload old agents that may still be registered
launchctl unload "$HOME/Library/LaunchAgents/com.targon.weekly-manual-sources.plist" 2>/dev/null || true
launchctl unload "$HOME/Library/LaunchAgents/com.targon.hourly-listing-attributes-api.plist" 2>/dev/null || true
launchctl unload "$HOME/Library/LaunchAgents/com.targon.weekly-api-sources.plist" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.targon.weekly-manual-sources.plist"
rm -f "$HOME/Library/LaunchAgents/com.targon.hourly-listing-attributes-api.plist"
rm -f "$HOME/Library/LaunchAgents/com.targon.weekly-api-sources.plist"

launchctl load "$KEEPALIVE_PLIST"
launchctl load "$WEEKLY_PLIST"
launchctl load "$DAILY_AH_PLIST"
launchctl load "$HOURLY_VISUALS_PLIST"

echo ""
echo "Installed and loaded:"
echo "  Keepalive:         $KEEPALIVE_PLIST (every 55 min)"
echo "  Weekly browser:    $WEEKLY_PLIST (Monday 3:00 AM CT)"
echo "  Daily Acct Health: $DAILY_AH_PLIST (daily 3:00 AM CT)"
echo "  Hourly Visuals:    $HOURLY_VISUALS_PLIST (every 1 hour)"
echo ""
echo "Weekly master runner calls:"
echo "  1. weekly-category-insights (text extraction)"
echo "  2. weekly-poe (CSV download)"
echo "  3. weekly-scaleinsights (XLSX export)"
echo "  4. weekly-brand-metrics (CSV download)"
echo ""
echo "To check status:"
echo "  launchctl list | grep targon"
echo ""
echo "To uninstall:"
echo "  bash $SCRIPT_DIR/install.sh --uninstall"
echo ""
echo "Logs:"
echo "  Keepalive:       /tmp/sc-keepalive.log"
echo "  Weekly:          /tmp/weekly-browser-sources.log"
echo "  Daily AH:        /tmp/daily-account-health.log"
echo "  Hourly Visuals:  /tmp/hourly-visuals.log"
