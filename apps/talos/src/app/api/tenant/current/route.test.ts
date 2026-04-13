import assert from 'node:assert/strict'
import test from 'node:test'

async function loadRouteModule() {
  process.env.NEXT_PUBLIC_APP_URL = 'https://os.targonglobal.com/talos'
  process.env.PORTAL_AUTH_URL = 'https://os.targonglobal.com'
  process.env.NEXT_PUBLIC_PORTAL_AUTH_URL = 'https://os.targonglobal.com'
  process.env.NEXTAUTH_URL = 'https://os.targonglobal.com/talos'
  process.env.NEXTAUTH_SECRET = 'test-nextauth-secret'
  process.env.PORTAL_AUTH_SECRET = 'test-portal-auth-secret'
  process.env.COOKIE_DOMAIN = 'localhost'

  return import('./route')
}

test('tenant current uses portal claim memberships instead of tenant DB scans', async () => {
  const { resolveCurrentTenantSelection } = await loadRouteModule()
  const session = {
    user: { email: 'ops@targonglobal.com' },
    authz: {
      version: 1,
      globalRoles: [],
      apps: {
        talos: { departments: ['Ops'], tenantMemberships: ['US', 'UK'] },
      },
    },
    activeTenant: 'UK',
  }

  const result = resolveCurrentTenantSelection(session as never, null)
  assert.deepEqual(result.available, ['US', 'UK'])
  assert.equal(result.current, 'UK')
})

test('tenant current falls back to an allowed cookie tenant when no active tenant is set', async () => {
  const { resolveCurrentTenantSelection } = await loadRouteModule()
  const session = {
    user: { email: 'ops@targonglobal.com' },
    authz: {
      version: 1,
      globalRoles: [],
      apps: {
        talos: { departments: ['Ops'], tenantMemberships: ['US', 'UK'] },
      },
    },
  }

  const result = resolveCurrentTenantSelection(session as never, 'UK')
  assert.deepEqual(result.available, ['US', 'UK'])
  assert.equal(result.current, 'UK')
})

test('tenant current falls back to the default tenant when the portal claim is empty', async () => {
  const { resolveCurrentTenantSelection } = await loadRouteModule()
  const session = {
    user: { email: 'ops@targonglobal.com' },
    authz: {
      version: 1,
      globalRoles: [],
      apps: {
        talos: { departments: ['Ops'], tenantMemberships: [] },
      },
    },
  }

  const result = resolveCurrentTenantSelection(session as never, 'UK')
  assert.deepEqual(result.available, [])
  assert.equal(result.current, 'US')
})
