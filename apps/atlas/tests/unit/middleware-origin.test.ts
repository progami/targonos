import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveAppOrigin } from '../../lib/request-origin'

test('resolveAppOrigin uses normalized nextUrl.protocol when x-forwarded-proto is missing', () => {
  const request = {
    headers: new Headers({
      'x-forwarded-host': 'example.com',
    }),
    nextUrl: {
      protocol: 'https:',
    },
  } as any

  assert.equal(resolveAppOrigin(request), 'https://example.com')
})
