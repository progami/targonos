import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveAppOrigin } from '../../lib/request-origin'

test('resolveAppOrigin prefers configured app origins over loopback request origins', () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL
  process.env.NEXT_PUBLIC_APP_URL = 'https://atlas.targonglobal.com/atlas'

  try {
    const request = {
      headers: new Headers({
        host: 'localhost:3106',
      }),
      nextUrl: {
        origin: 'http://localhost:3106',
      },
      url: 'http://localhost:3106/atlas/dashboard',
    } as any

    assert.equal(resolveAppOrigin(request), 'https://atlas.targonglobal.com')
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previous
    }
  }
})

test('resolveAppOrigin throws when app auth env is not configured', () => {
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

    assert.throws(
      () => resolveAppOrigin(request),
      /Application origin is not configured/,
    )
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

test('resolveAppOrigin prefers configured app origins over forwarded request headers', () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL
  process.env.NEXT_PUBLIC_APP_URL = 'https://atlas.targonglobal.com'

  try {
    const request = {
      headers: new Headers({
        'x-forwarded-host': 'evil.example',
        'x-forwarded-proto': 'https',
      }),
      nextUrl: {
        origin: 'https://internal.example',
      },
    } as any

    assert.equal(resolveAppOrigin(request), 'https://atlas.targonglobal.com')
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previous
    }
  }
})
