#!/bin/bash
# Install launchd plists for API-based Argus collectors:
#   1. Tracking fetch — every hour
#   2. Hourly Listing Attributes (SP-API) — every hour
#   3. Daily Account Health (SP-API) — daily 3 AM CT
#   4. Weekly API sources (Monday 4 AM CT)
#
# Usage: bash apps/argus/scripts/api/install.sh --market us|uk
# To uninstall: bash apps/argus/scripts/api/install.sh --market us|uk --uninstall

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARGUS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TRACKING_FETCH_TSX="$ARGUS_DIR/node_modules/.bin/tsx"
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

TRACKING_FETCH_LABEL="$(label_for_market com.targon.argus.tracking-fetch)"
HOURLY_LISTINGS_API_LABEL="$(label_for_market com.targon.hourly-listing-attributes-api)"
DAILY_ACCOUNT_HEALTH_LABEL="$(label_for_market com.targon.daily-account-health)"
WEEKLY_API_LABEL="$(label_for_market com.targon.weekly-api-sources)"
LOG_SUFFIX="$(log_suffix_for_market)"

TRACKING_FETCH_PLIST="$LAUNCH_AGENTS_DIR/$TRACKING_FETCH_LABEL.plist"
HOURLY_LISTINGS_API_PLIST="$LAUNCH_AGENTS_DIR/$HOURLY_LISTINGS_API_LABEL.plist"
DAILY_ACCOUNT_HEALTH_PLIST="$LAUNCH_AGENTS_DIR/$DAILY_ACCOUNT_HEALTH_LABEL.plist"
WEEKLY_API_PLIST="$LAUNCH_AGENTS_DIR/$WEEKLY_API_LABEL.plist"

hourly_start_calendar_interval() {
  echo "  <key>StartCalendarInterval</key>"
  echo "  <array>"
  for hour in $(seq 0 23); do
    cat <<PLIST
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
PLIST
  done
  echo "  </array>"
}

bootout_if_loaded() {
  local label="$1"
  if launchctl print "$LAUNCHD_DOMAIN/$label" >/dev/null 2>&1; then
    launchctl bootout "$LAUNCHD_DOMAIN/$label"
  fi
}

# Make scripts executable
chmod +x "$SCRIPT_DIR/hourly-listing-attributes/collect.sh"
chmod +x "$SCRIPT_DIR/daily-account-health/collect.sh"
chmod +x "$SCRIPT_DIR/weekly-sources/run.sh"
chmod +x "$SCRIPT_DIR/weekly-sources/filter-tst.py"
chmod +x "$SCRIPT_DIR/weekly-sources/collect-sp-ads.py"

if [ "$UNINSTALL" = "true" ]; then
  echo "Uninstalling API launchd agents for market=$MARKET..."
  bootout_if_loaded "$TRACKING_FETCH_LABEL"
  bootout_if_loaded "$HOURLY_LISTINGS_API_LABEL"
  bootout_if_loaded "$DAILY_ACCOUNT_HEALTH_LABEL"
  bootout_if_loaded "$WEEKLY_API_LABEL"
  rm -f "$TRACKING_FETCH_PLIST" "$HOURLY_LISTINGS_API_PLIST" "$DAILY_ACCOUNT_HEALTH_PLIST" "$WEEKLY_API_PLIST"
  echo "Done. All API agents removed."
  exit 0
fi

echo "Installing API launchd agents for market=$MARKET..."

# 1. Tracking fetch — every hour
cat > "$TRACKING_FETCH_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NEXT_PUBLIC_APP_URL</key>
    <string>https://os.targonglobal.com/argus</string>
    <key>ARGUS_MARKET</key>
    <string>${MARKET}</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>Label</key>
  <string>${TRACKING_FETCH_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${TRACKING_FETCH_TSX}</string>
    <string>scripts/tracking-fetch.ts</string>
    <string>--market</string>
    <string>${MARKET}</string>
  </array>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>StandardOutPath</key>
  <string>/tmp/argus-tracking-fetch${LOG_SUFFIX}.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/argus-tracking-fetch${LOG_SUFFIX}.err</string>
  <key>WorkingDirectory</key>
  <string>${ARGUS_DIR}</string>
</dict>
</plist>
PLIST

# 2. Hourly Listing Attributes (API) — top of every hour
{
cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${HOURLY_LISTINGS_API_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_DIR}/hourly-listing-attributes/collect.sh</string>
    <string>--market</string>
    <string>${MARKET}</string>
  </array>
PLIST
hourly_start_calendar_interval
cat <<PLIST
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/hourly-listing-attributes-api${LOG_SUFFIX}-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/hourly-listing-attributes-api${LOG_SUFFIX}-stderr.log</string>
</dict>
</plist>
PLIST
} > "$HOURLY_LISTINGS_API_PLIST"

# 3. Daily Account Health — 3:00 AM CT daily
cat > "$DAILY_ACCOUNT_HEALTH_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${DAILY_ACCOUNT_HEALTH_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_DIR}/daily-account-health/collect.sh</string>
    <string>--market</string>
    <string>${MARKET}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/daily-account-health${LOG_SUFFIX}-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/daily-account-health${LOG_SUFFIX}-stderr.log</string>
</dict>
</plist>
PLIST

# 4. Weekly API sources — Monday 4:00 AM CT
cat > "$WEEKLY_API_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${WEEKLY_API_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_DIR}/weekly-sources/run.sh</string>
    <string>--market</string>
    <string>${MARKET}</string>
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
  <string>/tmp/weekly-api-sources${LOG_SUFFIX}-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/weekly-api-sources${LOG_SUFFIX}-stderr.log</string>
</dict>
</plist>
PLIST

# Load the agents
bootout_if_loaded "$TRACKING_FETCH_LABEL"
bootout_if_loaded "$HOURLY_LISTINGS_API_LABEL"
bootout_if_loaded "$DAILY_ACCOUNT_HEALTH_LABEL"
bootout_if_loaded "$WEEKLY_API_LABEL"
launchctl bootstrap "$LAUNCHD_DOMAIN" "$TRACKING_FETCH_PLIST"
launchctl bootstrap "$LAUNCHD_DOMAIN" "$HOURLY_LISTINGS_API_PLIST"
launchctl bootstrap "$LAUNCHD_DOMAIN" "$DAILY_ACCOUNT_HEALTH_PLIST"
launchctl bootstrap "$LAUNCHD_DOMAIN" "$WEEKLY_API_PLIST"

echo ""
echo "Installed and loaded:"
echo "  Tracking fetch:      $TRACKING_FETCH_PLIST (every hour)"
echo "  Hourly Listings API: $HOURLY_LISTINGS_API_PLIST (top of every hour)"
echo "  Daily Acct Health:   $DAILY_ACCOUNT_HEALTH_PLIST (daily 3:00 AM CT)"
echo "  Weekly API Sources:  $WEEKLY_API_PLIST (Monday 4:00 AM CT)"
echo ""
echo "To check status:"
echo "  launchctl list | grep targon"
echo ""
echo "To uninstall:"
echo "  bash $SCRIPT_DIR/install.sh --market $MARKET --uninstall"
echo ""
echo "Logs:"
echo "  Tracking fetch:      /tmp/argus-tracking-fetch${LOG_SUFFIX}.log"
echo "  Hourly Listings API: /tmp/hourly-listing-attributes-api${LOG_SUFFIX}.log"
echo "  Daily Acct Health:   /tmp/daily-account-health${LOG_SUFFIX}.log"
echo "  Weekly API Sources:  /tmp/weekly-api-sources${LOG_SUFFIX}.log"
