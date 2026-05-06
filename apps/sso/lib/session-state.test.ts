import test from 'node:test'
import assert from 'node:assert/strict'
import type { Session } from 'next-auth'
import { hasSignedInUser } from './session-state'

test('hasSignedInUser rejects null and empty session objects', () => {
  assert.equal(hasSignedInUser(null), false)
  assert.equal(hasSignedInUser({} as Session), false)
  assert.equal(hasSignedInUser({ user: {} } as Session), false)
  assert.equal(hasSignedInUser({ user: { email: '   ' } } as Session), false)
})

test('hasSignedInUser accepts a session with a real email', () => {
  assert.equal(hasSignedInUser({ user: { email: 'jarrar@targonglobal.com' } } as Session), true)
})
