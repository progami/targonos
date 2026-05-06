import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('google login route starts provider sign-in without redirecting on stale auth state', () => {
  const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /auth\(\)/)
  assert.doesNotMatch(source, /resolvePortalCallbackTarget/)
  assert.match(source, /signIn\('google'/)
})
