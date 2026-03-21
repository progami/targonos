#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/daily-account-health.log"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if ! NODE_BIN="$(command -v node)"; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Collection FAILED (node not found in PATH=$PATH)" >> "$LOG"
  exit 1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') — Starting account health API collection" >> "$LOG"

if "$NODE_BIN" "$SCRIPT_DIR/collect.mjs" >> "$LOG" 2>&1; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Collection OK" >> "$LOG"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') — Collection FAILED" >> "$LOG"
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
