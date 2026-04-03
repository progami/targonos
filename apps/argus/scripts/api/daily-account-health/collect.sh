#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/daily-account-health.log"
RUN_LOG_WRITER="$SCRIPT_DIR/../../lib/write-monitoring-run-log.mjs"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if ! NODE_BIN="$(command -v node)"; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Collection FAILED (node not found in PATH=$PATH)" >> "$LOG"
  exit 1
fi

RUN_STARTED_AT_MS="$("$NODE_BIN" -e 'process.stdout.write(String(Date.now()))')"
RUN_STARTED_AT_ISO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
RUN_STATUS="ok"
RUN_SUMMARY="Daily account health completed successfully."
RUN_ERROR_MESSAGE=""

echo "$(date '+%Y-%m-%d %H:%M:%S') — Starting account health API collection" >> "$LOG"

if "$NODE_BIN" "$SCRIPT_DIR/collect.mjs" >> "$LOG" 2>&1; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Collection OK" >> "$LOG"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Collection FAILED" >> "$LOG"
  RUN_STATUS="failed"
  RUN_SUMMARY="Daily account health collection failed."
  RUN_ERROR_MESSAGE="Daily account health collection failed."
fi

RUN_FINISHED_AT_MS="$("$NODE_BIN" -e 'process.stdout.write(String(Date.now()))')"
RUN_FINISHED_AT_ISO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
DURATION_MS=$((RUN_FINISHED_AT_MS - RUN_STARTED_AT_MS))
RUN_LOG_ARGS=(
  --job-id "daily-account-health"
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
  EMAIL_SUBJECT="Argus: Account Health API failed"
  LOG_TAIL="$(tail -200 "$LOG")"
  EMAIL_TEXT="$(printf "Daily account health API collection failed.\nHost: %s\nLog: %s\n\nLast log lines:\n%s\n" "$(hostname)" "$LOG" "$LOG_TAIL")"
  "$NODE_BIN" "$SCRIPT_DIR/../../lib/send-alert-email.mjs" --subject "$EMAIL_SUBJECT" --text "$EMAIL_TEXT" >> "$LOG" 2>&1
  tail -200 "$LOG" > "$LOG.tmp"
  mv "$LOG.tmp" "$LOG"
  exit 1
fi

tail -200 "$LOG" > "$LOG.tmp"
mv "$LOG.tmp" "$LOG"
