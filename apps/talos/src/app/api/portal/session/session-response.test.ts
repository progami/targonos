import assert from 'node:assert/strict'
import test from 'node:test'

import type { Session } from 'next-auth'
import { TenantCode, UserRole } from '@targon/prisma-talos'

import { buildPortalSessionResponse } from './session-response'

test('buildPortalSessionResponse returns the portal session json payload', async () => {
  const session = {
    expires: '2026-12-31T23:59:59.000Z',
    user: {
      id: 'user_1',
      email: 'ops@targonglobal.com',
      name: 'Ops User',
      role: UserRole.admin,
      region: TenantCode.US,
    },
  } satisfies Session

  const response = await buildPortalSessionResponse(async () => session)

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/json')
  assert.deepEqual(await response.json(), session)
})

test('buildPortalSessionResponse returns unauthorized json when the session is missing', async () => {
  const response = await buildPortalSessionResponse(async () => null)

  assert.equal(response.status, 401)
  assert.equal(response.headers.get('content-type'), 'application/json')
  assert.deepEqual(await response.json(), { error: 'Unauthorized' })
})

test('buildPortalSessionResponse returns unauthorized json when auth decode fails', async () => {
  const response = await buildPortalSessionResponse(async () => {
    const error = new Error('JWTSessionError: decrypt failed')
    error.name = 'JWTSessionError'
    throw error
  })

  assert.equal(response.status, 401)
  assert.equal(response.headers.get('content-type'), 'application/json')
  assert.deepEqual(await response.json(), { error: 'Unauthorized' })
})
