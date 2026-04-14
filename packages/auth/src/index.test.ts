import test from 'node:test'
import assert from 'node:assert/strict'
import { encode } from 'next-auth/jwt'

import {
  decodePortalSession,
  getCurrentAuthz,
  hasCapability,
  hasPortalSession,
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

test('resolvePortalAuthOrigin uses configured portal auth env even for loopback requests', () => {
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

  assert.equal(origin, 'https://os.targonglobal.com')
})

test('resolvePortalAuthOrigin fails when portal auth env is missing', () => {
  delete process.env.NEXT_PUBLIC_PORTAL_AUTH_URL
  delete process.env.PORTAL_AUTH_URL
  delete process.env.NEXTAUTH_URL

  assert.throws(
    () => resolvePortalAuthOrigin({
      request: {
        url: 'http://localhost:3008/xplan/1-setup',
        headers: new Headers(),
      },
    }),
    /Portal auth origin is not configured/,
  )
})

test('resolveAppAuthOrigin uses configured app env even when request is loopback', () => {
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

  assert.equal(origin, 'https://xplan.targonglobal.com')
})

test('resolveAppAuthOrigin fails when app auth env is missing', () => {
  delete process.env.NEXT_PUBLIC_APP_URL
  delete process.env.BASE_URL
  delete process.env.NEXTAUTH_URL

  assert.throws(
    () => resolveAppAuthOrigin({
      request: {
        url: 'https://internal.example/internal',
        headers: new Headers({
          'x-forwarded-host': 'ops.targonglobal.com',
          'x-forwarded-proto': 'https',
        }),
      },
    }),
    /Application origin is not configured/,
  )
})

test('resolveAppAuthOrigin ignores forwarded request headers when app auth env is configured', () => {
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

test('hasPortalSession does not probe the portal when session decode fails', async () => {
  process.env.PORTAL_AUTH_SECRET = 'test-portal-auth-secret-000000000000'
  process.env.NEXTAUTH_SECRET = process.env.PORTAL_AUTH_SECRET
  process.env.PORTAL_AUTH_URL = 'https://os.targonglobal.com'

  let fetchCalls = 0

  const result = await hasPortalSession({
    request: new Request('https://os.targonglobal.com/argus', {
      headers: {
        cookie: '__Secure-next-auth.session-token=not-a-valid-session',
      },
    }),
    appId: 'argus',
    fetchImpl: async () => {
      fetchCalls += 1
      return new Response(JSON.stringify({ user: { id: 'u_1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  assert.equal(result, false)
  assert.equal(fetchCalls, 0)
})

test('getCurrentAuthz requires portal-issued authz claims instead of fetching them out-of-band', async () => {
  process.env.PORTAL_AUTH_SECRET = 'test-portal-auth-secret-000000000000'
  process.env.NEXTAUTH_SECRET = process.env.PORTAL_AUTH_SECRET
  process.env.PORTAL_AUTH_URL = 'https://os.targonglobal.com'

  const sessionCookieName = '__Secure-next-auth.session-token'
  const sessionToken = await encode({
    token: {
      sub: 'u_1',
      email: 'user@targonglobal.com',
    },
    secret: process.env.PORTAL_AUTH_SECRET,
    salt: sessionCookieName,
  })

  let fetchCalls = 0

  await assert.rejects(
    () => getCurrentAuthz(
      new Request('https://os.targonglobal.com/argus', {
        headers: {
          cookie: `${sessionCookieName}=${sessionToken}`,
        },
      }),
      {
        appId: 'argus',
        fetchImpl: async () => {
          fetchCalls += 1
          return new Response(JSON.stringify({
            authz: {
              version: 1,
              globalRoles: [],
              apps: {
                argus: {
                  departments: [],
                  tenantMemberships: [],
                },
              },
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        },
      },
    ),
    /AUTH_MISSING_AUTHZ/,
  )

  assert.equal(fetchCalls, 0)
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

test('decodePortalSession does not synthesize a dev session when auth bypass env is set', async () => {
  process.env.NODE_ENV = 'development'
  process.env.ALLOW_DEV_AUTH_DEFAULTS = 'true'
  process.env.ALLOW_DEV_AUTH_SESSION_BYPASS = 'true'

  const payload = await decodePortalSession({
    cookieHeader: null,
    appId: 'argus',
    request: {
      url: 'http://localhost:3216/argus',
      headers: new Headers({
        host: 'localhost:3216',
      }),
    },
  })

  assert.equal(payload, null)
})

test('getCurrentAuthz still throws AUTH_UNAUTHENTICATED when dev bypass env is set', async () => {
  process.env.NODE_ENV = 'development'
  process.env.ALLOW_DEV_AUTH_DEFAULTS = 'true'
  process.env.ALLOW_DEV_AUTH_SESSION_BYPASS = 'true'

  await assert.rejects(
    () => getCurrentAuthz(
      new Request('http://localhost:3216/argus', {
        headers: {
          host: 'localhost:3216',
        },
      }),
      {
        appId: 'argus',
      },
    ),
    /AUTH_UNAUTHENTICATED/,
  )
})

test('hasCapability returns false without authz even when dev bypass env is set', () => {
  process.env.NODE_ENV = 'development'
  process.env.ALLOW_DEV_AUTH_DEFAULTS = 'true'
  process.env.ALLOW_DEV_AUTH_SESSION_BYPASS = 'true'

  assert.equal(
    hasCapability({
      session: null,
      appId: 'xplan',
      capability: 'enter',
    }),
    false,
  )
})
