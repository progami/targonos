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
RUN_LOG_WRITER="$SCRIPT_DIR/../../lib/write-monitoring-run-log.mjs"
WPR_SYNC_SCRIPT="$SCRIPT_DIR/../../lib/sync-wpr-workspace.sh"
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

RUN_STARTED_AT_MS="$("$NODE_BIN" -e 'process.stdout.write(String(Date.now()))')"
RUN_STARTED_AT_ISO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
FAILED=0
declare -a FAILED_STEPS=()
declare -a WARN_STEPS=()

join_steps() {
  local result=""
  local step=""
  for step in "$@"; do
    if [ -n "$result" ]; then
      result="$result, "
    fi
    result="${result}${step}"
  done
  printf '%s' "$result"
}

run_step() {
  local name="$1"
  local cmd="$2"
  log "Running: $name"
  if eval "$cmd" >> "$LOG" 2>&1; then
    log "OK: $name"
  else
    log "FAILED: $name"
    FAILED_STEPS+=("$name")
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
    WARN_STEPS+=("$name")
  fi
}

run_step "SP-API" "\"$NODE_BIN\" \"$SCRIPT_DIR/collect-spapi.mjs\" $DRY_FLAG $DATE_FLAGS"
run_optional_step "SP Ads API" "python3 \"$SCRIPT_DIR/collect-sp-ads.py\" $DRY_FLAG $DATE_FLAGS"
run_optional_step "Datadive API" "\"$NODE_BIN\" \"$SCRIPT_DIR/collect-datadive.mjs\" $DRY_FLAG"
run_optional_step "Datadive format repair" "\"$NODE_BIN\" \"$SCRIPT_DIR/repair-datadive-formats.mjs\" $DRY_FLAG"
run_step "Sellerboard API" "\"$NODE_BIN\" \"$SCRIPT_DIR/collect-sellerboard.mjs\" $DRY_FLAG $DATE_FLAGS"
run_step "Weekly label repair" "\"$NODE_BIN\" \"$SCRIPT_DIR/repair-week-labels.mjs\" $DRY_FLAG"

if [ -z "$DRY_FLAG" ] && [ "$FAILED" -eq 0 ]; then
  run_step "WPR workspace sync" "bash \"$WPR_SYNC_SCRIPT\" --trigger weekly-api-sources"
fi

log "=== Weekly API Sources run done (failures=$FAILED) ==="

RUN_FINISHED_AT_MS="$("$NODE_BIN" -e 'process.stdout.write(String(Date.now()))')"
RUN_FINISHED_AT_ISO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
DURATION_MS=$((RUN_FINISHED_AT_MS - RUN_STARTED_AT_MS))
RUN_STATUS="ok"
RUN_SUMMARY="Weekly API sources completed successfully."
RUN_ERROR_MESSAGE=""
FAILED_STEPS_CSV=""
WARN_STEPS_CSV=""

if [ "${#WARN_STEPS[@]}" -gt 0 ]; then
  WARN_STEPS_CSV="$(join_steps "${WARN_STEPS[@]}")"
  log "Warn steps: $WARN_STEPS_CSV"
fi

if [ "$FAILED" -gt 0 ]; then
  FAILED_STEPS_CSV="$(join_steps "${FAILED_STEPS[@]}")"
  RUN_STATUS="failed"
  RUN_SUMMARY="$FAILED weekly API source step(s) failed: $FAILED_STEPS_CSV"
  RUN_ERROR_MESSAGE="Failed steps: $FAILED_STEPS_CSV"
  log "$RUN_ERROR_MESSAGE"
fi

RUN_LOG_ARGS=(
  --job-id "weekly-api-sources"
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

if [ -n "$FAILED_STEPS_CSV" ]; then
  RUN_LOG_ARGS+=(--failed-steps "$FAILED_STEPS_CSV")
fi

if [ -n "$WARN_STEPS_CSV" ]; then
  RUN_LOG_ARGS+=(--warn-steps "$WARN_STEPS_CSV")
fi

if [ -z "$DRY_FLAG" ]; then
  "$NODE_BIN" "$RUN_LOG_WRITER" "${RUN_LOG_ARGS[@]}"
fi

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
