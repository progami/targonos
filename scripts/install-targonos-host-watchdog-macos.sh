#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_SCRIPT="${SCRIPT_DIR}/targonos-host-watchdog.sh"

BIN_DIR="${TARGONOS_WATCHDOG_BIN_DIR:-$HOME/bin}"
TARGET_SCRIPT="${BIN_DIR}/targonos-host-watchdog.sh"

LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
PLIST_PATH="${LAUNCH_AGENTS_DIR}/com.targonglobal.targonos-host-watchdog.plist"
LABEL="com.targonglobal.targonos-host-watchdog"

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
    <string>${HOME}/Library/Logs/targonos-host-watchdog.out.log</string>
    <key>StandardErrorPath</key>
    <string>${HOME}/Library/Logs/targonos-host-watchdog.err.log</string>
  </dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"

echo "Installed TargonOS host watchdog:"
echo "- Script: ${TARGET_SCRIPT}"
echo "- LaunchAgent: ${PLIST_PATH}"
echo "- Logs: ${HOME}/Library/Logs/targonos-host-watchdog.{out,err}.log"

