import assert from 'node:assert/strict'
import test from 'node:test'

import { isTenantAllowedForSession } from '@/lib/tenant/session'
import { buildPortalActiveTenantRequest, shouldPersistPortalActiveTenant } from './portal-request'

process.env.NEXT_PUBLIC_APP_URL = 'https://os.targonglobal.com/talos'
process.env.PORTAL_AUTH_URL = 'https://os.targonglobal.com'
process.env.NEXT_PUBLIC_PORTAL_AUTH_URL = 'https://os.targonglobal.com'
process.env.NEXTAUTH_URL = 'https://os.targonglobal.com/talos'
process.env.NEXTAUTH_SECRET = 'test-nextauth-secret'
process.env.PORTAL_AUTH_SECRET = 'test-portal-auth-secret'
process.env.COOKIE_DOMAIN = 'localhost'

test('tenant select rejects a tenant outside the portal claim', () => {
  const session = {
    user: { email: 'ops@targonglobal.com' },
    authz: {
      version: 1,
      globalRoles: [],
      apps: {
        talos: { departments: ['Ops'], tenantMemberships: ['US'] },
      },
    },
  }

  assert.equal(isTenantAllowedForSession(session as never, 'UK'), false)
})

test('tenant select forwards portal active-tenant persistence through the portal auth endpoint', async () => {
  const request = new Request('https://os.targonglobal.com/talos/api/tenant/select', {
    method: 'POST',
    headers: {
      cookie: '__Secure-next-auth.session-token=token-value',
    },
  })

  const portalRequest = buildPortalActiveTenantRequest(request, 'UK')

  assert.equal(portalRequest.url.toString(), 'https://os.targonglobal.com/api/v1/session/active-tenant')
  assert.deepEqual(portalRequest.init.headers, {
    'content-type': 'application/json',
    cookie: '__Secure-next-auth.session-token=token-value',
  })
  assert.equal(portalRequest.init.body, JSON.stringify({ appId: 'talos', tenantCode: 'UK' }))
})

test('tenant select skips portal active-tenant persistence in worktree dev auth mode', () => {
  process.env.TARGON_WORKTREE_DEV_AUTH = 'true'
  assert.equal(shouldPersistPortalActiveTenant(), false)
  delete process.env.TARGON_WORKTREE_DEV_AUTH
})
