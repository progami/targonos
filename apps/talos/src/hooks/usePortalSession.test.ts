import assert from 'node:assert/strict'
import test from 'node:test'

import type { Session } from 'next-auth'
import { TenantCode, UserRole } from '@targon/prisma-talos'

import { parsePortalSessionResponse } from './usePortalSession'

test('parsePortalSessionResponse returns the portal session from a JSON response', async () => {
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

  const response = new Response(JSON.stringify(session), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })

  assert.deepEqual(await parsePortalSessionResponse(response), session)
})

test('parsePortalSessionResponse returns null for an unauthorized response', async () => {
  const response = new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })

  assert.equal(await parsePortalSessionResponse(response), null)
})

test('parsePortalSessionResponse returns null when the session endpoint sends html', async () => {
  const response = new Response('<!DOCTYPE html><html><body>Sign in</body></html>', {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  })

  assert.equal(await parsePortalSessionResponse(response), null)
})
