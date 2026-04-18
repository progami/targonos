import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildHostedSmokeAuthz,
  buildHostedSmokeSessionTokenPayload,
  getHostedAuthSecret,
  hostedSmokeAppGrants,
} from './hosted-smoke-config'

test('hosted smoke grants cover every hosted app route under test', () => {
  assert.deepEqual(
    hostedSmokeAppGrants.map((grant) => grant.appSlug),
    ['talos', 'atlas', 'kairos', 'xplan', 'plutus', 'hermes', 'argus'],
  )
})

test('buildHostedSmokeAuthz mirrors the hosted smoke grant plan', () => {
  const authz = buildHostedSmokeAuthz()

  assert.deepEqual(Object.keys(authz.apps), hostedSmokeAppGrants.map((grant) => grant.appSlug))
  assert.deepEqual(authz.apps.talos?.tenantMemberships, ['US', 'UK'])
  assert.deepEqual(authz.apps.plutus?.departments, ['Finance'])
})

test('getHostedAuthSecret accepts NEXTAUTH_SECRET', () => {
  assert.equal(
    getHostedAuthSecret({
      NEXTAUTH_SECRET: 'nextauth-secret',
      PORTAL_AUTH_SECRET: 'portal-secret',
    }),
    'nextauth-secret',
  )
})

test('getHostedAuthSecret falls back to PORTAL_AUTH_SECRET when NEXTAUTH_SECRET is absent', () => {
  assert.equal(
    getHostedAuthSecret({
      PORTAL_AUTH_SECRET: 'portal-secret',
    }),
    'portal-secret',
  )
})

test('buildHostedSmokeSessionTokenPayload seeds entitlements_ver to avoid immediate auth refresh', () => {
  const before = Date.now()
  const payload = buildHostedSmokeSessionTokenPayload({
    E2E_PORTAL_USER_ID: 'user-jarrar',
    E2E_PORTAL_EMAIL: 'jarrar@targonglobal.com',
    E2E_PORTAL_NAME: 'Jarrar Amjad',
    E2E_ACTIVE_TENANT: 'US',
  })
  const after = Date.now()

  assert.equal(payload.sub, 'user-jarrar')
  assert.equal(payload.email, 'jarrar@targonglobal.com')
  assert.equal(payload.activeTenant, 'US')
  assert.equal(typeof payload.entitlements_ver, 'number')
  assert.equal(payload.entitlements_ver >= before && payload.entitlements_ver <= after, true)
  assert.deepEqual(Object.keys(payload.authz.apps), hostedSmokeAppGrants.map((grant) => grant.appSlug))
})
