#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
MARKET=""
SALES_ROOT=""
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
    --sales-root)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --sales-root" >&2
        exit 1
      fi
      SALES_ROOT="$2"
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

if [ -z "$SALES_ROOT" ]; then
  env_name="ARGUS_SALES_ROOT_$(printf '%s' "$MARKET" | tr '[:lower:]' '[:upper:]')"
  if [ -z "${!env_name+x}" ]; then
    echo "Missing --sales-root for market=$MARKET" >&2
    exit 1
  fi
  SALES_ROOT="${!env_name}"
fi

if [ -z "$SALES_ROOT" ]; then
  echo "Missing --sales-root for market=$MARKET" >&2
  exit 1
fi

PATHS=(
  "Monitoring/Hourly/Listing Attributes (API)"
  "Monitoring/Daily/Account Health Dashboard (API)"
  "Monitoring/Daily/Visuals (Browser)"
  "Monitoring/Daily/Voice of the Customer (Manual)"
  "Monitoring/Weekly/Amazon Inventory Ledger (API)"
  "Monitoring/Weekly/Ad Console/SP - Sponsored Products (API)"
  "Monitoring/Weekly/Ad Console/Brand Metrics (Browser)"
  "Monitoring/Weekly/Brand Analytics (API)/SCP - Search Catalog Performance (API)"
  "Monitoring/Weekly/Brand Analytics (API)/SQP - Search Query Performance (API)"
  "Monitoring/Weekly/Brand Analytics (API)/TST - Top Search Terms (API)"
  "Monitoring/Weekly/Business Reports (API)/Sales & Traffic (API)"
  "Monitoring/Weekly/Category Insights (Browser)"
  "Monitoring/Weekly/Datadive (API)/DD-Competitors - Datadive Competitors (API)"
  "Monitoring/Weekly/Datadive (API)/DD-Keywords - Datadive Keywords (API)"
  "Monitoring/Weekly/Datadive (API)/Rank Radar - Datadive Rank Radar (API)"
  "Monitoring/Weekly/Product Opportunity Explorer (Browser)"
  "Monitoring/Weekly/ScaleInsights/KeywordRanking (Browser)"
  "Monitoring/Weekly/Sellerboard (API)/SB - Dashboard Report (API)"
  "Monitoring/Weekly/Sellerboard (API)/SB - Orders Report (API)"
  "Monitoring/Logs/tracking-fetch"
  "Monitoring/Logs/hourly-listing-attributes-api"
  "Monitoring/Logs/daily-account-health"
  "Monitoring/Logs/daily-visuals"
  "Monitoring/Logs/weekly-api-sources"
  "Monitoring/Logs/weekly-browser-sources"
  "Monitoring/Logs/sellerboard-sync"
  "WPR/wpr-workspace/output"
)

echo "market=$MARKET"
echo "sales_root=$SALES_ROOT"

for relative_path in "${PATHS[@]}"; do
  target="$SALES_ROOT/$relative_path"
  if [ "$DRY_RUN" = "true" ]; then
    echo "mkdir -p $target"
  else
    mkdir -p "$target"
    echo "created $relative_path"
  fi
done
