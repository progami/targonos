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
RUN_LOG_WRITER="$SCRIPT_DIR/../../lib/write-monitoring-run-log.mjs"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

echo "$(date '+%Y-%m-%d %H:%M:%S') — Starting hourly listing attributes collection" >> "$LOG"

if ! NODE_BIN="$(command -v node)"; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Node.js not found in PATH=$PATH" >> "$LOG"
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Collection FAILED" >> "$LOG"
  exit 1
fi

RUN_STARTED_AT_MS="$("$NODE_BIN" -e 'process.stdout.write(String(Date.now()))')"
RUN_STARTED_AT_ISO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
RUN_STATUS="ok"
RUN_SUMMARY="Hourly listing attributes completed successfully."
RUN_ERROR_MESSAGE=""

if "$NODE_BIN" "$SCRIPT_DIR/collect.mjs" >> "$LOG" 2>&1; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Collection OK" >> "$LOG"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Collection FAILED" >> "$LOG"
  RUN_STATUS="failed"
  RUN_SUMMARY="Hourly listing attributes collection failed."
  RUN_ERROR_MESSAGE="Hourly listing attributes collection failed."
fi

RUN_FINISHED_AT_MS="$("$NODE_BIN" -e 'process.stdout.write(String(Date.now()))')"
RUN_FINISHED_AT_ISO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
DURATION_MS=$((RUN_FINISHED_AT_MS - RUN_STARTED_AT_MS))
RUN_LOG_ARGS=(
  --job-id "hourly-listing-attributes-api"
  --status "$RUN_STATUS"
  --summary "$RUN_SUMMARY"
  --duration-ms "$DURATION_MS"
  --timestamp "$RUN_FINISHED_AT_ISO"
  --started-at "$RUN_STARTED_AT_ISO"
  --finished-at "$RUN_FINISHED_AT_ISO"
  --host "$(hostname)"
  --log-path "$LOG"
)

if [ -n "$RUN_ERROR_MESSAGE" ]; then
  RUN_LOG_ARGS+=(--error-message "$RUN_ERROR_MESSAGE")
fi

"$NODE_BIN" "$RUN_LOG_WRITER" "${RUN_LOG_ARGS[@]}"

if [ "$RUN_STATUS" = "failed" ]; then
  EMAIL_SUBJECT="Argus: Hourly Listing Attributes failed"
  LOG_TAIL="$(tail -200 "$LOG")"
  EMAIL_TEXT="$(printf "Hourly listing attributes API collection failed.\nHost: %s\nLog: %s\n\nLast log lines:\n%s\n" "$(hostname)" "$LOG" "$LOG_TAIL")"
  "$NODE_BIN" "$SCRIPT_DIR/../../lib/send-alert-email.mjs" --subject "$EMAIL_SUBJECT" --text "$EMAIL_TEXT"
  exit 1
fi

tail -400 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
