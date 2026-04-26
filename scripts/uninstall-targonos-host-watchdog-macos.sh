#!/usr/bin/env bash
set -euo pipefail

PLIST_PATH="${HOME}/Library/LaunchAgents/com.targonglobal.targonos-host-watchdog.plist"
SCRIPT_PATH="${TARGONOS_WATCHDOG_BIN_DIR:-$HOME/bin}/targonos-host-watchdog.sh"
LABEL="com.targonglobal.targonos-host-watchdog"

if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/${LABEL}"
fi

rm -f "$PLIST_PATH"
rm -f "$SCRIPT_PATH"

echo "Removed TargonOS host watchdog:"
echo "- Script: ${SCRIPT_PATH}"
echo "- LaunchAgent: ${PLIST_PATH}"
