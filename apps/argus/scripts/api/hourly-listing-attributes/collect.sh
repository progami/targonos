#!/bin/bash
# Hourly Listing Attributes (API) collector
# Runs SP-API listing + catalog tracking and writes:
#   - YYYY-MM-DD_HHmm_Listings-Snapshot.csv
#   - YYYY-MM-DD_HHmm_Listings-Changes.csv
#   - latest_state.json
#
# Destination:
# /Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/04 Sales/Monitoring/Hourly/Listing Attributes (API)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/hourly-listing-attributes-api.log"

echo "$(date '+%Y-%m-%d %H:%M:%S') — Starting hourly listing attributes collection" >> "$LOG"

if node "$SCRIPT_DIR/collect.mjs" >> "$LOG" 2>&1; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Collection OK" >> "$LOG"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Collection FAILED" >> "$LOG"
  exit 1
fi

tail -400 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
