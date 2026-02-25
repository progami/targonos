#!/bin/bash
# Install launchd plists for:
#   1. Seller Central session keepalive (every 4 hours)
#   2. Weekly manual sources collection (Monday 9 AM)
#
# Usage: bash apps/argus/scripts/weekly-manual-sources/install.sh
# To uninstall: bash apps/argus/scripts/weekly-manual-sources/install.sh --uninstall

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
mkdir -p "$LAUNCH_AGENTS_DIR"

KEEPALIVE_PLIST="$LAUNCH_AGENTS_DIR/com.targon.sc-keepalive.plist"
WEEKLY_PLIST="$LAUNCH_AGENTS_DIR/com.targon.weekly-manual-sources.plist"

# Make scripts executable
chmod +x "$SCRIPT_DIR/keepalive.sh"
chmod +x "$SCRIPT_DIR/run.sh"

if [ "${1:-}" = "--uninstall" ]; then
  echo "Uninstalling launchd agents..."
  launchctl unload "$KEEPALIVE_PLIST" 2>/dev/null || true
  launchctl unload "$WEEKLY_PLIST" 2>/dev/null || true
  rm -f "$KEEPALIVE_PLIST" "$WEEKLY_PLIST"
  echo "Done. Both agents removed."
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

# 2. Weekly manual sources — Monday 9:00 AM local
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
    <integer>9</integer>
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

# Load the agents
launchctl unload "$KEEPALIVE_PLIST" 2>/dev/null || true
launchctl unload "$WEEKLY_PLIST" 2>/dev/null || true
launchctl load "$KEEPALIVE_PLIST"
launchctl load "$WEEKLY_PLIST"

echo ""
echo "Installed and loaded:"
echo "  Keepalive:  $KEEPALIVE_PLIST (every 4 hours)"
echo "  Weekly run: $WEEKLY_PLIST (Monday 9:00 AM)"
echo ""
echo "To check status:"
echo "  launchctl list | grep targon"
echo ""
echo "To uninstall:"
echo "  bash $SCRIPT_DIR/install.sh --uninstall"
echo ""
echo "Logs:"
echo "  Keepalive: /tmp/sc-keepalive.log"
echo "  Weekly:    /tmp/weekly-manual-sources/run_*.log"
