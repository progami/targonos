#!/bin/bash
# Seller Central / Amazon relogin flow via Safari + Google Voice OTP.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

load_monitoring_env

TARGET_URL="${1:-https://sellercentral.amazon.com/home}"
SC_EMAIL="${SELLER_CENTRAL_EMAIL:-jarrar@targonglobal.com}"
SC_PASSWORD="${SELLER_CENTRAL_PASSWORD:-}"
GOOGLE_EMAIL="${GOOGLE_EMAIL:-$SC_EMAIL}"
GOOGLE_PASSWORD="${GOOGLE_PASSWORD:-}"
LOG="/tmp/sc-relogin.log"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }

run_js() {
  osascript "$SAFARI_HELPER" run-js "$1" "$2" "$3"
}

wait_tab() {
  osascript "$SAFARI_HELPER" wait-tab "$1" "$2" >/dev/null
}

focus_tab() {
  osascript "$SAFARI_HELPER" focus-tab "$1" "$2" >/dev/null
}

navigate_tab() {
  osascript "$SAFARI_HELPER" navigate-tab "$1" "$2" "$3" >/dev/null
}

current_url() {
  osascript "$SAFARI_HELPER" get-url "$1" "$2"
}

inspect_seller_state() {
  local window_id="$1"
  local tab_index="$2"
  local js='(() => {
    const clean = (value) => (value || "").replace(/[|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim();
    const href = clean(location.href || "");
    const title = clean(document.title || "");
    const body = document.body ? clean(document.body.innerText || "") : "";
    if (!href.includes("signin") && !href.includes("/ap/") && !/sign in|enter the characters you see below|solve this puzzle/i.test(body)) {
      return ["AUTHENTICATED", href, title].join("|");
    }
    if (document.getElementById("auth-mfa-otpcode")) return ["OTP", href, title].join("|");
    if (document.getElementById("ap_password")) return ["PASSWORD", href, title].join("|");
    if (document.getElementById("ap_email")) return ["EMAIL", href, title].join("|");
    if (/enter the characters you see below|solve this puzzle/i.test(body)) return ["CAPTCHA", href, title].join("|");
    return ["UNKNOWN", href, title].join("|");
  })();'
  run_js "$window_id" "$tab_index" "$js"
}

fill_seller_email() {
  local window_id="$1"
  local tab_index="$2"
  local email_literal
  email_literal=$(js_string_literal "$SC_EMAIL")
  local js="(() => {
    const value = ${email_literal};
    const input = document.getElementById('ap_email');
    if (!input) return 'NO_EMAIL_INPUT';
    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const button = document.getElementById('continue') || Array.from(document.querySelectorAll('input,button')).find((el) => /continue|next/i.test((el.value || el.innerText || '').trim()));
    if (button) button.click();
    return 'EMAIL_SUBMITTED';
  })();"
  run_js "$window_id" "$tab_index" "$js" >/dev/null
}

fill_seller_password() {
  if [ -z "$SC_PASSWORD" ]; then
    log "FAILED: SELLER_CENTRAL_PASSWORD missing"
    exit 1
  fi

  local window_id="$1"
  local tab_index="$2"
  local password_literal
  password_literal=$(js_string_literal "$SC_PASSWORD")
  local js="(() => {
    const value = ${password_literal};
    const input = document.getElementById('ap_password');
    if (!input) return 'NO_PASSWORD_INPUT';
    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const remember = document.querySelector('input[name=rememberMe], input[id*=remember], input[type=checkbox][name*=remember i]');
    if (remember) {
      remember.checked = true;
      remember.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const button = document.getElementById('signInSubmit') || Array.from(document.querySelectorAll('input,button')).find((el) => /sign in|login|continue/i.test((el.value || el.innerText || '').trim()));
    if (button) button.click();
    return 'PASSWORD_SUBMITTED';
  })();"
  run_js "$window_id" "$tab_index" "$js" >/dev/null
}

inspect_voice_state() {
  local window_id="$1"
  local tab_index="$2"
  local js='(() => {
    const clean = (value) => (value || "").replace(/[|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim();
    const href = clean(location.href || "");
    const title = clean(document.title || "");
    const passwordInput = document.querySelector("input[type=password]");
    const emailInput = document.querySelector("input[type=email], input[autocomplete=username], input[name*=identifier i], input[name*=email i]");
    if (location.host.includes("voice.google.com")) return ["VOICE", href, title].join("|");
    if (location.host.includes("accounts.google.com")) {
      if (passwordInput) return ["GOOGLE_PASSWORD", href, title].join("|");
      if (emailInput) return ["GOOGLE_EMAIL", href, title].join("|");
    }
    return ["UNKNOWN", href, title].join("|");
  })();'
  run_js "$window_id" "$tab_index" "$js"
}

fill_google_email() {
  local window_id="$1"
  local tab_index="$2"
  local email_literal
  email_literal=$(js_string_literal "$GOOGLE_EMAIL")
  local js="(() => {
    const value = ${email_literal};
    const input = document.querySelector('input[type=email], input[autocomplete=username], input[name*=identifier i], input[name*=email i]');
    if (!input) return 'NO_GOOGLE_EMAIL_INPUT';
    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const button = Array.from(document.querySelectorAll('button, div[role=button]')).find((el) => /next|continue/i.test((el.innerText || '').trim()));
    if (button) button.click();
    return 'GOOGLE_EMAIL_SUBMITTED';
  })();"
  run_js "$window_id" "$tab_index" "$js" >/dev/null
}

fill_google_password() {
  if [ -z "$GOOGLE_PASSWORD" ]; then
    log "FAILED: GOOGLE_PASSWORD missing"
    exit 1
  fi

  local window_id="$1"
  local tab_index="$2"
  local password_literal
  password_literal=$(js_string_literal "$GOOGLE_PASSWORD")
  local js="(() => {
    const value = ${password_literal};
    const input = document.querySelector('input[type=password]');
    if (!input) return 'NO_GOOGLE_PASSWORD_INPUT';
    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const button = Array.from(document.querySelectorAll('button, div[role=button]')).find((el) => /next|continue/i.test((el.innerText || '').trim()));
    if (button) button.click();
    return 'GOOGLE_PASSWORD_SUBMITTED';
  })();"
  run_js "$window_id" "$tab_index" "$js" >/dev/null
}

extract_google_voice_code() {
  local window_id="$1"
  local tab_index="$2"
  local js='(() => {
    const text = document.body ? document.body.innerText : "";
    const patterns = [
      /amazon[\s\S]{0,120}?(\d{6})/i,
      /seller central[\s\S]{0,120}?(\d{6})/i,
      /verification code[\s\S]{0,80}?(\d{6})/i,
      /security code[\s\S]{0,80}?(\d{6})/i,
      /\b(\d{6})\b/
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) return match[1];
    }
    return "";
  })();'
  run_js "$window_id" "$tab_index" "$js"
}

click_likely_amazon_voice_thread() {
  local window_id="$1"
  local tab_index="$2"
  local js='(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const candidates = Array.from(document.querySelectorAll("a,button,div,li,span")).filter((el) => /amazon|seller central|verification|security code/i.test(clean(el.innerText || "")));
    const target = candidates.find((el) => el.offsetParent !== null);
    if (!target) return "NO_THREAD";
    target.click();
    return "THREAD_CLICKED";
  })();'
  run_js "$window_id" "$tab_index" "$js" >/dev/null
}

fetch_google_voice_code() {
  local voice_info
  voice_info=$(osascript "$SAFARI_HELPER" ensure-tab "https://voice.google.com/u/0/messages" "voice.google.com,accounts.google.com")
  parse_tab_info "$voice_info"
  local voice_window_id="$SAFARI_WINDOW_ID"
  local voice_tab_index="$SAFARI_TAB_INDEX"

  for _ in $(seq 1 30); do
    focus_tab "$voice_window_id" "$voice_tab_index"
    wait_tab "$voice_window_id" "$voice_tab_index"

    local state
    state=$(inspect_voice_state "$voice_window_id" "$voice_tab_index")
    IFS='|' read -r state_name _ _ <<<"$state"

    case "$state_name" in
      GOOGLE_EMAIL)
        fill_google_email "$voice_window_id" "$voice_tab_index"
        ;;
      GOOGLE_PASSWORD)
        fill_google_password "$voice_window_id" "$voice_tab_index"
        ;;
      VOICE)
        local code
        code=$(extract_google_voice_code "$voice_window_id" "$voice_tab_index")
        if [ -n "$code" ]; then
          printf '%s' "$code"
          return 0
        fi
        click_likely_amazon_voice_thread "$voice_window_id" "$voice_tab_index"
        sleep 1
        code=$(extract_google_voice_code "$voice_window_id" "$voice_tab_index")
        if [ -n "$code" ]; then
          printf '%s' "$code"
          return 0
        fi
        run_js "$voice_window_id" "$voice_tab_index" "location.reload(); 'RELOADED';" >/dev/null
        ;;
    esac

    sleep 2
  done

  return 1
}

submit_seller_otp() {
  local window_id="$1"
  local tab_index="$2"
  local otp="$3"
  local otp_literal
  otp_literal=$(js_string_literal "$otp")
  local js="(() => {
    const value = ${otp_literal};
    const inputs = Array.from(document.querySelectorAll('input')).filter((el) => {
      const meta = ((el.type || '') + ' ' + (el.name || '') + ' ' + (el.id || '') + ' ' + (el.autocomplete || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
      return /code|otp|verification|one-time/.test(meta) || el.type === 'tel' || el.type === 'number' || (el.maxLength === 1 && el.type === 'text');
    });
    if (inputs.length === 0) return 'NO_OTP_INPUT';
    const setValue = (input, nextValue) => {
      input.focus();
      input.value = nextValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (inputs.length > 1 && inputs.every((el) => el.maxLength === 1 || el.type === 'tel' || el.type === 'number')) {
      value.split('').forEach((char, index) => {
        if (inputs[index]) setValue(inputs[index], char);
      });
    } else {
      setValue(inputs[0], value);
    }
    const button = document.getElementById('auth-signin-button') || Array.from(document.querySelectorAll('button,input,a')).find((el) => /verify|continue|submit/i.test((el.value || el.innerText || '').trim()));
    if (button) button.click();
    return 'OTP_SUBMITTED';
  })();"
  run_js "$window_id" "$tab_index" "$js" >/dev/null
}

log "=== Relogin starting ==="

tab_info=$(osascript "$SAFARI_HELPER" ensure-tab "$TARGET_URL" "sellercentral.amazon.com,amazon.com")
parse_tab_info "$tab_info"
window_id="$SAFARI_WINDOW_ID"
tab_index="$SAFARI_TAB_INDEX"

for _ in $(seq 1 45); do
  focus_tab "$window_id" "$tab_index"
  wait_tab "$window_id" "$tab_index"

  state=$(inspect_seller_state "$window_id" "$tab_index")
  IFS='|' read -r state_name state_url state_title <<<"$state"

  case "$state_name" in
    AUTHENTICATED)
      if [ "$state_url" != "$TARGET_URL" ]; then
        navigate_tab "$window_id" "$tab_index" "$TARGET_URL"
        sleep 2
        continue
      fi
      log "=== Relogin successful ==="
      tail -200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
      exit 0
      ;;
    EMAIL)
      log "Submitting seller email"
      fill_seller_email "$window_id" "$tab_index"
      ;;
    PASSWORD)
      log "Submitting seller password"
      fill_seller_password "$window_id" "$tab_index"
      ;;
    OTP)
      log "Fetching Google Voice OTP"
      if ! otp_code="$(fetch_google_voice_code)"; then
        log "FAILED: Google Voice OTP not found"
        exit 1
      fi
      focus_tab "$window_id" "$tab_index"
      submit_seller_otp "$window_id" "$tab_index" "$otp_code"
      ;;
    CAPTCHA)
      log "FAILED: CAPTCHA encountered"
      exit 1
      ;;
    *)
      :
      ;;
  esac

  sleep 2
done

log "FAILED: Timed out while restoring Seller Central session"
tail -200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit 1
