import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'

const ORIGINAL_ENV = { ...process.env }

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    delete process.env[key]
  }
  Object.assign(process.env, ORIGINAL_ENV)
}

function setSharedEnv() {
  Object.assign(process.env, {
    NODE_ENV: 'development',
    BASE_PATH: '/argus',
    NEXT_PUBLIC_BASE_PATH: '/argus',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3216/argus',
    PORTAL_AUTH_URL: 'http://localhost:3200',
    NEXT_PUBLIC_PORTAL_AUTH_URL: 'http://localhost:3200',
    PORTAL_AUTH_SECRET: 'test-portal-auth-secret-000000000000',
    NEXTAUTH_SECRET: 'test-portal-auth-secret-000000000000',
  })
}

test.afterEach(() => {
  resetEnv()
})

test('middleware allows localhost requests when dev auth session bypass is enabled', async () => {
  setSharedEnv()
  process.env.ALLOW_DEV_AUTH_SESSION_BYPASS = '1'

  const mod = await import('./middleware')
  const response = await mod.middleware(new NextRequest('http://localhost:3216/argus/api/wpr/weeks'))

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-middleware-next'), '1')
})

test('middleware still rejects non-localhost requests when dev auth session bypass is enabled', async () => {
  setSharedEnv()
  process.env.ALLOW_DEV_AUTH_SESSION_BYPASS = '1'
  process.env.NEXT_PUBLIC_APP_URL = 'https://dev-os.targonglobal.com/argus'
  process.env.PORTAL_AUTH_URL = 'https://dev-os.targonglobal.com'
  process.env.NEXT_PUBLIC_PORTAL_AUTH_URL = 'https://dev-os.targonglobal.com'

  const mod = await import('./middleware')
  const response = await mod.middleware(new NextRequest('https://dev-os.targonglobal.com/argus/api/wpr/weeks'))

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), {
    error: 'Authentication required',
    reason: 'unauthenticated',
  })
})
