import test from 'node:test'
import assert from 'node:assert/strict'

import { buildRecoverableAuthResponse } from './auth-route-recovery'

test('buildRecoverableAuthResponse returns null JSON for the session endpoint', async () => {
  const response = buildRecoverableAuthResponse({
    pathname: '/api/auth/session',
    requestUrl: 'https://dev-os.targonglobal.com/api/auth/session',
    cookieDomain: '.targonglobal.com',
    requestCookieNames: ['__Secure-next-auth.session-token'],
  })

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /application\/json/)
  assert.equal(await response.json(), null)
  assert.match(response.headers.get('set-cookie') ?? '', /__Secure-next-auth\.session-token=;/)
})

test('buildRecoverableAuthResponse redirects browser routes back to login', () => {
  const response = buildRecoverableAuthResponse({
    pathname: '/api/auth/signout',
    requestUrl: 'https://dev-os.targonglobal.com/api/auth/signout',
    cookieDomain: '.targonglobal.com',
    requestCookieNames: ['__Secure-next-auth.session-token'],
  })

  assert.equal(response.status, 307)
  assert.equal(response.headers.get('location'), 'https://dev-os.targonglobal.com/login')
  assert.match(response.headers.get('set-cookie') ?? '', /__Secure-next-auth\.session-token=;/)
})
