import test from 'node:test'
import assert from 'node:assert/strict'

import { logAuthError, shouldSuppressAuthError } from './auth-logger'

type AuthLoggerErrorInput = Error & {
  cause?: {
    err?: Error
    [key: string]: unknown
  }
  type?: string
}

function createJwtSessionError(message: string): AuthLoggerErrorInput {
  const error = new Error(
    'JWTSessionError: Read more at https://errors.authjs.dev#jwtsessionerror',
  ) as AuthLoggerErrorInput
  error.cause = { err: new Error(message) }
  error.type = 'JWTSessionError'
  return error
}

test('shouldSuppressAuthError matches the expected stale-session decrypt noise', () => {
  assert.equal(
    shouldSuppressAuthError(createJwtSessionError('no matching decryption secret')),
    true,
  )
  assert.equal(
    shouldSuppressAuthError(createJwtSessionError('decryption operation failed')),
    true,
  )
})

test('shouldSuppressAuthError keeps unrelated auth failures visible', () => {
  assert.equal(
    shouldSuppressAuthError(createJwtSessionError('session callback exploded')),
    false,
  )

  const callbackError = new Error('OAuth callback failed') as AuthLoggerErrorInput
  callbackError.cause = { err: new Error('provider exploded') }
  callbackError.type = 'CallbackRouteError'

  assert.equal(shouldSuppressAuthError(callbackError), false)
})

test('logAuthError skips console output for the expected stale-session decrypt noise', () => {
  const captured: unknown[][] = []
  const logger = {
    error: (...args: unknown[]) => {
      captured.push(args)
    },
  }

  logAuthError(createJwtSessionError('no matching decryption secret'), logger)

  assert.deepEqual(captured, [])
})

test('logAuthError preserves default-style output for unexpected auth errors', () => {
  const captured: unknown[][] = []
  const logger = {
    error: (...args: unknown[]) => {
      captured.push(args)
    },
  }

  const error = new Error('OAuth callback failed') as AuthLoggerErrorInput
  error.cause = {
    err: new Error('provider exploded'),
    provider: 'google',
  }
  error.type = 'CallbackRouteError'

  logAuthError(error, logger)

  assert.equal(captured.length, 3)
  assert.match(String(captured[0][0]), /\[auth\]\[error\]/)
  assert.match(String(captured[0][0]), /CallbackRouteError/)
  assert.match(String(captured[1][0]), /\[auth\]\[cause\]/)
  assert.match(String(captured[2][0]), /\[auth\]\[details\]/)
  assert.match(String(captured[2][1]), /"provider": "google"/)
})
