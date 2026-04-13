import test from 'node:test'
import assert from 'node:assert/strict'

import { compareTopology } from './assert-auth-topology.mjs'

test('compareTopology fails when build and runtime app urls diverge', () => {
  const result = compareTopology({
    expectedPortalOrigin: 'https://os.targonglobal.com',
    buildPublicAppUrl: 'https://dev-os.targonglobal.com/talos',
    runtimePublicAppUrl: 'https://os.targonglobal.com/talos',
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /buildPublicAppUrl/)
})

test('compareTopology fails when runtime url is outside the expected portal origin', () => {
  const result = compareTopology({
    expectedPortalOrigin: 'https://os.targonglobal.com',
    buildPublicAppUrl: 'https://dev-os.targonglobal.com/talos',
    runtimePublicAppUrl: 'https://dev-os.targonglobal.com/talos',
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /expectedPortalOrigin/)
})

test('compareTopology passes when build and runtime topology match', () => {
  const result = compareTopology({
    expectedPortalOrigin: 'https://os.targonglobal.com',
    buildPublicAppUrl: 'https://os.targonglobal.com/talos',
    runtimePublicAppUrl: 'https://os.targonglobal.com/talos',
  })

  assert.deepEqual(result, { ok: true, message: 'ok' })
})
