import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEV_COOKIE_DOMAIN,
  DEV_PORTAL_ORIGIN,
  parseEnvFile,
  validateCiEnvEntries,
} from './verify-ci-env-contracts.mjs'

test('parseEnvFile ignores comments and blank lines', () => {
  const entries = parseEnvFile(`
# comment
PORTAL_AUTH_URL=${DEV_PORTAL_ORIGIN}

COOKIE_DOMAIN=${DEV_COOKIE_DOMAIN}
`)

  assert.equal(entries.get('PORTAL_AUTH_URL'), DEV_PORTAL_ORIGIN)
  assert.equal(entries.get('COOKIE_DOMAIN'), DEV_COOKIE_DOMAIN)
})

test('validateCiEnvEntries accepts a hosted dev auth configuration', () => {
  const entries = new Map([
    ['PORTAL_AUTH_URL', DEV_PORTAL_ORIGIN],
    ['NEXT_PUBLIC_PORTAL_AUTH_URL', DEV_PORTAL_ORIGIN],
    ['NEXTAUTH_URL', `${DEV_PORTAL_ORIGIN}/atlas`],
    ['NEXT_PUBLIC_APP_URL', `${DEV_PORTAL_ORIGIN}/atlas`],
    ['COOKIE_DOMAIN', DEV_COOKIE_DOMAIN],
  ])

  assert.deepEqual(validateCiEnvEntries(entries, 'apps/atlas/.env.dev.ci'), [])
})

test('validateCiEnvEntries rejects localhost auth URLs', () => {
  const entries = new Map([
    ['PORTAL_AUTH_URL', 'http://localhost:3100'],
  ])

  const errors = validateCiEnvEntries(entries, 'apps/atlas/.env.dev.ci')
  assert.equal(errors.length, 2)
  assert.match(errors[0], /must not point at localhost/)
  assert.match(errors[1], /must equal/)
})

test('validateCiEnvEntries rejects main hosted URLs in dev CI env files', () => {
  const entries = new Map([
    ['NEXT_PUBLIC_APP_URL', 'https://os.targonglobal.com/atlas'],
  ])

  const errors = validateCiEnvEntries(entries, 'apps/atlas/.env.dev.ci')
  assert.equal(errors.length, 2)
  assert.match(errors[0], /must not point at the main hosted origin/)
  assert.match(errors[1], /must start with/)
})

test('validateCiEnvEntries rejects the wrong dev cookie domain', () => {
  const entries = new Map([
    ['COOKIE_DOMAIN', '.os.targonglobal.com'],
  ])

  const errors = validateCiEnvEntries(entries, 'apps/sso/.env.dev.ci')
  assert.equal(errors.length, 1)
  assert.match(errors[0], /COOKIE_DOMAIN must equal/)
})
