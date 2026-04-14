import assert from 'node:assert/strict'
import test from 'node:test'

import { hasTenantAccessForCode } from './guard'

test('tenant access is granted from portal tenant claims without a local region field', () => {
  const session = {
    user: { email: 'ops@targonglobal.com' },
    authz: {
      version: 1,
      globalRoles: [],
      apps: {
        talos: { departments: ['Ops'], tenantMemberships: ['UK'] },
      },
    },
    activeTenant: 'UK',
  }

  assert.equal(hasTenantAccessForCode(session as never, 'UK'), true)
})

test('tenant access is granted to portal platform admins for every tenant', () => {
  const session = {
    user: { email: 'ops@targonglobal.com' },
    authz: {
      version: 1,
      globalRoles: ['platform_admin'],
      apps: {
        talos: { departments: ['Ops'], tenantMemberships: [] },
      },
    },
  }

  assert.equal(hasTenantAccessForCode(session as never, 'US'), true)
  assert.equal(hasTenantAccessForCode(session as never, 'UK'), true)
})
