import test from 'node:test'
import assert from 'node:assert/strict'

import { buildManualGrantUpdateValues, normalizeTenantMemberships } from './user-service'

test('buildManualGrantUpdateValues preserves tenant memberships when omitted', () => {
  const values = buildManualGrantUpdateValues({
    userId: 'user_1',
    appSlug: 'talos',
    departments: ['Ops'],
    locked: true,
  })

  assert.deepEqual(values, {
    source: 'manual',
    locked: true,
    departments: ['Ops'],
  })
})

test('buildManualGrantUpdateValues clears tenant memberships when explicitly empty', () => {
  const values = buildManualGrantUpdateValues({
    userId: 'user_1',
    appSlug: 'talos',
    departments: ['Ops'],
    tenantMemberships: [],
  })

  assert.deepEqual(values, {
    source: 'manual',
    locked: true,
    departments: ['Ops'],
    tenantMemberships: [],
  })
})

test('normalizeTenantMemberships trims, dedupes, and sorts values', () => {
  assert.deepEqual(
    normalizeTenantMemberships([' UK ', 'US', 'US', '', 'CA']),
    ['CA', 'UK', 'US'],
  )
})
