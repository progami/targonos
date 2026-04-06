import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const reloginScript = readFileSync(new URL('./relogin.sh', import.meta.url), 'utf8')

test('relogin uses the shared Seller Central account', () => {
  assert.match(reloginScript, /SELLER_CENTRAL_LOGIN_USERNAME="shoaibgondal@targonglobal\.com"/)
})

test('relogin uses Bitwarden TOTP and does not depend on chat OTP helpers', () => {
  assert.match(reloginScript, /bitwarden_login_totp "sellercentral\.amazon\.com" "\$SELLER_CENTRAL_LOGIN_USERNAME"/)
  assert.doesNotMatch(reloginScript, /SELLER_CENTRAL_CHAT_HELPER|latest-chat-code|fetch_chat_verification_code/)
})

test('relogin does not keep an email OTP recovery branch', () => {
  assert.doesNotMatch(reloginScript, /EMAIL_OTP\)/)
  assert.match(reloginScript, /EMAIL_OTP_UNSUPPORTED\)/)
})
