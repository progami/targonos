#!/bin/bash
# Weekly Brand Metrics CSV export via Chrome.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

DEST="${ARGUS_BRAND_METRICS_DEST:-/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Weekly/Ad Console/Brand Metrics (Browser)}"
DL="${ARGUS_BRAND_METRICS_DOWNLOAD_DIR:-$HOME/Downloads}"
LOG="${ARGUS_BRAND_METRICS_LOG:-/tmp/weekly-brand-metrics.log}"
TARGET_URL_BASE="https://advertising.amazon.com/bb/bm/overview?entityId=ENTITY2JBRT701DBI1P&brand=1113309&category=228899"
DOWNLOAD_PATTERN="$DL/Caelum_Star_*_Overview_*.csv"

if [ "$#" -eq 2 ]; then
  REQUEST_MODE="explicit-week"
  REQUESTED_START_DATE="$1"
  REQUESTED_END_DATE="$2"
  TARGET_URL="${TARGET_URL_BASE}&startDate=${REQUESTED_START_DATE}&endDate=${REQUESTED_END_DATE}"
else
  REQUEST_MODE="last-available-week"
  REQUESTED_START_DATE=""
  REQUESTED_END_DATE=""
  TARGET_URL="$TARGET_URL_BASE"
fi

mkdir -p "$DEST"

TAB_ID=""

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
open_window() { TAB_ID="$(run_chrome_helper open-window-tab "$1")"; }
run_js() { run_chrome_helper run-js-tab-id "$TAB_ID" "$1"; }
wait_tab() { run_chrome_helper wait-tab-id "$TAB_ID" >/dev/null; }
tab_url() { run_chrome_helper get-url-tab-id "$TAB_ID"; }

json_field() {
  "$NODE_BIN" -e '
const payload = JSON.parse(process.argv[1]);
const key = process.argv[2];
const value = payload[key];
process.stdout.write(value == null ? "" : String(value));
' "$1" "$2"
}

page_state() {
  run_js '(() => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const bodyText = clean(document.body ? document.body.innerText : "");
    const dateButton = Array.from(document.querySelectorAll("button")).find((el) =>
      clean(el.innerText || el.textContent).startsWith("Date range")
    );
    const exportButton = Array.from(document.querySelectorAll("button")).find((el) =>
      clean(el.innerText || el.textContent) === "Export"
    );
    const currentPeriod = bodyText.match(/Current period \(([^)]+)\)/)?.[1] || "";
    const noData = bodyText.includes("No data available");
    const loginRequired =
      location.href.includes("signin") ||
      location.href.includes("/ap/") ||
      /sign in|enter the characters you see below|solve this puzzle/i.test(bodyText);

    return JSON.stringify({
      href: location.href || "",
      title: document.title || "",
      dateButtonText: clean(dateButton?.innerText || dateButton?.textContent || ""),
      exportPresent: Boolean(exportButton),
      currentPeriod,
      noData,
      loginRequired,
    });
  })();'
}

wait_for_page_state() {
  local expected_current_period="${1:-}"
  local payload=""
  local export_present=""
  local current_period=""
  local login_required=""

  for _ in $(seq 1 60); do
    payload="$(page_state)"
    export_present="$(json_field "$payload" exportPresent)"
    current_period="$(json_field "$payload" currentPeriod)"
    login_required="$(json_field "$payload" loginRequired)"

    if [ "$login_required" = "true" ]; then
      printf '%s\n' "$payload"
      return 1
    fi

    if [ "$export_present" = "true" ]; then
      if [ -z "$expected_current_period" ] && [ -n "$current_period" ]; then
        printf '%s\n' "$payload"
        return 0
      fi
      if [ "$current_period" = "$expected_current_period" ]; then
        printf '%s\n' "$payload"
        return 0
      fi
    fi

    sleep 2
  done

  printf '%s\n' "$payload"
  return 1
}

expected_current_period() {
  "$PYTHON_BIN" - "$1" "$2" <<'PY'
from datetime import date
import sys

start = date.fromisoformat(sys.argv[1])
end = date.fromisoformat(sys.argv[2])
print(f"{start.strftime('%b %d')} - {end.strftime('%b %d')}")
PY
}

open_date_picker() {
  run_js '(() => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const button = Array.from(document.querySelectorAll("button")).find((el) =>
      clean(el.innerText || el.textContent).startsWith("Date range")
    );
    if (!button) return "NO_DATE_BUTTON";
    button.click();
    return "DATE_PICKER_OPENED";
  })();'
}

apply_last_available_week() {
  run_js '(() => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const option = Array.from(document.querySelectorAll("[role=option], button, div, span")).find((el) =>
      clean(el.innerText || el.textContent) === "Last available week"
    );
    if (!option) return "NO_LAST_AVAILABLE_WEEK_OPTION";
    option.click();
    const save = Array.from(document.querySelectorAll("button")).find((el) =>
      clean(el.innerText || el.textContent) === "Save"
    );
    if (!save) return "NO_SAVE_BUTTON";
    save.click();
    return "LAST_AVAILABLE_WEEK_SAVED";
  })();'
}

click_export() {
  run_js '(() => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const button = Array.from(document.querySelectorAll("button")).find((el) =>
      clean(el.innerText || el.textContent) === "Export"
    );
    if (!button) return "NO_EXPORT_BUTTON";
    button.click();
    return "EXPORT_CLICKED";
  })();'
}

csv_context() {
  "$NODE_BIN" -e '
const fs = require("node:fs");

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === "\"") {
        if (line[index + 1] === "\"") {
          value += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += char;
      }
    } else if (char === "\"") {
      inQuotes = true;
    } else if (char === ",") {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value);
  return values;
}

function toIso(raw) {
  const match = String(raw || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

const filePath = process.argv[1];
const contents = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
const lines = contents.split(/\r?\n/).filter(Boolean);
if (lines.length < 2) {
  throw new Error("Brand Metrics CSV is missing data rows");
}

const header = parseCsvLine(lines[0]);
const firstRow = parseCsvLine(lines[1]);
const startIndex = header.indexOf("Start Date");
const endIndex = header.indexOf("End Date");
const brandIndex = header.indexOf("Brand");
const categoryIndex = header.indexOf("Category");
if (startIndex === -1 || endIndex === -1) {
  throw new Error("Brand Metrics CSV is missing Start Date or End Date");
}

const payload = {
  startRaw: firstRow[startIndex] || "",
  endRaw: firstRow[endIndex] || "",
  startIso: toIso(firstRow[startIndex] || ""),
  endIso: toIso(firstRow[endIndex] || ""),
  brand: firstRow[brandIndex] || "",
  category: firstRow[categoryIndex] || "",
  rowCount: lines.length - 1,
  headerCount: header.length,
};

process.stdout.write(JSON.stringify(payload));
' "$1"
}

is_full_week_range() {
  "$PYTHON_BIN" - "$1" "$2" <<'PY'
from datetime import date
import sys

start = date.fromisoformat(sys.argv[1])
end = date.fromisoformat(sys.argv[2])
print("true" if (end - start).days == 6 else "false")
PY
}

download_export() {
  local expected_start="${1:-}"
  local expected_end="${2:-}"
  local baseline_info=""
  local baseline_path=""
  local baseline_mtime="0"
  local baseline_ctime="0"
  local baseline_size="0"
  local downloaded_file=""
  local export_status=""
  local payload=""
  local start_iso=""
  local end_iso=""
  local is_full_week=""
  local row_count=""

  for attempt in $(seq 1 3); do
    baseline_info="$(latest_matching_file "$DOWNLOAD_PATTERN")"
    if [ -n "$baseline_info" ]; then
      IFS='|' read -r baseline_path baseline_mtime baseline_ctime baseline_size <<<"$baseline_info"
    else
      baseline_path=""
      baseline_mtime="0"
      baseline_ctime="0"
      baseline_size="0"
    fi

    export_status="$(click_export)"
    if [ "$export_status" != "EXPORT_CLICKED" ]; then
      log "FAILED: Brand Metrics export click failed ($export_status)"
      return 1
    fi

    if ! downloaded_file="$(wait_for_new_matching_file "$DOWNLOAD_PATTERN" "$baseline_path" "$baseline_mtime" "$baseline_ctime" "$baseline_size" 120)"; then
      latest_after_timeout="$(latest_matching_file "$DOWNLOAD_PATTERN")"
      if [ -n "$latest_after_timeout" ]; then
        log "Latest Brand Metrics match after timeout: $latest_after_timeout"
      else
        log "Latest Brand Metrics match after timeout: none"
      fi
      log "FAILED: Brand Metrics export did not create a CSV download"
      return 1
    fi

    payload="$(csv_context "$downloaded_file")"
    start_iso="$(json_field "$payload" startIso)"
    end_iso="$(json_field "$payload" endIso)"
    row_count="$(json_field "$payload" rowCount)"

    if [ -n "$start_iso" ] && [ -n "$end_iso" ]; then
      is_full_week="$(is_full_week_range "$start_iso" "$end_iso")"
    else
      is_full_week="false"
    fi

    if [ "$row_count" = "7" ] && [ "$is_full_week" = "true" ]; then
      if [ -z "$expected_start" ] || { [ "$start_iso" = "$expected_start" ] && [ "$end_iso" = "$expected_end" ]; }; then
        printf '%s|%s\n' "$downloaded_file" "$payload"
        return 0
      fi
    fi

    log "Retrying Brand Metrics export after invalid CSV: start=${start_iso:-missing} end=${end_iso:-missing} rows=${row_count:-missing} attempt=${attempt}"
    rm -f "$downloaded_file"
    sleep 5
  done

  return 1
}

log "Starting weekly Brand Metrics (${REQUEST_MODE})"

open_window "$TARGET_URL"
sleep 8
wait_tab

current_url="$(tab_url)"
if [[ "$current_url" == *"signin"* || "$current_url" == *"/ap/"* ]]; then
  log "FAILED: Brand Metrics requires an authenticated Chrome session"
  exit 1
fi

initial_state="$(page_state)"
if [ "$(json_field "$initial_state" loginRequired)" = "true" ]; then
  log "FAILED: Brand Metrics landed on a login or challenge page"
  exit 1
fi

if [ "$REQUEST_MODE" = "explicit-week" ]; then
  expected_period="$(expected_current_period "$REQUESTED_START_DATE" "$REQUESTED_END_DATE")"
  if ! settled_state="$(wait_for_page_state "$expected_period")"; then
    log "FAILED: Brand Metrics did not settle on requested current period ($expected_period)"
    exit 1
  fi
else
  if [ "$(open_date_picker)" != "DATE_PICKER_OPENED" ]; then
    log "FAILED: Brand Metrics date picker button not found"
    exit 1
  fi
  selection_status="$(apply_last_available_week)"
  if [ "$selection_status" != "LAST_AVAILABLE_WEEK_SAVED" ]; then
    log "FAILED: Brand Metrics last available week selection failed ($selection_status)"
    exit 1
  fi
  if ! settled_state="$(wait_for_page_state)"; then
    log "FAILED: Brand Metrics did not settle on a usable export state"
    exit 1
  fi
fi

actual_url="$(json_field "$settled_state" href)"
current_period="$(json_field "$settled_state" currentPeriod)"
date_button_text="$(json_field "$settled_state" dateButtonText)"
log "Settled Brand Metrics page: ${date_button_text:-unknown} | ${current_period:-unknown} | ${actual_url:-unknown}"

if ! download_result="$(download_export "$REQUESTED_START_DATE" "$REQUESTED_END_DATE")"; then
  log "FAILED: Brand Metrics export validation failed"
  exit 1
fi

IFS='|' read -r downloaded_file csv_payload <<<"$download_result"
ACTUAL_START_DATE="$(json_field "$csv_payload" startIso)"
ACTUAL_END_DATE="$(json_field "$csv_payload" endIso)"
ACTUAL_BRAND="$(json_field "$csv_payload" brand)"
ACTUAL_CATEGORY="$(json_field "$csv_payload" category)"

IFS='|' read -r WEEK_NUM START_DATE END_DATE PREFIX <<<"$(week_context_for_end_date "$ACTUAL_END_DATE")"
TARGET_FILE="$DEST/${PREFIX}_BrandMetrics.csv"
copy_file_with_node "$downloaded_file" "$TARGET_FILE"

log "Saved: ${PREFIX}_BrandMetrics.csv"
log "CSV details: brand=${ACTUAL_BRAND:-unknown} category=${ACTUAL_CATEGORY:-unknown} range=${ACTUAL_START_DATE}..${ACTUAL_END_DATE}"
log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
