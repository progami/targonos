#!/usr/bin/env bash
set -euo pipefail

PLIST_PATH="${HOME}/Library/LaunchAgents/com.targonglobal.targonos-host-watchdog.plist"
SCRIPT_PATH="${TARGONOS_WATCHDOG_BIN_DIR:-$HOME/bin}/targonos-host-watchdog.sh"

launchctl bootout "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null || true
rm -f "$PLIST_PATH"
rm -f "$SCRIPT_PATH"

echo "Removed TargonOS host watchdog:"
echo "- Script: ${SCRIPT_PATH}"
echo "- LaunchAgent: ${PLIST_PATH}"

