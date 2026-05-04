#!/usr/bin/env bash
set -euo pipefail

PLIST_PATH="${HOME}/Library/LaunchAgents/com.targonglobal.cloudflared-watchdog.plist"
SCRIPT_PATH="${CLOUDFLARED_WATCHDOG_BIN_DIR:-$HOME/bin}/cloudflared-watchdog.sh"
LABEL="com.targonglobal.cloudflared-watchdog"

if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/${LABEL}"
fi

rm -f "$PLIST_PATH"
rm -f "$SCRIPT_PATH"

echo "Removed cloudflared watchdog:"
echo "- LaunchAgent: ${PLIST_PATH}"
echo "- Script: ${SCRIPT_PATH}"
