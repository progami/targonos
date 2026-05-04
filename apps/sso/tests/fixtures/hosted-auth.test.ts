import assert from 'node:assert/strict'
import test from 'node:test'

import { isHostedCriticalStatusCode } from './hosted-auth'

test('hosted response tracker treats same-origin 404 responses as critical', () => {
  assert.equal(isHostedCriticalStatusCode(404), true)
})
