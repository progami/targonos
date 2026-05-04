#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_SCRIPT="${SCRIPT_DIR}/cloudflared-watchdog.sh"

BIN_DIR="${CLOUDFLARED_WATCHDOG_BIN_DIR:-$HOME/bin}"
TARGET_SCRIPT="${BIN_DIR}/cloudflared-watchdog.sh"

LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
PLIST_PATH="${LAUNCH_AGENTS_DIR}/com.targonglobal.cloudflared-watchdog.plist"
LABEL="com.targonglobal.cloudflared-watchdog"

mkdir -p "$BIN_DIR"
mkdir -p "$LAUNCH_AGENTS_DIR"
mkdir -p "${HOME}/Library/Logs"

cp "$SOURCE_SCRIPT" "$TARGET_SCRIPT"
chmod +x "$TARGET_SCRIPT"

cat >"$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${TARGET_SCRIPT}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StartInterval</key>
    <integer>60</integer>
    <key>ThrottleInterval</key>
    <integer>30</integer>
    <key>StandardOutPath</key>
    <string>${HOME}/Library/Logs/cloudflared-watchdog.out.log</string>
    <key>StandardErrorPath</key>
    <string>${HOME}/Library/Logs/cloudflared-watchdog.err.log</string>
  </dict>
</plist>
EOF

if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/${LABEL}"
fi

launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"

echo "Installed cloudflared watchdog:"
echo "- Script: ${TARGET_SCRIPT}"
echo "- LaunchAgent: ${PLIST_PATH}"
echo "- Logs: ${HOME}/Library/Logs/cloudflared-watchdog.{out,err}.log"
