#!/bin/bash
# Install launchd plists for browser-automated Argus collectors:
#   1. Weekly browser sources collection (Chrome) (Monday 3 AM CT)
#   2. Daily Visuals screenshot collector (3:30 AM CT daily)
#
# Usage: bash apps/argus/scripts/browser/install.sh
# To uninstall: bash apps/argus/scripts/browser/install.sh --uninstall

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LAUNCHD_DOMAIN="gui/$(id -u)"
mkdir -p "$LAUNCH_AGENTS_DIR"

WEEKLY_PLIST="$LAUNCH_AGENTS_DIR/com.targon.weekly-browser-sources.plist"
DAILY_VISUALS_PLIST="$LAUNCH_AGENTS_DIR/com.targon.daily-visuals.plist"
LEGACY_DAILY_AH_PLIST="$LAUNCH_AGENTS_DIR/com.targon.daily-account-health.plist"
BROWSER_DAILY_AH_SCRIPT="$SCRIPT_DIR/daily-account-health/collect.sh"

cleanup_legacy_daily_account_health_agent() {
  if [ ! -f "$LEGACY_DAILY_AH_PLIST" ]; then
    return
  fi

  PROGRAM_PATH=$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:1' "$LEGACY_DAILY_AH_PLIST" 2>/dev/null || printf '')
  if [ "$PROGRAM_PATH" = "$BROWSER_DAILY_AH_SCRIPT" ]; then
    launchctl bootout "$LAUNCHD_DOMAIN" "$LEGACY_DAILY_AH_PLIST" 2>/dev/null || true
    rm -f "$LEGACY_DAILY_AH_PLIST"
  fi
}

# Make all scripts executable
chmod +x "$SCRIPT_DIR/chrome-devtools-helper.mjs"
chmod +x "$SCRIPT_DIR/relogin.sh"
chmod +x "$SCRIPT_DIR/run-weekly.sh"
chmod +x "$SCRIPT_DIR/common.sh"
chmod +x "$SCRIPT_DIR/weekly-category-insights/collect.sh"
chmod +x "$SCRIPT_DIR/weekly-poe/collect.sh"
chmod +x "$SCRIPT_DIR/weekly-scaleinsights/collect.sh"
chmod +x "$SCRIPT_DIR/weekly-brand-metrics/collect.sh"
chmod +x "$SCRIPT_DIR/daily-visuals/collect.sh"

if [ "${1:-}" = "--uninstall" ]; then
  echo "Uninstalling browser launchd agents..."
  launchctl bootout "$LAUNCHD_DOMAIN" "$WEEKLY_PLIST" 2>/dev/null || true
  launchctl bootout "$LAUNCHD_DOMAIN" "$DAILY_VISUALS_PLIST" 2>/dev/null || true
  launchctl bootout "$LAUNCHD_DOMAIN" "$LAUNCH_AGENTS_DIR/com.targon.sc-keepalive.plist" 2>/dev/null || true
  rm -f "$LAUNCH_AGENTS_DIR/com.targon.sc-keepalive.plist" "$WEEKLY_PLIST" "$DAILY_VISUALS_PLIST"
  cleanup_legacy_daily_account_health_agent
  echo "Done. All browser agents removed."
  exit 0
fi

echo "Installing browser launchd agents..."

# 1. Weekly browser sources — Monday 3:00 AM CT
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

# 2. Daily Visuals — 3:30 AM CT daily
cat > "$DAILY_VISUALS_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.targon.daily-visuals</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_DIR}/daily-visuals/collect.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>30</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/daily-visuals-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/daily-visuals-stderr.log</string>
</dict>
</plist>
PLIST

# Load the agents
launchctl bootout "$LAUNCHD_DOMAIN" "$WEEKLY_PLIST" 2>/dev/null || true
launchctl bootout "$LAUNCHD_DOMAIN" "$DAILY_VISUALS_PLIST" 2>/dev/null || true
launchctl bootout "$LAUNCHD_DOMAIN" "$LAUNCH_AGENTS_DIR/com.targon.sc-keepalive.plist" 2>/dev/null || true
# Unload old agents that may still be registered
launchctl bootout "$LAUNCHD_DOMAIN" "$HOME/Library/LaunchAgents/com.targon.weekly-manual-sources.plist" 2>/dev/null || true
launchctl bootout "$LAUNCHD_DOMAIN" "$HOME/Library/LaunchAgents/com.targon.hourly-visuals.plist" 2>/dev/null || true
rm -f "$LAUNCH_AGENTS_DIR/com.targon.sc-keepalive.plist"
rm -f "$HOME/Library/LaunchAgents/com.targon.weekly-manual-sources.plist"
rm -f "$HOME/Library/LaunchAgents/com.targon.hourly-visuals.plist"
cleanup_legacy_daily_account_health_agent

launchctl bootstrap "$LAUNCHD_DOMAIN" "$WEEKLY_PLIST"
launchctl bootstrap "$LAUNCHD_DOMAIN" "$DAILY_VISUALS_PLIST"

echo ""
echo "Installed and loaded:"
echo "  Weekly browser:    $WEEKLY_PLIST (Monday 3:00 AM CT, Chrome)"
echo "  Daily Visuals:     $DAILY_VISUALS_PLIST (daily 3:30 AM CT)"
echo ""
echo "Weekly master runner calls:"
echo "  1. weekly-category-insights (validated API snapshot)"
echo "  2. weekly-poe (CSV download)"
echo "  3. weekly-scaleinsights (XLSX export)"
echo "  4. weekly-brand-metrics (Chrome CSV export)"
echo ""
echo "To check status:"
echo "  launchctl list | grep targon"
echo ""
echo "To uninstall:"
echo "  bash $SCRIPT_DIR/install.sh --uninstall"
echo ""
echo "Logs:"
echo "  Weekly:          /tmp/weekly-browser-sources.log"
echo "  Daily Visuals:   /tmp/daily-visuals.log"
