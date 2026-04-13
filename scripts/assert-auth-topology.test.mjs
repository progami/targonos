import test from 'node:test'
import assert from 'node:assert/strict'

import { compareTopology } from './assert-auth-topology.mjs'

test('compareTopology fails when build and runtime app urls diverge', () => {
  const result = compareTopology({
    expectedPortalOrigin: 'https://os.targonglobal.com',
    buildPublicUrl: 'https://dev-os.targonglobal.com',
    runtimePublicUrl: 'https://os.targonglobal.com',
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /buildPublicUrl/)
})

test('compareTopology fails when runtime url is outside the expected portal origin', () => {
  const result = compareTopology({
    expectedPortalOrigin: 'https://os.targonglobal.com',
    buildPublicUrl: 'https://dev-os.targonglobal.com',
    runtimePublicUrl: 'https://dev-os.targonglobal.com',
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /expectedPortalOrigin/)
})

test('compareTopology passes when build and runtime topology match', () => {
  const result = compareTopology({
    expectedPortalOrigin: 'https://os.targonglobal.com',
    buildPublicUrl: 'https://os.targonglobal.com',
    runtimePublicUrl: 'https://os.targonglobal.com',
  })

  assert.deepEqual(result, { ok: true, message: 'ok' })
})

test('compareTopology normalizes trailing slashes and default ports', () => {
  const result = compareTopology({
    expectedPortalOrigin: 'https://os.targonglobal.com/',
    buildPublicUrl: 'https://os.targonglobal.com:443/',
    runtimePublicUrl: 'https://os.targonglobal.com',
  })

  assert.deepEqual(result, { ok: true, message: 'ok' })
})

test('compareTopology rejects origins that only share the expected prefix', () => {
  const result = compareTopology({
    expectedPortalOrigin: 'https://os.targonglobal.com',
    buildPublicUrl: 'https://os.targonglobal.com.evil.example',
    runtimePublicUrl: 'https://os.targonglobal.com.evil.example',
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /expectedPortalOrigin/)
})
