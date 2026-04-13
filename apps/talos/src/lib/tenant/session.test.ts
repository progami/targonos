import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getAuthorizedTenantCodesForSession,
  getSessionActiveTenant,
  resolveTenantCodeFromState,
} from './session'

test('authorized tenant codes come from portal claims for regular users', () => {
  const session = {
    user: { email: 'ops@targonglobal.com' },
    authz: {
      version: 1,
      globalRoles: [],
      apps: {
        talos: { departments: ['Ops'], tenantMemberships: ['UK'] },
      },
    },
  }

  assert.deepEqual(getAuthorizedTenantCodesForSession(session as never), ['UK'])
})

test('authorized tenant codes expand to all tenants for Talos super admins', () => {
  const session = {
    user: { email: 'jarrar@targonglobal.com' },
    authz: {
      version: 1,
      globalRoles: [],
      apps: {
        talos: { departments: ['Ops'], tenantMemberships: ['UK'] },
      },
    },
  }

  assert.deepEqual(getAuthorizedTenantCodesForSession(session as never), ['US', 'UK'])
})

test('session active tenant normalizes valid tenant codes', () => {
  const session = {
    activeTenant: ' uk ',
  }

  assert.equal(getSessionActiveTenant(session as never), 'UK')
})

test('tenant resolution prefers session active tenant over a stale cookie', () => {
  assert.equal(
    resolveTenantCodeFromState({
      headerTenant: null,
      sessionActiveTenant: 'UK',
      cookieTenant: 'US',
    }),
    'UK',
  )
})

test('tenant resolution still honors an explicit request override header first', () => {
  assert.equal(
    resolveTenantCodeFromState({
      headerTenant: 'UK',
      sessionActiveTenant: 'US',
      cookieTenant: 'US',
    }),
    'UK',
  )
})
