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
  tail -200 "$LOG" > "$LOG.tmp"
  mv "$LOG.tmp" "$LOG"
  exit 1
fi

tail -200 "$LOG" > "$LOG.tmp"
mv "$LOG.tmp" "$LOG"
