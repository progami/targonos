import test from 'node:test'
import assert from 'node:assert/strict'
import { encode } from 'next-auth/jwt'

import {
  decodePortalSession,
  normalizePortalAuthz,
  resolveAppAuthOrigin,
  resolvePortalAuthOrigin,
} from './index'

const ORIGINAL_ENV = { ...process.env }

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    delete process.env[key]
  }
  Object.assign(process.env, ORIGINAL_ENV)
}

test.afterEach(() => {
  resetEnv()
})

test('resolvePortalAuthOrigin prefers the local portal in loopback development requests', () => {
  Object.assign(process.env, { NODE_ENV: 'development' })
  process.env.NEXT_PUBLIC_PORTAL_AUTH_URL = 'https://os.targonglobal.com'
  process.env.PORTAL_AUTH_URL = 'https://os.targonglobal.com'
  process.env.NEXTAUTH_URL = 'https://os.targonglobal.com'

  const origin = resolvePortalAuthOrigin({
    request: {
      url: 'http://localhost:3008/xplan/1-setup',
      headers: new Headers(),
    },
  })

  assert.equal(origin, 'http://localhost:3200')
})

test('resolvePortalAuthOrigin does not treat non-loopback IPv4 request origins as local development', () => {
  Object.assign(process.env, { NODE_ENV: 'development' })
  process.env.NEXT_PUBLIC_PORTAL_AUTH_URL = 'https://os.targonglobal.com'
  process.env.PORTAL_AUTH_URL = 'https://os.targonglobal.com'
  process.env.NEXTAUTH_URL = 'https://os.targonglobal.com'

  const origin = resolvePortalAuthOrigin({
    request: {
      url: 'http://10.0.0.8/xplan/1-setup',
      headers: new Headers(),
    },
  })

  assert.equal(origin, 'https://os.targonglobal.com')
})

test('resolveAppAuthOrigin prefers the loopback request origin over hosted env values', () => {
  Object.assign(process.env, { NODE_ENV: 'development' })
  process.env.NEXT_PUBLIC_APP_URL = 'https://xplan.targonglobal.com/xplan'
  process.env.BASE_URL = 'https://xplan.targonglobal.com/xplan'
  process.env.NEXTAUTH_URL = 'https://xplan.targonglobal.com/xplan'

  const origin = resolveAppAuthOrigin({
    request: {
      url: 'http://localhost:3008/xplan/1-setup',
      headers: new Headers({
        host: 'localhost:3008',
      }),
    },
  })

  assert.equal(origin, 'http://localhost:3008')
})

test('resolveAppAuthOrigin prefers forwarded host and proto for deployed requests', () => {
  delete process.env.NEXT_PUBLIC_APP_URL
  delete process.env.BASE_URL
  delete process.env.NEXTAUTH_URL

  const origin = resolveAppAuthOrigin({
    request: {
      url: 'https://internal.example/internal',
      headers: new Headers({
        'x-forwarded-host': 'ops.targonglobal.com',
        'x-forwarded-proto': 'https',
      }),
    },
  })

  assert.equal(origin, 'https://ops.targonglobal.com')
})

test('resolveAppAuthOrigin prefers configured app origins over forwarded request headers', () => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://xplan.targonglobal.com'
  process.env.BASE_URL = 'https://xplan.targonglobal.com'
  process.env.NEXTAUTH_URL = 'https://xplan.targonglobal.com'

  const origin = resolveAppAuthOrigin({
    request: {
      url: 'https://internal.example/internal',
      headers: new Headers({
        'x-forwarded-host': 'evil.example',
        'x-forwarded-proto': 'https',
      }),
    },
  })

  assert.equal(origin, 'https://xplan.targonglobal.com')
})

test('normalizePortalAuthz preserves tenant memberships and departments', () => {
  const authz = normalizePortalAuthz({
    version: 3,
    globalRoles: ['platform_admin'],
    apps: {
      talos: {
        departments: ['Ops'],
        tenantMemberships: ['tenant-us', 'tenant-uk'],
      },
    },
  })

  assert.deepEqual(authz, {
    version: 3,
    globalRoles: ['platform_admin'],
    apps: {
      talos: {
        departments: ['Ops'],
        tenantMemberships: ['tenant-us', 'tenant-uk'],
      },
    },
  })
})

test('normalizePortalAuthz defaults missing tenant memberships to []', () => {
  const authz = normalizePortalAuthz({
    version: 1,
    globalRoles: [],
    apps: {
      atlas: {
        departments: ['Finance'],
      },
    },
  })

  assert.deepEqual(authz, {
    version: 1,
    globalRoles: [],
    apps: {
      atlas: {
        departments: ['Finance'],
        tenantMemberships: [],
      },
    },
  })
})

test('decodePortalSession applies a signed active tenant cookie when membership still allows it', async () => {
  process.env.PORTAL_AUTH_SECRET = 'test-portal-auth-secret-000000000000'
  process.env.NEXTAUTH_SECRET = process.env.PORTAL_AUTH_SECRET

  const sessionCookieName = '__Secure-next-auth.session-token'
  const sessionToken = await encode({
    token: {
      sub: 'u_1',
      authz: {
        version: 1,
        globalRoles: [],
        apps: {
          talos: {
            departments: ['Ops'],
            tenantMemberships: ['US', 'UK'],
          },
        },
      },
    },
    secret: process.env.PORTAL_AUTH_SECRET,
    salt: sessionCookieName,
  })
  const activeTenantCookie = await encode({
    token: { activeTenant: 'UK' },
    secret: process.env.PORTAL_AUTH_SECRET,
    salt: '__Secure-targon.active-tenant.talos',
  })

  const payload = await decodePortalSession({
    cookieHeader: `${sessionCookieName}=${sessionToken}; __Secure-targon.active-tenant.talos=${activeTenantCookie}`,
    appId: 'talos',
  })

  assert.equal(payload?.activeTenant, 'UK')
})

test('decodePortalSession ignores a signed active tenant cookie after membership is removed', async () => {
  process.env.PORTAL_AUTH_SECRET = 'test-portal-auth-secret-000000000000'
  process.env.NEXTAUTH_SECRET = process.env.PORTAL_AUTH_SECRET

  const sessionCookieName = '__Secure-next-auth.session-token'
  const sessionToken = await encode({
    token: {
      sub: 'u_1',
      authz: {
        version: 1,
        globalRoles: [],
        apps: {
          talos: {
            departments: ['Ops'],
            tenantMemberships: ['US'],
          },
        },
      },
    },
    secret: process.env.PORTAL_AUTH_SECRET,
    salt: sessionCookieName,
  })
  const activeTenantCookie = await encode({
    token: { activeTenant: 'UK' },
    secret: process.env.PORTAL_AUTH_SECRET,
    salt: '__Secure-targon.active-tenant.talos',
  })

  const payload = await decodePortalSession({
    cookieHeader: `${sessionCookieName}=${sessionToken}; __Secure-targon.active-tenant.talos=${activeTenantCookie}`,
    appId: 'talos',
  })

  assert.equal(payload?.activeTenant, undefined)
})

test('decodePortalSession strips an embedded active tenant that is no longer allowed for the app', async () => {
  process.env.PORTAL_AUTH_SECRET = 'test-portal-auth-secret-000000000000'
  process.env.NEXTAUTH_SECRET = process.env.PORTAL_AUTH_SECRET

  const sessionCookieName = '__Secure-next-auth.session-token'
  const sessionToken = await encode({
    token: {
      sub: 'u_1',
      activeTenant: 'UK',
      authz: {
        version: 1,
        globalRoles: [],
        apps: {
          talos: {
            departments: ['Ops'],
            tenantMemberships: ['US'],
          },
        },
      },
    },
    secret: process.env.PORTAL_AUTH_SECRET,
    salt: sessionCookieName,
  })

  const payload = await decodePortalSession({
    cookieHeader: `${sessionCookieName}=${sessionToken}`,
    appId: 'talos',
  })

  assert.equal(payload?.activeTenant, undefined)
})
