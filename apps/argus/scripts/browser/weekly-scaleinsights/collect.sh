#!/bin/bash
# Weekly ScaleInsights Keyword Ranking export via Safari.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

load_monitoring_env

DEST="/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Weekly/ScaleInsights/KeywordRanking"
DL="$HOME/Downloads"
LOG="/tmp/weekly-scaleinsights.log"
TARGET_URL="https://portal.scaleinsights.com/KeywordRanking"

if [ "$#" -eq 2 ]; then
  START_DATE="$1"
  END_DATE="$2"
  IFS='|' read -r WEEK_NUM _ _ PREFIX <<<"$(week_context_for_end_date "$END_DATE")"
else
  IFS='|' read -r WEEK_NUM START_DATE END_DATE PREFIX <<<"$(latest_complete_week_context)"
fi

mkdir -p "$DEST"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
run_js() { osascript "$SAFARI_HELPER" run-js "$1" "$2" "$3"; }
wait_tab() { osascript "$SAFARI_HELPER" wait-tab "$1" "$2" >/dev/null; }
navigate_tab() { osascript "$SAFARI_HELPER" navigate-tab "$1" "$2" "$3" >/dev/null; }
tab_url() { osascript "$SAFARI_HELPER" get-url "$1" "$2"; }

log "Starting weekly ScaleInsights: $PREFIX"

tab_info=$(osascript "$SAFARI_HELPER" ensure-tab "$TARGET_URL" "portal.scaleinsights.com")
parse_tab_info "$tab_info"

navigate_tab "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX" "$TARGET_URL"
wait_tab "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX"

login_state_js='(() => {
  const href = location.href || "";
  const emailInput = document.querySelector("input[type=email], input[name*=email i], input[name*=username i], input[autocomplete=username]");
  const passwordInput = document.querySelector("input[type=password]");
  if (emailInput || passwordInput || /login|sign in/i.test(document.title || "") || href.includes("login")) return "LOGIN_REQUIRED";
  return "AUTHENTICATED";
})();'

login_state=""
for _ in $(seq 1 15); do
  login_state=$(run_js "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX" "$login_state_js")
  if [ -n "$login_state" ]; then
    break
  fi
  sleep 2
done

if [ "$login_state" = "LOGIN_REQUIRED" ]; then
  SCALEINSIGHTS_EMAIL=$(require_env SCALEINSIGHTS_EMAIL)
  SCALEINSIGHTS_PASSWORD=$(require_env SCALEINSIGHTS_PASSWORD)
  email_literal=$(js_string_literal "$SCALEINSIGHTS_EMAIL")
  password_literal=$(js_string_literal "$SCALEINSIGHTS_PASSWORD")
  login_js="(() => {
    const email = ${email_literal};
    const password = ${password_literal};
    const emailInput = document.querySelector('input[type=email], input[name*=email i], input[name*=username i], input[autocomplete=username]');
    if (emailInput) {
      emailInput.focus();
      emailInput.value = email;
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      emailInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const passwordInput = document.querySelector('input[type=password]');
    if (passwordInput) {
      passwordInput.focus();
      passwordInput.value = password;
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const submit = Array.from(document.querySelectorAll('button,input[type=submit],a')).find((el) => /sign in|log in|login/i.test((el.innerText || el.value || '').trim()));
    if (!submit) return 'NO_LOGIN_SUBMIT';
    submit.click();
    return 'LOGIN_SUBMITTED';
  })();"
  if [ "$(run_js "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX" "$login_js")" != "LOGIN_SUBMITTED" ]; then
    log "FAILED: ScaleInsights login submit not found"
    exit 1
  fi
  sleep 15
  wait_tab "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX"
fi

range_js="(() => {
  if (!window.jQuery) return 'NO_JQUERY';
  const picker = jQuery('#reportrange').data('daterangepicker');
  if (!picker) return 'NO_DATE_PICKER';
  picker.setStartDate('${START_DATE}');
  picker.setEndDate('${END_DATE}');
  picker.clickApply();
  return 'DATE_RANGE_SET';
})();"

range_status=""
for _ in $(seq 1 15); do
  range_status=$(run_js "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX" "$range_js")
  if [ "$range_status" = "DATE_RANGE_SET" ]; then
    break
  fi
  sleep 2
done

if [ "$range_status" != "DATE_RANGE_SET" ]; then
  current_url=$(tab_url "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX")
  log "FAILED: ScaleInsights date picker not found ($current_url)"
  log "FAILED: ScaleInsights date picker not found"
  exit 1
fi

sleep 15

download_payload_js='(() => {
  const link = Array.from(document.querySelectorAll("a,button")).find((el) => (el.innerText || el.textContent || "").trim() === "Download");
  if (!link) return JSON.stringify({ status: "NO_DOWNLOAD_BUTTON" });
  const request = new XMLHttpRequest();
  request.open("GET", link.href, false);
  request.overrideMimeType("text/plain; charset=x-user-defined");
  request.send();
  return JSON.stringify({
    status: request.status && request.status !== 200 ? `FETCH_FAILED_${request.status}` : "OK",
    content: request.responseText || ""
  });
})();'

download_payload=$(run_js "$SAFARI_WINDOW_ID" "$SAFARI_TAB_INDEX" "$download_payload_js")
download_status=$("$NODE_BIN" -e 'const payload = JSON.parse(process.argv[1]); process.stdout.write(payload.status || "");' "$download_payload")
if [ "$download_status" != "OK" ]; then
  log "FAILED: ScaleInsights download fetch returned $download_status"
  exit 1
fi

$NODE_BIN -e '
const fs = require("node:fs");
const path = require("node:path");
const payload = JSON.parse(process.argv[1]);
const target = process.argv[2];
const content = payload.content || "";
const buffer = Buffer.allocUnsafe(content.length);
for (let index = 0; index < content.length; index += 1) {
  buffer[index] = content.charCodeAt(index) & 0xff;
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, buffer);
' "$download_payload" "$DEST/${PREFIX}_SI-KeywordRanking.xlsx"

log "Saved: ${PREFIX}_SI-KeywordRanking.xlsx"
log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
