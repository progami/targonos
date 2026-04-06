#!/bin/bash
# Seller Central / Amazon relogin flow via Chrome + Google Voice OTP.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

TARGET_URL="${1:-https://sellercentral.amazon.com/home}"
SC_EMAIL="$(bitwarden_login_username "sellercentral.amazon.com" "jarrar@targonglobal.com")"
SC_PASSWORD="$(bitwarden_login_password "sellercentral.amazon.com" "jarrar@targonglobal.com")"
GOOGLE_EMAIL="$(bitwarden_login_username "accounts.google.com" "jarraramjad@gmail.com")"
GOOGLE_PASSWORD="$(bitwarden_login_password "accounts.google.com" "jarraramjad@gmail.com")"
LOG="/tmp/sc-relogin.log"
SELLER_TAB_ID=""
VOICE_TAB_ID=""

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') — $1" >> "$LOG"; }

run_js_for_tab() {
  local tab_id="$1"
  local js_code="$2"
  run_chrome_helper run-js-tab-id "$tab_id" "$js_code"
}

wait_for_tab() {
  local tab_id="$1"
  run_chrome_helper wait-tab-id "$tab_id" >/dev/null
}

navigate_tab_by_id() {
  local tab_id="$1"
  local target_url="$2"
  run_chrome_helper navigate-tab-id "$tab_id" "$target_url" >/dev/null
}

tab_url_for_id() {
  local tab_id="$1"
  run_chrome_helper get-url-tab-id "$tab_id"
}

ensure_seller_tab() {
  SELLER_TAB_ID="$(run_chrome_helper ensure-tab-id "$TARGET_URL" "sellercentral.amazon.com,amazon.com")"
}

ensure_voice_tab() {
  VOICE_TAB_ID="$(run_chrome_helper ensure-tab-id "https://voice.google.com/u/0/messages" "voice.google.com,accounts.google.com")"
}

run_js() {
  run_js_for_tab "$SELLER_TAB_ID" "$1"
}

wait_tab() {
  wait_for_tab "$SELLER_TAB_ID"
}

navigate_tab() {
  navigate_tab_by_id "$SELLER_TAB_ID" "$1"
}

current_url() {
  tab_url_for_id "$SELLER_TAB_ID"
}

run_voice_js() {
  run_js_for_tab "$VOICE_TAB_ID" "$1"
}

inspect_seller_state() {
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
  run_js "$js"
}

fill_seller_email() {
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
  run_js "$js" >/dev/null
}

fill_seller_password() {
  if [ -z "$SC_PASSWORD" ]; then
    log "FAILED: SELLER_CENTRAL_PASSWORD missing"
    exit 1
  fi

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
  run_js "$js" >/dev/null
}

inspect_voice_state() {
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
  run_voice_js "$js"
}

fill_google_email() {
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
  run_voice_js "$js" >/dev/null
}

fill_google_password() {
  if [ -z "$GOOGLE_PASSWORD" ]; then
    log "FAILED: GOOGLE_PASSWORD missing"
    exit 1
  fi

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
  run_voice_js "$js" >/dev/null
}

extract_google_voice_code() {
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
  run_voice_js "$js"
}

click_likely_amazon_voice_thread() {
  local js='(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const candidates = Array.from(document.querySelectorAll("a,button,div,li,span")).filter((el) => /amazon|seller central|verification|security code/i.test(clean(el.innerText || "")));
    const target = candidates.find((el) => el.offsetParent !== null);
    if (!target) return "NO_THREAD";
    target.click();
    return "THREAD_CLICKED";
  })();'
  run_voice_js "$js" >/dev/null
}

fetch_google_voice_code() {
  ensure_voice_tab

  for _ in $(seq 1 30); do
    ensure_voice_tab
    wait_for_tab "$VOICE_TAB_ID"

    local state
    state=$(inspect_voice_state)
    IFS='|' read -r state_name _ _ <<<"$state"

    case "$state_name" in
      GOOGLE_EMAIL)
        fill_google_email
        ;;
      GOOGLE_PASSWORD)
        fill_google_password
        ;;
      VOICE)
        local code
        code=$(extract_google_voice_code)
        if [ -n "$code" ]; then
          printf '%s' "$code"
          return 0
        fi
        click_likely_amazon_voice_thread
        sleep 1
        code=$(extract_google_voice_code)
        if [ -n "$code" ]; then
          printf '%s' "$code"
          return 0
        fi
        run_voice_js "location.reload(); 'RELOADED';" >/dev/null
        ;;
    esac

    sleep 2
  done

  return 1
}

submit_seller_otp() {
  local otp="$1"
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
  run_js "$js" >/dev/null
}

log "=== Relogin starting ==="

ensure_seller_tab

for _ in $(seq 1 45); do
  ensure_seller_tab
  wait_tab

  state=$(inspect_seller_state)
  IFS='|' read -r state_name state_url state_title <<<"$state"

  case "$state_name" in
    AUTHENTICATED)
      if [ "$state_url" != "$TARGET_URL" ]; then
        navigate_tab "$TARGET_URL"
        sleep 2
        continue
      fi
      log "=== Relogin successful ==="
      tail -200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
      exit 0
      ;;
    EMAIL)
      log "Submitting seller email"
      fill_seller_email
      ;;
    PASSWORD)
      log "Submitting seller password"
      fill_seller_password
      ;;
    OTP)
      log "Fetching Google Voice OTP"
      if ! otp_code="$(fetch_google_voice_code)"; then
        log "FAILED: Google Voice OTP not found"
        exit 1
      fi
      ensure_seller_tab
      submit_seller_otp "$otp_code"
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
