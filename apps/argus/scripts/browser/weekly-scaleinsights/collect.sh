#!/bin/bash
# Weekly ScaleInsights Keyword Ranking export via Chrome.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

load_monitoring_env

DEST="${ARGUS_SCALEINSIGHTS_DEST:-$(argus_monitoring_root)/Weekly/ScaleInsights/KeywordRanking (Browser)}"
DL="${ARGUS_SCALEINSIGHTS_DOWNLOAD_DIR:-$HOME/Downloads}"
LOG="${ARGUS_SCALEINSIGHTS_LOG:-/tmp/weekly-scaleinsights.log}"
TARGET_URL="https://portal.scaleinsights.com/KeywordRanking"
COUNTRY_CODE="US"

if [ "$#" -eq 2 ]; then
  START_DATE="$1"
  END_DATE="$2"
  IFS='|' read -r WEEK_NUM _ _ PREFIX <<<"$(week_context_for_end_date "$END_DATE")"
else
  IFS='|' read -r WEEK_NUM START_DATE END_DATE PREFIX <<<"$(latest_complete_week_context)"
fi

mkdir -p "$DEST"

TAB_ID=""

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }
open_window() { TAB_ID="$(run_chrome_helper open-window-tab "$1")"; }
run_js() { run_chrome_helper run-js-tab-id "$TAB_ID" "$1"; }
wait_tab() { run_chrome_helper wait-tab-id "$TAB_ID" >/dev/null; }
tab_url() { run_chrome_helper get-url-tab-id "$TAB_ID"; }

log "Starting weekly ScaleInsights: $PREFIX"

open_window "$TARGET_URL"
wait_tab

login_state_js='(() => {
  const href = location.href || "";
  const emailInput = document.querySelector("input[type=email], input[name*=email i], input[name*=username i], input[autocomplete=username]");
  const passwordInput = document.querySelector("input[type=password]");
  if (emailInput || passwordInput || /login|sign in/i.test(document.title || "") || href.includes("login")) return "LOGIN_REQUIRED";
  return "AUTHENTICATED";
})();'

login_state=""
for _ in $(seq 1 15); do
  login_state=$(run_js "$login_state_js")
  if [ -n "$login_state" ]; then
    break
  fi
  sleep 2
done

if [ "$login_state" = "LOGIN_REQUIRED" ]; then
  SCALEINSIGHTS_EMAIL="$(bitwarden_login_username "portal.scaleinsights.com" "jarrar@targonglobal.com")"
  SCALEINSIGHTS_PASSWORD="$(bitwarden_login_password "portal.scaleinsights.com" "jarrar@targonglobal.com")"
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
  if [ "$(run_js "$login_js")" != "LOGIN_SUBMITTED" ]; then
    log "FAILED: ScaleInsights login submit not found"
    exit 1
  fi
  sleep 15
  wait_tab
fi

download_url="${TARGET_URL}?countrycode=${COUNTRY_CODE}&from=${START_DATE}&to=${END_DATE}&handler=Excel"
compact_start="${START_DATE//-/}"
compact_end="${END_DATE//-/}"
download_pattern="$DL/KeywordRanking_${COUNTRY_CODE}_${compact_start}_${compact_end}*.xlsx"
baseline_info="$(latest_matching_file "$download_pattern")"
baseline_path=""
baseline_mtime="0"
baseline_ctime="0"
baseline_size="0"

if [ -n "$baseline_info" ]; then
  IFS='|' read -r baseline_path baseline_mtime baseline_ctime baseline_size <<<"$baseline_info"
fi

log "Watching ScaleInsights download pattern: $download_pattern"

open_window "$download_url"
sleep 2

if ! downloaded_file="$(wait_for_new_matching_file "$download_pattern" "$baseline_path" "$baseline_mtime" "$baseline_ctime" "$baseline_size" 120)"; then
  latest_after_timeout="$(latest_matching_file "$download_pattern")"
  if [ -n "$latest_after_timeout" ]; then
    log "Latest ScaleInsights match after timeout: $latest_after_timeout"
  else
    log "Latest ScaleInsights match after timeout: none"
  fi
  log "FAILED: ScaleInsights download did not create an XLSX for $download_url"
  exit 1
fi

copy_file_with_node "$downloaded_file" "$DEST/${PREFIX}_SI-KeywordRanking.xlsx"

log "Saved: ${PREFIX}_SI-KeywordRanking.xlsx"
log "Done"
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
