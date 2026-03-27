#!/bin/bash
# Weekly API Sources — Master Runner
# Collects all Monitoring API folders that run weekly:
#   - SP-API (Brand Analytics + Sales & Traffic)
#   - SP Ads API (Sponsored Products reports)
#   - Datadive API
#   - Sellerboard API URLs
#
# Usage:
#   bash apps/argus/scripts/weekly-api-sources/run.sh
#   bash apps/argus/scripts/weekly-api-sources/run.sh --dry-run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/weekly-api-sources.log"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

DRY_FLAG=""
START_DATE=""
END_DATE=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_FLAG="--dry-run"
      ;;
    --start-date)
      START_DATE="${2:-}"
      shift
      ;;
    --end-date)
      END_DATE="${2:-}"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
  shift
done

if [ -n "$START_DATE" ] && [ -z "$END_DATE" ] || [ -z "$START_DATE" ] && [ -n "$END_DATE" ]; then
  echo "Both --start-date and --end-date are required together." >&2
  exit 1
fi

DATE_FLAGS=""
if [ -n "$START_DATE" ]; then
  DATE_FLAGS="--start-date $START_DATE --end-date $END_DATE"
fi

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }

log "=== Weekly API Sources run starting ${DRY_FLAG:-live} ==="

if ! NODE_BIN="$(command -v node)"; then
  log "FAILED: Node.js not found in PATH=$PATH"
  exit 1
fi

FAILED=0

run_step() {
  local name="$1"
  local cmd="$2"
  log "Running: $name"
  if eval "$cmd" >> "$LOG" 2>&1; then
    log "OK: $name"
  else
    log "FAILED: $name"
    FAILED=$((FAILED + 1))
  fi
}

run_optional_step() {
  local name="$1"
  local cmd="$2"
  log "Running: $name"
  if eval "$cmd" >> "$LOG" 2>&1; then
    log "OK: $name"
  else
    log "WARN: $name unavailable (non-blocking)"
  fi
}

run_step "SP-API" "\"$NODE_BIN\" \"$SCRIPT_DIR/collect-spapi.mjs\" $DRY_FLAG $DATE_FLAGS"
run_optional_step "SP Ads API" "python3 \"$SCRIPT_DIR/collect-sp-ads.py\" $DRY_FLAG $DATE_FLAGS"
run_optional_step "Datadive API" "\"$NODE_BIN\" \"$SCRIPT_DIR/collect-datadive.mjs\" $DRY_FLAG"
run_optional_step "Datadive format repair" "\"$NODE_BIN\" \"$SCRIPT_DIR/repair-datadive-formats.mjs\" $DRY_FLAG"
run_step "Sellerboard API" "\"$NODE_BIN\" \"$SCRIPT_DIR/collect-sellerboard.mjs\" $DRY_FLAG $DATE_FLAGS"
run_step "Weekly label repair" "\"$NODE_BIN\" \"$SCRIPT_DIR/repair-week-labels.mjs\" $DRY_FLAG"

log "=== Weekly API Sources run done (failures=$FAILED) ==="

if [ -z "$DRY_FLAG" ]; then
  if [ $FAILED -gt 0 ]; then
    EMAIL_SUBJECT="Argus: Weekly API Sources failed ($FAILED)"
    LOG_TAIL="$(tail -200 "$LOG")"
    EMAIL_TEXT="$(printf "Weekly API Sources: %s script(s) failed.\nHost: %s\nLog: %s\n\nLast log lines:\n%s\n" "$FAILED" "$(hostname)" "$LOG" "$LOG_TAIL")"
    "$NODE_BIN" "$SCRIPT_DIR/../../lib/send-alert-email.mjs" --subject "$EMAIL_SUBJECT" --text "$EMAIL_TEXT"
    if ! osascript -e "display notification \"Weekly API sources: $FAILED script(s) failed\" with title \"Weekly API Sources\"" 2>/dev/null; then
      log "WARN: Failed to display failure notification (osascript)."
    fi
  else
    if ! osascript -e 'display notification "Weekly API sources completed" with title "Weekly API Sources"' 2>/dev/null; then
      log "WARN: Failed to display success notification (osascript)."
    fi
  fi
fi

tail -400 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"

if [ $FAILED -gt 0 ]; then
  exit 1
fi
