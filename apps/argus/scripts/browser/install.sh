#!/bin/bash
# Install launchd plists for browser-automated Argus collectors:
#   1. Weekly browser sources collection (Chrome) (Monday 3 AM CT)
#   2. Daily Visuals screenshot collector (3:30 AM CT daily)
#
# Usage: bash apps/argus/scripts/browser/install.sh --market us|uk
# To uninstall: bash apps/argus/scripts/browser/install.sh --market us|uk --uninstall

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARGUS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$ARGUS_DIR/../.." && pwd)"
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

load_env_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return 0
  fi

  local export_lines
  export_lines="$(/usr/bin/python3 - "$file" <<'PY'
from pathlib import Path
import shlex
import sys

path = Path(sys.argv[1])
for raw_line in path.read_text().splitlines():
    for line in raw_line.split('\\n'):
        trimmed = line.strip()
        if not trimmed or trimmed.startswith('#') or '=' not in trimmed:
            continue
        key, value = trimmed.split('=', 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if value.endswith('$'):
            value = value[:-1]
        print(f'export {key}={shlex.quote(value)}')
PY
)"
  if [ -n "$export_lines" ]; then
    eval "$export_lines"
  fi
}

require_env_value() {
  local name="$1"
  local value="${!name:-}"
  if [ -z "${value// }" ]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
  printf '%s' "$value"
}

xml_escape() {
  /usr/bin/python3 - "$1" <<'PY'
import html
import sys

print(html.escape(sys.argv[1], quote=False))
PY
}

MARKET_SUFFIX="$(printf '%s' "$MARKET" | tr '[:lower:]' '[:upper:]')"

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
chmod +x "$ARGUS_DIR/scripts/lib/enqueue-drive-sync.mjs"

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

load_env_file "$REPO_ROOT/env/shared.local.env"
load_env_file "$ARGUS_DIR/.env.local"

if [ "$MARKET" = "us" ]; then
  ARGUS_MONITORING_ROOT_ENV_KEY="ARGUS_MONITORING_ROOT_US"
  ARGUS_MONITORING_ROOT="$HOME/.local/share/targon/argus-monitoring/us"
else
  ARGUS_MONITORING_ROOT_ENV_KEY="ARGUS_MONITORING_ROOT_UK"
  ARGUS_MONITORING_ROOT="$HOME/.local/share/targon/argus-monitoring/uk"
fi
TARGONOS_ENV_MODE="local"

ARGUS_CATEGORY_INSIGHTS_URL_ENV_KEY="ARGUS_CATEGORY_INSIGHTS_URL_${MARKET_SUFFIX}"
ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_ID_ENV_KEY="ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_ID_${MARKET_SUFFIX}"
ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_LABEL_ENV_KEY="ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_LABEL_${MARKET_SUFFIX}"
ARGUS_CATEGORY_INSIGHTS_SEARCH_TERM_ENV_KEY="ARGUS_CATEGORY_INSIGHTS_SEARCH_TERM_${MARKET_SUFFIX}"
ARGUS_CATEGORY_INSIGHTS_CATEGORY_ID_ENV_KEY="ARGUS_CATEGORY_INSIGHTS_CATEGORY_ID_${MARKET_SUFFIX}"
ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_ID_ENV_KEY="ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_ID_${MARKET_SUFFIX}"
ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_LABEL_ENV_KEY="ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_LABEL_${MARKET_SUFFIX}"
ARGUS_CATEGORY_INSIGHTS_BROWSE_NODE_ID_ENV_KEY="ARGUS_CATEGORY_INSIGHTS_BROWSE_NODE_ID_${MARKET_SUFFIX}"
ARGUS_SELLER_CENTRAL_HOME_URL_ENV_KEY="ARGUS_SELLER_CENTRAL_HOME_URL_${MARKET_SUFFIX}"
ARGUS_SELLER_CENTRAL_HOST_ENV_KEY="ARGUS_SELLER_CENTRAL_HOST_${MARKET_SUFFIX}"
ARGUS_SELLER_CENTRAL_BITWARDEN_QUERY_ENV_KEY="ARGUS_SELLER_CENTRAL_BITWARDEN_QUERY_${MARKET_SUFFIX}"
ARGUS_SELLER_CENTRAL_ACCOUNT_LABEL_ENV_KEY="ARGUS_SELLER_CENTRAL_ACCOUNT_LABEL_${MARKET_SUFFIX}"
ARGUS_SELLER_CENTRAL_MARKETPLACE_LABEL_ENV_KEY="ARGUS_SELLER_CENTRAL_MARKETPLACE_LABEL_${MARKET_SUFFIX}"
ARGUS_POE_TARGET_URL_BASE_ENV_KEY="ARGUS_POE_TARGET_URL_BASE_${MARKET_SUFFIX}"
AMAZON_MARKETPLACE_ID_ENV_KEY="AMAZON_MARKETPLACE_ID_${MARKET_SUFFIX}"
ARGUS_SCALEINSIGHTS_COUNTRY_CODE_ENV_KEY="ARGUS_SCALEINSIGHTS_COUNTRY_CODE_${MARKET_SUFFIX}"
ARGUS_BRAND_METRICS_URL_BASE_ENV_KEY="ARGUS_BRAND_METRICS_URL_BASE_${MARKET_SUFFIX}"
ARGUS_BRAND_METRICS_DOWNLOAD_GLOB_ENV_KEY="ARGUS_BRAND_METRICS_DOWNLOAD_GLOB_${MARKET_SUFFIX}"
ARGUS_BRAND_METRICS_DOWNLOAD_BASENAME_ENV_KEY="ARGUS_BRAND_METRICS_DOWNLOAD_BASENAME_${MARKET_SUFFIX}"

ARGUS_CATEGORY_INSIGHTS_URL="$(require_env_value "$ARGUS_CATEGORY_INSIGHTS_URL_ENV_KEY")"
ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_ID="$(require_env_value "$ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_ID_ENV_KEY")"
ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_LABEL="$(require_env_value "$ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_LABEL_ENV_KEY")"
ARGUS_CATEGORY_INSIGHTS_SEARCH_TERM="$(require_env_value "$ARGUS_CATEGORY_INSIGHTS_SEARCH_TERM_ENV_KEY")"
ARGUS_CATEGORY_INSIGHTS_CATEGORY_ID="$(require_env_value "$ARGUS_CATEGORY_INSIGHTS_CATEGORY_ID_ENV_KEY")"
ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_ID="$(require_env_value "$ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_ID_ENV_KEY")"
ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_LABEL="$(require_env_value "$ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_LABEL_ENV_KEY")"
ARGUS_CATEGORY_INSIGHTS_BROWSE_NODE_ID="$(require_env_value "$ARGUS_CATEGORY_INSIGHTS_BROWSE_NODE_ID_ENV_KEY")"
ARGUS_SELLER_CENTRAL_HOME_URL="$(require_env_value "$ARGUS_SELLER_CENTRAL_HOME_URL_ENV_KEY")"
ARGUS_SELLER_CENTRAL_HOST="$(require_env_value "$ARGUS_SELLER_CENTRAL_HOST_ENV_KEY")"
ARGUS_SELLER_CENTRAL_BITWARDEN_QUERY="$(require_env_value "$ARGUS_SELLER_CENTRAL_BITWARDEN_QUERY_ENV_KEY")"
ARGUS_SELLER_CENTRAL_ACCOUNT_LABEL="$(require_env_value "$ARGUS_SELLER_CENTRAL_ACCOUNT_LABEL_ENV_KEY")"
ARGUS_SELLER_CENTRAL_MARKETPLACE_LABEL="$(require_env_value "$ARGUS_SELLER_CENTRAL_MARKETPLACE_LABEL_ENV_KEY")"
ARGUS_POE_TARGET_URL_BASE="$(require_env_value "$ARGUS_POE_TARGET_URL_BASE_ENV_KEY")"
AMAZON_MARKETPLACE_ID="$(require_env_value "$AMAZON_MARKETPLACE_ID_ENV_KEY")"
ARGUS_SCALEINSIGHTS_COUNTRY_CODE="$(require_env_value "$ARGUS_SCALEINSIGHTS_COUNTRY_CODE_ENV_KEY")"
ARGUS_BRAND_METRICS_URL_BASE="$(require_env_value "$ARGUS_BRAND_METRICS_URL_BASE_ENV_KEY")"
ARGUS_BRAND_METRICS_DOWNLOAD_GLOB="$(require_env_value "$ARGUS_BRAND_METRICS_DOWNLOAD_GLOB_ENV_KEY")"
ARGUS_BRAND_METRICS_DOWNLOAD_BASENAME="$(require_env_value "$ARGUS_BRAND_METRICS_DOWNLOAD_BASENAME_ENV_KEY")"

HOME_XML="$(xml_escape "$HOME")"
ARGUS_MONITORING_ROOT_XML="$(xml_escape "$ARGUS_MONITORING_ROOT")"
ARGUS_CATEGORY_INSIGHTS_URL_XML="$(xml_escape "$ARGUS_CATEGORY_INSIGHTS_URL")"
ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_ID_XML="$(xml_escape "$ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_ID")"
ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_LABEL_XML="$(xml_escape "$ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_LABEL")"
ARGUS_CATEGORY_INSIGHTS_SEARCH_TERM_XML="$(xml_escape "$ARGUS_CATEGORY_INSIGHTS_SEARCH_TERM")"
ARGUS_CATEGORY_INSIGHTS_CATEGORY_ID_XML="$(xml_escape "$ARGUS_CATEGORY_INSIGHTS_CATEGORY_ID")"
ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_ID_XML="$(xml_escape "$ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_ID")"
ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_LABEL_XML="$(xml_escape "$ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_LABEL")"
ARGUS_CATEGORY_INSIGHTS_BROWSE_NODE_ID_XML="$(xml_escape "$ARGUS_CATEGORY_INSIGHTS_BROWSE_NODE_ID")"
ARGUS_SELLER_CENTRAL_HOME_URL_XML="$(xml_escape "$ARGUS_SELLER_CENTRAL_HOME_URL")"
ARGUS_SELLER_CENTRAL_HOST_XML="$(xml_escape "$ARGUS_SELLER_CENTRAL_HOST")"
ARGUS_SELLER_CENTRAL_BITWARDEN_QUERY_XML="$(xml_escape "$ARGUS_SELLER_CENTRAL_BITWARDEN_QUERY")"
ARGUS_SELLER_CENTRAL_ACCOUNT_LABEL_XML="$(xml_escape "$ARGUS_SELLER_CENTRAL_ACCOUNT_LABEL")"
ARGUS_SELLER_CENTRAL_MARKETPLACE_LABEL_XML="$(xml_escape "$ARGUS_SELLER_CENTRAL_MARKETPLACE_LABEL")"
ARGUS_POE_TARGET_URL_BASE_XML="$(xml_escape "$ARGUS_POE_TARGET_URL_BASE")"
AMAZON_MARKETPLACE_ID_XML="$(xml_escape "$AMAZON_MARKETPLACE_ID")"
ARGUS_SCALEINSIGHTS_COUNTRY_CODE_XML="$(xml_escape "$ARGUS_SCALEINSIGHTS_COUNTRY_CODE")"
ARGUS_BRAND_METRICS_URL_BASE_XML="$(xml_escape "$ARGUS_BRAND_METRICS_URL_BASE")"
ARGUS_BRAND_METRICS_DOWNLOAD_GLOB_XML="$(xml_escape "$ARGUS_BRAND_METRICS_DOWNLOAD_GLOB")"
ARGUS_BRAND_METRICS_DOWNLOAD_BASENAME_XML="$(xml_escape "$ARGUS_BRAND_METRICS_DOWNLOAD_BASENAME")"

mkdir -p "$ARGUS_MONITORING_ROOT"

echo "Installing browser launchd agents for market=$MARKET..."

# 1. Weekly browser sources — Monday 3:00 AM CT
cat > "$WEEKLY_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${HOME_XML}</string>
    <key>TARGONOS_ENV_MODE</key>
    <string>${TARGONOS_ENV_MODE}</string>
    <key>ARGUS_MARKET</key>
    <string>${MARKET}</string>
    <key>${ARGUS_MONITORING_ROOT_ENV_KEY}</key>
    <string>${ARGUS_MONITORING_ROOT_XML}</string>
    <key>${ARGUS_CATEGORY_INSIGHTS_URL_ENV_KEY}</key>
    <string>${ARGUS_CATEGORY_INSIGHTS_URL_XML}</string>
    <key>${ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_ID_ENV_KEY}</key>
    <string>${ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_ID_XML}</string>
    <key>${ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_LABEL_ENV_KEY}</key>
    <string>${ARGUS_CATEGORY_INSIGHTS_MARKETPLACE_LABEL_XML}</string>
    <key>${ARGUS_CATEGORY_INSIGHTS_SEARCH_TERM_ENV_KEY}</key>
    <string>${ARGUS_CATEGORY_INSIGHTS_SEARCH_TERM_XML}</string>
    <key>${ARGUS_CATEGORY_INSIGHTS_CATEGORY_ID_ENV_KEY}</key>
    <string>${ARGUS_CATEGORY_INSIGHTS_CATEGORY_ID_XML}</string>
    <key>${ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_ID_ENV_KEY}</key>
    <string>${ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_ID_XML}</string>
    <key>${ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_LABEL_ENV_KEY}</key>
    <string>${ARGUS_CATEGORY_INSIGHTS_PRODUCT_TYPE_LABEL_XML}</string>
    <key>${ARGUS_CATEGORY_INSIGHTS_BROWSE_NODE_ID_ENV_KEY}</key>
    <string>${ARGUS_CATEGORY_INSIGHTS_BROWSE_NODE_ID_XML}</string>
    <key>${ARGUS_SELLER_CENTRAL_HOME_URL_ENV_KEY}</key>
    <string>${ARGUS_SELLER_CENTRAL_HOME_URL_XML}</string>
    <key>${ARGUS_SELLER_CENTRAL_HOST_ENV_KEY}</key>
    <string>${ARGUS_SELLER_CENTRAL_HOST_XML}</string>
    <key>${ARGUS_SELLER_CENTRAL_BITWARDEN_QUERY_ENV_KEY}</key>
    <string>${ARGUS_SELLER_CENTRAL_BITWARDEN_QUERY_XML}</string>
    <key>${ARGUS_SELLER_CENTRAL_ACCOUNT_LABEL_ENV_KEY}</key>
    <string>${ARGUS_SELLER_CENTRAL_ACCOUNT_LABEL_XML}</string>
    <key>${ARGUS_SELLER_CENTRAL_MARKETPLACE_LABEL_ENV_KEY}</key>
    <string>${ARGUS_SELLER_CENTRAL_MARKETPLACE_LABEL_XML}</string>
    <key>${ARGUS_POE_TARGET_URL_BASE_ENV_KEY}</key>
    <string>${ARGUS_POE_TARGET_URL_BASE_XML}</string>
    <key>${AMAZON_MARKETPLACE_ID_ENV_KEY}</key>
    <string>${AMAZON_MARKETPLACE_ID_XML}</string>
    <key>${ARGUS_SCALEINSIGHTS_COUNTRY_CODE_ENV_KEY}</key>
    <string>${ARGUS_SCALEINSIGHTS_COUNTRY_CODE_XML}</string>
    <key>${ARGUS_BRAND_METRICS_URL_BASE_ENV_KEY}</key>
    <string>${ARGUS_BRAND_METRICS_URL_BASE_XML}</string>
    <key>${ARGUS_BRAND_METRICS_DOWNLOAD_GLOB_ENV_KEY}</key>
    <string>${ARGUS_BRAND_METRICS_DOWNLOAD_GLOB_XML}</string>
    <key>${ARGUS_BRAND_METRICS_DOWNLOAD_BASENAME_ENV_KEY}</key>
    <string>${ARGUS_BRAND_METRICS_DOWNLOAD_BASENAME_XML}</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
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
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${HOME_XML}</string>
    <key>TARGONOS_ENV_MODE</key>
    <string>${TARGONOS_ENV_MODE}</string>
    <key>ARGUS_MARKET</key>
    <string>${MARKET}</string>
    <key>${ARGUS_MONITORING_ROOT_ENV_KEY}</key>
    <string>${ARGUS_MONITORING_ROOT_XML}</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
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
