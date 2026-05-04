import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertHostedSmokeGrantMatches,
  haveSameStringMembers,
} from './ensure-hosted-smoke-user-lib'

test('haveSameStringMembers accepts the same members in a different order', () => {
  assert.equal(haveSameStringMembers(['US', 'UK'], ['UK', 'US']), true)
})

test('assertHostedSmokeGrantMatches accepts reordered tenant memberships', () => {
  assert.doesNotThrow(() =>
    assertHostedSmokeGrantMatches({
      grant: {
        appSlug: 'talos',
        departments: ['Ops'],
        tenantMemberships: ['US', 'UK'],
      },
      appGrant: {
        departments: ['Ops'],
        tenantMemberships: ['UK', 'US'],
      },
    }),
  )
})

test('assertHostedSmokeGrantMatches rejects a missing tenant membership', () => {
  assert.throws(
    () =>
      assertHostedSmokeGrantMatches({
        grant: {
          appSlug: 'talos',
          departments: ['Ops'],
          tenantMemberships: ['US', 'UK'],
        },
        appGrant: {
          departments: ['Ops'],
          tenantMemberships: ['US'],
        },
      }),
    /tenant memberships mismatch/,
  )
})
