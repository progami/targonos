#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
MARKET=""
MONITORING_ROOT=""
WPR_DATA_DIR=""
DRY_RUN="false"

load_env_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return 0
  fi

  local export_lines
  export_lines="$(python3 - "$file" <<'PY'
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
        print(f"export {key}={shlex.quote(value)}")
PY
)"

  if [ -n "$export_lines" ]; then
    eval "$export_lines"
  fi
}

load_env_file "$REPO_ROOT/apps/argus/.env.local"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --market)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --market" >&2
        exit 1
      fi
      MARKET="$2"
      shift
      ;;
    --monitoring-root)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --monitoring-root" >&2
        exit 1
      fi
      MONITORING_ROOT="$2"
      shift
      ;;
    --wpr-data-dir)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --wpr-data-dir" >&2
        exit 1
      fi
      WPR_DATA_DIR="$2"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
  shift
done

if [ "$MARKET" != "us" ] && [ "$MARKET" != "uk" ]; then
  echo "Expected --market us or --market uk" >&2
  exit 1
fi

MARKET_SUFFIX="$(printf '%s' "$MARKET" | tr '[:lower:]' '[:upper:]')"

if [ -z "$MONITORING_ROOT" ]; then
  env_name="ARGUS_MONITORING_ROOT_${MARKET_SUFFIX}"
  if [ -z "${!env_name+x}" ]; then
    echo "Missing --monitoring-root for market=$MARKET" >&2
    exit 1
  fi
  MONITORING_ROOT="${!env_name}"
fi

if [ -z "$WPR_DATA_DIR" ]; then
  env_name="WPR_DATA_DIR_${MARKET_SUFFIX}"
  if [ -z "${!env_name+x}" ]; then
    echo "Missing --wpr-data-dir for market=$MARKET" >&2
    exit 1
  fi
  WPR_DATA_DIR="${!env_name}"
fi

if [[ "$MONITORING_ROOT" == *"/Library/CloudStorage/"* ]]; then
  echo "ARGUS_MONITORING_ROOT_${MARKET_SUFFIX} must be local, not a Google Drive mount: $MONITORING_ROOT" >&2
  exit 1
fi

if [[ "$WPR_DATA_DIR" == *"/Library/CloudStorage/"* ]]; then
  echo "WPR_DATA_DIR_${MARKET_SUFFIX} must be local, not a Google Drive mount: $WPR_DATA_DIR" >&2
  exit 1
fi

MONITORING_PATHS=(
  "Hourly/Listing Attributes (API)"
  "Daily/Account Health Dashboard (API)"
  "Daily/Visuals (Browser)"
  "Daily/Voice of the Customer (Manual)"
  "Weekly/Amazon Inventory Ledger (API)"
  "Weekly/Ad Console/SP - Sponsored Products (API)/SP - Advertised Product Report (API)"
  "Weekly/Ad Console/SP - Sponsored Products (API)/SP - Campaign Report (API)"
  "Weekly/Ad Console/SP - Sponsored Products (API)/SP - Placement Report (API)"
  "Weekly/Ad Console/SP - Sponsored Products (API)/SP - Purchased Product Report (API)"
  "Weekly/Ad Console/SP - Sponsored Products (API)/SP - Search Term Report (API)"
  "Weekly/Ad Console/SP - Sponsored Products (API)/SP - Targeting Report (API)"
  "Weekly/Ad Console/Brand Metrics (Browser)"
  "Weekly/Brand Analytics (API)/SCP - Search Catalog Performance (API)"
  "Weekly/Brand Analytics (API)/SQP - Search Query Performance (API)"
  "Weekly/Brand Analytics (API)/TST - Top Search Terms (API)"
  "Weekly/Business Reports (API)/Sales & Traffic (API)"
  "Weekly/Category Insights (Browser)"
  "Weekly/Datadive (API)/DD-Competitors - Datadive Competitors (API)"
  "Weekly/Datadive (API)/DD-Keywords - Datadive Keywords (API)"
  "Weekly/Datadive (API)/Rank Radar - Datadive Rank Radar (API)"
  "Weekly/Product Opportunity Explorer (Browser)"
  "Weekly/ScaleInsights/KeywordRanking (Browser)"
  "Weekly/Sellerboard (API)/SB - Dashboard Report (API)"
  "Weekly/Sellerboard (API)/SB - Orders Report (API)"
  "Logs/tracking-fetch"
  "Logs/hourly-listing-attributes-api"
  "Logs/daily-account-health"
  "Logs/daily-visuals"
  "Logs/weekly-api-sources"
  "Logs/weekly-api-sources/metadata"
  "Logs/weekly-browser-sources"
  "Logs/sellerboard-sync"
  "Logs/nightly-app-routes"
)

echo "market=$MARKET"
echo "monitoring_root=$MONITORING_ROOT"
echo "wpr_data_dir=$WPR_DATA_DIR"

for relative_path in "${MONITORING_PATHS[@]}"; do
  target="$MONITORING_ROOT/$relative_path"
  if [ "$DRY_RUN" = "true" ]; then
    echo "mkdir -p $target"
  else
    mkdir -p "$target"
    echo "created Monitoring/$relative_path"
  fi
done

if [ "$DRY_RUN" = "true" ]; then
  echo "mkdir -p $WPR_DATA_DIR"
else
  mkdir -p "$WPR_DATA_DIR"
  echo "created WPR_DATA_DIR"
fi
