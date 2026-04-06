import assert from 'node:assert/strict'
import test from 'node:test'

import { generateTotpCode, parseTotpSecret } from './totp-helper.mjs'

test('parseTotpSecret extracts the secret from an otpauth URI', () => {
  assert.equal(
    parseTotpSecret(
      'otpauth://totp/Amazon%20Seller%20Central:shoaibgondal@targonglobal.com?secret=JBSWY3DPEHPK3PXP&issuer=Amazon%20Seller%20Central',
    ),
    'JBSWY3DPEHPK3PXP',
  )
})

test('generateTotpCode matches the RFC 6238 SHA-1 reference at 59 seconds', () => {
  assert.equal(
    generateTotpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', {
      timestampMs: 59_000,
      digits: 8,
    }),
    '94287082',
  )
})

test('generateTotpCode produces a six-digit code for otpauth URIs', () => {
  assert.equal(
    generateTotpCode(
      'otpauth://totp/Amazon?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Amazon',
      {
        timestampMs: 59_000,
      },
    ),
    '287082',
  )
})
