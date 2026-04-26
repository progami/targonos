#!/bin/bash
# Weekly Browser Sources — Master Runner
# Calls each weekly collection script in sequence.
# Runs Monday 3 AM CT via launchd.
#
# Uses Chrome for Seller Central, ScaleInsights, and Brand Metrics browser capture.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

MARKET="us"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --market)
      if [ "$#" -lt 2 ]; then
        echo "--market requires us or uk." >&2
        exit 1
      fi
      MARKET="$2"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
  shift
done

case "$MARKET" in
  us|uk)
    export ARGUS_MARKET="$MARKET"
    ;;
  *)
    echo "Unsupported market: $MARKET" >&2
    exit 1
    ;;
esac

if [ "$MARKET" = "us" ]; then
  LOG="/tmp/weekly-browser-sources.log"
else
  LOG="/tmp/weekly-browser-sources-$MARKET.log"
fi
RUN_LOG_WRITER="$REPO_ROOT/apps/argus/scripts/lib/write-monitoring-run-log.mjs"
WPR_SYNC_SCRIPT="$REPO_ROOT/apps/argus/scripts/lib/sync-wpr-workspace.sh"
RUN_STARTED_AT_MS="$("$NODE_BIN" -e 'process.stdout.write(String(Date.now()))')"
RUN_STARTED_AT_ISO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
BRAND_METRICS_SOURCE_LIMIT_NOTE="$("$NODE_BIN" "$SCRIPT_DIR/brand-metrics-availability.mjs" source-limit-note)"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
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

append_detail_log_tail() {
  local detail_log="$1"
  if [ ! -f "$detail_log" ]; then
    log "Detail log missing: $detail_log"
    return
  fi

  log "Recent detail from $detail_log:"
  while IFS= read -r line; do
    log "  $line"
  done < <(tail -10 "$detail_log")
}

log "=== Weekly Master Run Starting (market=$MARKET) ==="

ensure_chrome_browser
sleep 2

FAILED=0
declare -a FAILED_STEPS=()

run_script() {
  local name="$1"
  local script="$2"
  local detail_log="$3"
  log "Running: $name"
  if ARGUS_MARKET="$MARKET" bash "$script"; then
    log "OK: $name"
  else
    local exit_code=$?
    log "FAILED: $name (exit $exit_code)"
    append_detail_log_tail "$detail_log"
    FAILED_STEPS+=("$name")
    FAILED=$((FAILED + 1))
  fi
  sleep 5
}

run_script "Category Insights" "$SCRIPT_DIR/weekly-category-insights/collect.sh" "/tmp/weekly-category-insights.log"
run_script "Product Opportunity Explorer" "$SCRIPT_DIR/weekly-poe/collect.sh" "/tmp/weekly-poe.log"
run_script "ScaleInsights" "$SCRIPT_DIR/weekly-scaleinsights/collect.sh" "/tmp/weekly-scaleinsights.log"
log "Brand Metrics note: $BRAND_METRICS_SOURCE_LIMIT_NOTE"
run_script "Brand Metrics" "$SCRIPT_DIR/weekly-brand-metrics/collect.sh" "/tmp/weekly-brand-metrics.log"

if [ "$FAILED" -eq 0 ]; then
  log "Running: WPR workspace sync"
  if bash "$WPR_SYNC_SCRIPT" --market "$MARKET" --trigger weekly-browser-sources >> "$LOG" 2>&1; then
    log "OK: WPR workspace sync"
  else
    local_exit_code=$?
    log "FAILED: WPR workspace sync (exit $local_exit_code)"
    FAILED_STEPS+=("WPR workspace sync")
    FAILED=$((FAILED + 1))
  fi
fi

log "=== Weekly Master Run Done ($FAILED failures) ==="

RUN_FINISHED_AT_MS="$("$NODE_BIN" -e 'process.stdout.write(String(Date.now()))')"
RUN_FINISHED_AT_ISO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
DURATION_MS=$((RUN_FINISHED_AT_MS - RUN_STARTED_AT_MS))
RUN_STATUS="ok"
RUN_SUMMARY="All 4 weekly browser collectors completed. $BRAND_METRICS_SOURCE_LIMIT_NOTE"
RUN_ERROR_MESSAGE=""
FAILED_STEPS_CSV=""

if [ "$FAILED" -gt 0 ]; then
  FAILED_STEPS_CSV="$(join_steps "${FAILED_STEPS[@]}")"
  RUN_STATUS="failed"
  RUN_SUMMARY="$FAILED of 4 weekly browser collectors failed: $FAILED_STEPS_CSV"
  RUN_ERROR_MESSAGE="Failed steps: $FAILED_STEPS_CSV"
  log "$RUN_ERROR_MESSAGE"
fi

RUN_LOG_ARGS=(
  --job-id "weekly-browser-sources"
  --market "$MARKET"
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

"$NODE_BIN" "$RUN_LOG_WRITER" "${RUN_LOG_ARGS[@]}"

if [ "$FAILED" -gt 0 ]; then
  EMAIL_SUBJECT="Argus: Weekly Browser Sources failed ($FAILED)"
  LOG_TAIL="$(tail -200 "$LOG")"
  EMAIL_TEXT="$(printf "Weekly browser sources: %s script(s) failed.\nHost: %s\nLog: %s\n\nLast log lines:\n%s\n" "$FAILED" "$(hostname)" "$LOG" "$LOG_TAIL")"
  "$NODE_BIN" "$REPO_ROOT/apps/argus/scripts/lib/send-alert-email.mjs" --subject "$EMAIL_SUBJECT" --text "$EMAIL_TEXT"
  osascript -e "display notification \"Weekly sources: $FAILED script(s) failed\" with title \"Weekly Monitor\"" 2>/dev/null
else
  osascript -e 'display notification "Weekly sources: All collections complete" with title "Weekly Monitor"' 2>/dev/null
fi

tail -400 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
