import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveAppAuthOrigin, resolvePortalAuthOrigin } from './index'

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
