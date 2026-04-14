import test from 'node:test'
import assert from 'node:assert/strict'
import { decode, encode } from 'next-auth/jwt'

import { encodeSessionTokenWithActiveTenant, isRequestedTenantAllowed } from '@/lib/tenant-selection'

test('isRequestedTenantAllowed rejects a tenant outside the app membership', () => {
  const session = {
    user: { id: 'u_1', email: 'ops@targonglobal.com' },
    authz: {
      version: 1,
      globalRoles: [],
      apps: {
        talos: { departments: ['Ops'], tenantMemberships: ['US'] },
      },
    },
  }

  assert.equal(isRequestedTenantAllowed(session, 'talos', 'UK'), false)
})

test('isRequestedTenantAllowed accepts a tenant inside the app membership', () => {
  const session = {
    user: { id: 'u_1', email: 'ops@targonglobal.com' },
    authz: {
      version: 1,
      globalRoles: [],
      apps: {
        talos: { departments: ['Ops'], tenantMemberships: ['US', 'UK'] },
      },
    },
  }

  assert.equal(isRequestedTenantAllowed(session, 'talos', 'UK'), true)
})

test('encodeSessionTokenWithActiveTenant updates the existing portal session token payload', async () => {
  process.env.NEXTAUTH_SECRET = 'test-nextauth-secret-000000000000'

  const cookieName = '__Secure-next-auth.session-token'
  const rawToken = await encode({
    token: {
      sub: 'u_1',
      email: 'ops@targonglobal.com',
    },
    secret: process.env.NEXTAUTH_SECRET,
    salt: cookieName,
  })

  const updated = await encodeSessionTokenWithActiveTenant(
    `${cookieName}=${rawToken}`,
    'UK',
  )

  const decoded = await decode({
    token: updated.value,
    secret: process.env.NEXTAUTH_SECRET,
    salt: updated.name,
  })

  assert.equal(updated.name, cookieName)
  assert.equal(decoded?.activeTenant, 'UK')
})
