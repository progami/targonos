#!/bin/bash
# Install launchd plists for API-based Argus collectors:
#   1. Hourly Listing Attributes (SP-API) — every hour
#   2. Weekly API sources (Monday 4 AM CT)
#
# Usage: bash apps/argus/scripts/api/install.sh
# To uninstall: bash apps/argus/scripts/api/install.sh --uninstall

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
mkdir -p "$LAUNCH_AGENTS_DIR"

HOURLY_LISTINGS_API_PLIST="$LAUNCH_AGENTS_DIR/com.targon.hourly-listing-attributes-api.plist"
WEEKLY_API_PLIST="$LAUNCH_AGENTS_DIR/com.targon.weekly-api-sources.plist"

# Make scripts executable
chmod +x "$SCRIPT_DIR/hourly-listing-attributes/collect.sh"
chmod +x "$SCRIPT_DIR/weekly-sources/run.sh"
chmod +x "$SCRIPT_DIR/weekly-sources/filter-tst.py"
chmod +x "$SCRIPT_DIR/weekly-sources/collect-sp-ads.py"

if [ "${1:-}" = "--uninstall" ]; then
  echo "Uninstalling API launchd agents..."
  launchctl unload "$HOURLY_LISTINGS_API_PLIST" 2>/dev/null || true
  launchctl unload "$WEEKLY_API_PLIST" 2>/dev/null || true
  rm -f "$HOURLY_LISTINGS_API_PLIST" "$WEEKLY_API_PLIST"
  echo "Done. All API agents removed."
  exit 0
fi

echo "Installing API launchd agents..."

# 1. Hourly Listing Attributes (API) — every hour
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
    <string>${SCRIPT_DIR}/hourly-listing-attributes/collect.sh</string>
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

# 2. Weekly API sources — Monday 4:00 AM CT
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
launchctl unload "$HOURLY_LISTINGS_API_PLIST" 2>/dev/null || true
launchctl unload "$WEEKLY_API_PLIST" 2>/dev/null || true
launchctl load "$HOURLY_LISTINGS_API_PLIST"
launchctl load "$WEEKLY_API_PLIST"

echo ""
echo "Installed and loaded:"
echo "  Hourly Listings API: $HOURLY_LISTINGS_API_PLIST (every 1 hour)"
echo "  Weekly API Sources:  $WEEKLY_API_PLIST (Monday 4:00 AM CT)"
echo ""
echo "To check status:"
echo "  launchctl list | grep targon"
echo ""
echo "To uninstall:"
echo "  bash $SCRIPT_DIR/install.sh --uninstall"
echo ""
echo "Logs:"
echo "  Hourly Listings API: /tmp/hourly-listing-attributes-api.log"
echo "  Weekly API Sources:  /tmp/weekly-api-sources.log"
