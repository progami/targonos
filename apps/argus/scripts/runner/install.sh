#!/bin/bash
# Install the unified Argus runner LaunchAgent.
#
# The runner owns market/source scheduling. launchd only wakes it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARGUS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LAUNCHD_DOMAIN="gui/$(id -u)"
RUNNER_LABEL="com.targon.argus.runner"
RUNNER_PLIST="$LAUNCH_AGENTS_DIR/$RUNNER_LABEL.plist"
TARGONOS_ENV_MODE="local"
LEGACY_LABELS=(
  "com.targon.argus.tracking-fetch"
  "com.targon.argus.tracking-fetch.uk"
  "com.targon.hourly-listing-attributes-api"
  "com.targon.hourly-listing-attributes-api.uk"
  "com.targon.daily-account-health"
  "com.targon.daily-account-health.uk"
  "com.targon.weekly-api-sources"
  "com.targon.weekly-api-sources.uk"
  "com.targon.daily-visuals"
  "com.targon.daily-visuals.uk"
  "com.targon.weekly-browser-sources"
  "com.targon.weekly-browser-sources.uk"
  "com.targon.argus.drive-sync"
  "com.targon.argus.drive-sync.uk"
)

UNINSTALL="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --uninstall)
      UNINSTALL="true"
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
  shift
done

bootout_if_loaded() {
  local label="$1"
  if launchctl print "$LAUNCHD_DOMAIN/$label" >/dev/null 2>&1; then
    launchctl bootout "$LAUNCHD_DOMAIN/$label"
  fi
}

remove_legacy_agents() {
  local label=""
  for label in "${LEGACY_LABELS[@]}"; do
    bootout_if_loaded "$label"
    rm -f "$LAUNCH_AGENTS_DIR/$label.plist"
  done
}

mkdir -p "$LAUNCH_AGENTS_DIR"
chmod +x "$SCRIPT_DIR/cli.mjs"

if [ "$UNINSTALL" = "true" ]; then
  echo "Uninstalling Argus runner LaunchAgent..."
  bootout_if_loaded "$RUNNER_LABEL"
  rm -f "$RUNNER_PLIST"
  echo "Done. Argus runner removed."
  exit 0
fi

remove_legacy_agents
bootout_if_loaded "$RUNNER_LABEL"
rm -f "$RUNNER_PLIST"

cat > "$RUNNER_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${HOME}</string>
    <key>TARGONOS_ENV_MODE</key>
    <string>${TARGONOS_ENV_MODE}</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>Label</key>
  <string>${RUNNER_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>pnpm</string>
    <string>--filter</string>
    <string>argus</string>
    <string>runner</string>
    <string>tick</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/argus-runner-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/argus-runner-stderr.log</string>
  <key>WorkingDirectory</key>
  <string>${ARGUS_DIR}</string>
</dict>
</plist>
PLIST

launchctl bootstrap "$LAUNCHD_DOMAIN" "$RUNNER_PLIST"

echo "Installed and loaded: $RUNNER_PLIST"
