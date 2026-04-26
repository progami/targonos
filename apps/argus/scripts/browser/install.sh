#!/bin/bash
# Install launchd plists for browser-automated Argus collectors:
#   1. Weekly browser sources collection (Chrome) (Monday 3 AM CT)
#   2. Daily Visuals screenshot collector (3:30 AM CT daily)
#
# Usage: bash apps/argus/scripts/browser/install.sh --market us|uk
# To uninstall: bash apps/argus/scripts/browser/install.sh --market us|uk --uninstall

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LAUNCHD_DOMAIN="gui/$(id -u)"
mkdir -p "$LAUNCH_AGENTS_DIR"

MARKET="us"
UNINSTALL="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --market)
      if [ "$#" -lt 2 ]; then
        echo "--market requires us or uk." >&2
        exit 1
      fi
      MARKET="$2"
      shift
      ;;
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

case "$MARKET" in
  us|uk)
    ;;
  *)
    echo "Unsupported market: $MARKET" >&2
    exit 1
    ;;
esac

label_for_market() {
  local base_label="$1"
  if [ "$MARKET" = "us" ]; then
    printf '%s' "$base_label"
  else
    printf '%s.%s' "$base_label" "$MARKET"
  fi
}

log_suffix_for_market() {
  if [ "$MARKET" = "us" ]; then
    printf ''
  else
    printf -- '-%s' "$MARKET"
  fi
}

WEEKLY_LABEL="$(label_for_market com.targon.weekly-browser-sources)"
DAILY_VISUALS_LABEL="$(label_for_market com.targon.daily-visuals)"
LOG_SUFFIX="$(log_suffix_for_market)"

WEEKLY_PLIST="$LAUNCH_AGENTS_DIR/$WEEKLY_LABEL.plist"
DAILY_VISUALS_PLIST="$LAUNCH_AGENTS_DIR/$DAILY_VISUALS_LABEL.plist"
LEGACY_DAILY_AH_PLIST="$LAUNCH_AGENTS_DIR/com.targon.daily-account-health.plist"
BROWSER_DAILY_AH_SCRIPT="$SCRIPT_DIR/daily-account-health/collect.sh"

bootout_if_loaded() {
  local label="$1"
  if launchctl print "$LAUNCHD_DOMAIN/$label" >/dev/null 2>&1; then
    launchctl bootout "$LAUNCHD_DOMAIN/$label"
  fi
}

cleanup_legacy_daily_account_health_agent() {
  if [ ! -f "$LEGACY_DAILY_AH_PLIST" ]; then
    return
  fi

  if PROGRAM_PATH=$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:1' "$LEGACY_DAILY_AH_PLIST" 2>/dev/null); then
    if [ "$PROGRAM_PATH" = "$BROWSER_DAILY_AH_SCRIPT" ]; then
      bootout_if_loaded "com.targon.daily-account-health"
      rm -f "$LEGACY_DAILY_AH_PLIST"
    fi
  fi
}

# Make all scripts executable
chmod +x "$SCRIPT_DIR/chrome-devtools-helper.mjs"
chmod +x "$SCRIPT_DIR/start-devtools-chrome.sh"
chmod +x "$SCRIPT_DIR/relogin.sh"
chmod +x "$SCRIPT_DIR/run-weekly.sh"
chmod +x "$SCRIPT_DIR/common.sh"
chmod +x "$SCRIPT_DIR/weekly-category-insights/collect.sh"
chmod +x "$SCRIPT_DIR/weekly-poe/collect.sh"
chmod +x "$SCRIPT_DIR/weekly-scaleinsights/collect.sh"
chmod +x "$SCRIPT_DIR/weekly-brand-metrics/collect.sh"
chmod +x "$SCRIPT_DIR/daily-visuals/collect.sh"

if [ "$UNINSTALL" = "true" ]; then
  echo "Uninstalling browser launchd agents for market=$MARKET..."
  bootout_if_loaded "$WEEKLY_LABEL"
  bootout_if_loaded "$DAILY_VISUALS_LABEL"
  bootout_if_loaded "com.targon.sc-keepalive"
  rm -f "$LAUNCH_AGENTS_DIR/com.targon.sc-keepalive.plist" "$WEEKLY_PLIST" "$DAILY_VISUALS_PLIST"
  cleanup_legacy_daily_account_health_agent
  echo "Done. All browser agents removed."
  exit 0
fi

echo "Installing browser launchd agents for market=$MARKET..."

# 1. Weekly browser sources — Monday 3:00 AM CT
cat > "$WEEKLY_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${WEEKLY_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_DIR}/run-weekly.sh</string>
    <string>--market</string>
    <string>${MARKET}</string>
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
  <string>/tmp/weekly-browser-sources${LOG_SUFFIX}-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/weekly-browser-sources${LOG_SUFFIX}-stderr.log</string>
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
  <string>${DAILY_VISUALS_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_DIR}/daily-visuals/collect.sh</string>
    <string>--market</string>
    <string>${MARKET}</string>
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
  <string>/tmp/daily-visuals${LOG_SUFFIX}-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/daily-visuals${LOG_SUFFIX}-stderr.log</string>
</dict>
</plist>
PLIST

# Load the agents
bootout_if_loaded "$WEEKLY_LABEL"
bootout_if_loaded "$DAILY_VISUALS_LABEL"
bootout_if_loaded "com.targon.sc-keepalive"
# Unload old agents that may still be registered
bootout_if_loaded "com.targon.weekly-manual-sources"
bootout_if_loaded "com.targon.hourly-visuals"
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
echo "  bash $SCRIPT_DIR/install.sh --market $MARKET --uninstall"
echo ""
echo "Logs:"
echo "  Weekly:          /tmp/weekly-browser-sources${LOG_SUFFIX}.log"
echo "  Daily Visuals:   /tmp/daily-visuals${LOG_SUFFIX}.log"
