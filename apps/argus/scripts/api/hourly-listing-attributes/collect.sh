#!/bin/bash
# Hourly Listing Attributes (API) collector
# Runs SP-API listing + catalog tracking and appends to:
#   - Listings-Snapshot-History.csv
#   - Listings-Changes-History.csv
#   - latest_state.json
#
# Destination:
# /Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Hourly/Listing Attributes (API)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/hourly-listing-attributes-api.log"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

echo "$(date '+%Y-%m-%d %H:%M:%S') — Starting hourly listing attributes collection" >> "$LOG"

if ! NODE_BIN="$(command -v node)"; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Node.js not found in PATH=$PATH" >> "$LOG"
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Collection FAILED" >> "$LOG"
  exit 1
fi

if "$NODE_BIN" "$SCRIPT_DIR/collect.mjs" >> "$LOG" 2>&1; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Collection OK" >> "$LOG"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Collection FAILED" >> "$LOG"
  exit 1
fi

tail -400 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
