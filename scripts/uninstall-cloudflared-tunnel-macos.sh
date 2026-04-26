#!/usr/bin/env bash
set -euo pipefail

LABEL="${CLOUDFLARED_TUNNEL_LABEL:-com.targonglobal.cloudflared-tunnel}"
DOMAIN="gui/$(id -u)"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"

if launchctl print "${DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "${DOMAIN}/${LABEL}"
fi

rm -f "$PLIST_PATH"

printf 'Removed Cloudflared tunnel LaunchAgent:\n'
printf '%s\n' "- Label: ${LABEL}"
printf '%s\n' "- LaunchAgent: ${PLIST_PATH}"
