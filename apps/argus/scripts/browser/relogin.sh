#!/bin/bash
# Seller Central / Amazon relogin flow via Chrome + Bitwarden TOTP.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

TARGET_URL="${1:-https://sellercentral.amazon.com/home}"
SELLER_CENTRAL_LOGIN_USERNAME="shoaibgondal@targonglobal.com"
SELLER_CENTRAL_ACCOUNT_LABEL="Targon LLC"
SELLER_CENTRAL_MARKETPLACE_LABEL="United States"
SC_EMAIL="$(bitwarden_login_username "sellercentral.amazon.com" "$SELLER_CENTRAL_LOGIN_USERNAME")"
SC_PASSWORD="$(bitwarden_login_password "sellercentral.amazon.com" "$SELLER_CENTRAL_LOGIN_USERNAME")"
LOG="/tmp/sc-relogin.log"
SELLER_TAB_ID=""

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

run_js() {
  run_js_for_tab "$SELLER_TAB_ID" "$1"
}

wait_tab() {
  wait_for_tab "$SELLER_TAB_ID"
}

navigate_tab() {
  navigate_tab_by_id "$SELLER_TAB_ID" "$1"
}

inspect_seller_state() {
  local js='(() => {
    const clean = (value) => (value || "").replace(/[|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim();
    const href = clean(location.href || "");
    const title = clean(document.title || "");
    const body = document.body ? clean(document.body.innerText || "") : "";
    const hasInput = Array.from(document.querySelectorAll("input")).length > 0;

    if (href.includes("/account-switcher")) return ["ACCOUNT_SWITCHER", href, title].join("|");
    if (/enroll a 2-step verification authenticator/i.test(body)) return ["AUTH_APP_ENROLLMENT", href, title].join("|");
    if (/choose where to receive the code|enter otp from authenticator app/i.test(body)) return ["AUTH_APP_METHOD", href, title].join("|");
    if (/sent the code to your email/i.test(body) && hasInput) return ["EMAIL_OTP_UNSUPPORTED", href, title].join("|");
    if (/for added security, please enter the one time password|enter code:|enter verification code/i.test(body) && hasInput) return ["AUTH_APP_OTP", href, title].join("|");
    if (!href.includes("signin") && !href.includes("/ap/") && !/sign in|enter the characters you see below|solve this puzzle/i.test(body)) {
      return ["AUTHENTICATED", href, title].join("|");
    }
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
    const button = document.getElementById('continue') || Array.from(document.querySelectorAll('input,button')).find((element) => /continue|next/i.test((element.value || element.innerText || '').trim()));
    if (button) button.click();
    return 'EMAIL_SUBMITTED';
  })();"
  run_js "$js"
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
    const button = document.getElementById('signInSubmit') || Array.from(document.querySelectorAll('input,button')).find((element) => /sign in|login|continue/i.test((element.value || element.innerText || '').trim()));
    if (button) button.click();
    return 'PASSWORD_SUBMITTED';
  })();"
  run_js "$js"
}

request_authenticator_otp() {
  local js='(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const button = Array.from(document.querySelectorAll("button,input,a")).find((element) =>
      /send otp/i.test(clean(element.innerText || element.textContent || element.value || ""))
    );
    if (!button) return "NO_SEND_OTP_BUTTON";
    button.click();
    return "OTP_REQUESTED";
  })();'
  run_js "$js"
}

submit_seller_otp() {
  local otp="$1"
  local otp_literal
  otp_literal=$(js_string_literal "$otp")
  local js="(() => {
    const value = ${otp_literal};
    const inputs = Array.from(document.querySelectorAll('input')).filter((element) => {
      const meta = ((element.type || '') + ' ' + (element.name || '') + ' ' + (element.id || '') + ' ' + (element.autocomplete || '') + ' ' + (element.getAttribute('aria-label') || '')).toLowerCase();
      return /code|otp|verification|one-time/.test(meta) || element.type === 'tel' || element.type === 'number' || (element.maxLength === 1 && element.type === 'text');
    });
    if (inputs.length === 0) return 'NO_OTP_INPUT';
    const setValue = (input, nextValue) => {
      input.focus();
      input.value = nextValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (inputs.length > 1 && inputs.every((element) => element.maxLength === 1 || element.type === 'tel' || element.type === 'number')) {
      value.split('').forEach((char, index) => {
        if (inputs[index]) setValue(inputs[index], char);
      });
    } else {
      setValue(inputs[0], value);
    }
    const button = document.getElementById('auth-signin-button') || Array.from(document.querySelectorAll('button,input,a')).find((element) => /verify|continue|submit|sign in/i.test((element.value || element.innerText || '').trim()));
    if (button) button.click();
    return 'OTP_SUBMITTED';
  })();"
  run_js "$js"
}

select_seller_account() {
  local account_literal
  local marketplace_literal
  account_literal=$(js_string_literal "$SELLER_CENTRAL_ACCOUNT_LABEL")
  marketplace_literal=$(js_string_literal "$SELLER_CENTRAL_MARKETPLACE_LABEL")
  local js="(() => {
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const buttons = () => Array.from(document.querySelectorAll('button,input,a'));
    const findByLabel = (label) => buttons().find((element) => clean(element.innerText || element.textContent || element.value || '') === label);
    const accountButton = findByLabel(${account_literal});
    if (!accountButton) return 'NO_ACCOUNT_BUTTON';
    accountButton.click();
    const marketplaceButton = findByLabel(${marketplace_literal});
    if (!marketplaceButton) return 'NO_MARKETPLACE_BUTTON';
    marketplaceButton.click();
    const submitButton = buttons().find((element) => /select account/i.test(clean(element.innerText || element.textContent || element.value || '')));
    if (!submitButton) return 'NO_SELECT_ACCOUNT_BUTTON';
    submitButton.click();
    return 'ACCOUNT_SELECTED';
  })();"
  run_js "$js"
}

log "=== Relogin starting ==="

ensure_seller_tab

for _ in $(seq 1 60); do
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
      fill_status="$(fill_seller_email)"
      log "Email step: $fill_status"
      ;;
    PASSWORD)
      log "Submitting seller password"
      password_status="$(fill_seller_password)"
      log "Password step: $password_status"
      ;;
    AUTH_APP_METHOD)
      log "Requesting authenticator OTP prompt"
      request_status="$(request_authenticator_otp)"
      log "Authenticator method step: $request_status"
      ;;
    EMAIL_OTP_UNSUPPORTED)
      log "FAILED: Seller Central presented an email OTP challenge; Bitwarden TOTP is the only supported MFA path"
      exit 1
      ;;
    AUTH_APP_OTP)
      log "Submitting authenticator OTP"
      if ! otp_code="$(bitwarden_login_totp "sellercentral.amazon.com" "$SELLER_CENTRAL_LOGIN_USERNAME")"; then
        log "FAILED: Seller Central Bitwarden TOTP unavailable"
        exit 1
      fi
      otp_status="$(submit_seller_otp "$otp_code")"
      log "Authenticator OTP step: $otp_status"
      ;;
    ACCOUNT_SWITCHER)
      log "Selecting Seller Central account"
      selection_status="$(select_seller_account)"
      log "Account switcher step: $selection_status"
      ;;
    AUTH_APP_ENROLLMENT)
      log "FAILED: Seller Central requires authenticator enrollment in the Chrome profile"
      exit 1
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
