import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveAppOrigin } from '../../lib/request-origin'

test('resolveAppOrigin uses NEXT_PUBLIC_APP_URL when available', () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3106/atlas'

  try {
    const request = {
      headers: new Headers(),
      nextUrl: { protocol: 'https:' },
    } as any

    assert.equal(resolveAppOrigin(request), 'http://localhost:3106')
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previous
    }
  }
})

test('resolveAppOrigin throws when no env is configured', () => {
  const prevPublic = process.env.NEXT_PUBLIC_APP_URL
  const prevBase = process.env.BASE_URL
  const prevNextAuth = process.env.NEXTAUTH_URL

  delete process.env.NEXT_PUBLIC_APP_URL
  delete process.env.BASE_URL
  delete process.env.NEXTAUTH_URL

  try {
    const request = {
      headers: new Headers({
        'x-forwarded-host': 'example.com',
        'x-forwarded-proto': 'https',
      }),
      nextUrl: {
        protocol: 'http:',
        origin: 'http://attacker.invalid',
      },
    } as any

    assert.throws(() => resolveAppOrigin(request), /Unable to resolve application origin/)
  } finally {
    if (prevPublic === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = prevPublic
    }
    if (prevBase === undefined) {
      delete process.env.BASE_URL
    } else {
      process.env.BASE_URL = prevBase
    }
    if (prevNextAuth === undefined) {
      delete process.env.NEXTAUTH_URL
    } else {
      process.env.NEXTAUTH_URL = prevNextAuth
    }
  }
})
