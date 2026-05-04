import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAppCallbackUrl } from './portal'

const originalBasePath = process.env.BASE_PATH
const originalPublicBasePath = process.env.NEXT_PUBLIC_BASE_PATH

test.afterEach(() => {
  if (typeof originalBasePath === 'string') {
    process.env.BASE_PATH = originalBasePath
  } else {
    delete process.env.BASE_PATH
  }

  if (typeof originalPublicBasePath === 'string') {
    process.env.NEXT_PUBLIC_BASE_PATH = originalPublicBasePath
  } else {
    delete process.env.NEXT_PUBLIC_BASE_PATH
  }
})

test('buildAppCallbackUrl prefixes the Talos base path', () => {
  process.env.BASE_PATH = '/talos'
  process.env.NEXT_PUBLIC_BASE_PATH = '/talos'

  assert.equal(
    buildAppCallbackUrl('/dashboard', 'https://dev-os.targonglobal.com'),
    'https://dev-os.targonglobal.com/talos/dashboard',
  )
})

test('buildAppCallbackUrl rejects relative app paths', () => {
  process.env.BASE_PATH = '/talos'
  process.env.NEXT_PUBLIC_BASE_PATH = '/talos'

  assert.throws(
    () => buildAppCallbackUrl('dashboard', 'https://dev-os.targonglobal.com'),
    /absolute app path/,
  )
})

test('buildAppCallbackUrl prefixes the Talos base path for market routes', () => {
  process.env.BASE_PATH = '/talos'
  process.env.NEXT_PUBLIC_BASE_PATH = '/talos'

  assert.equal(
    buildAppCallbackUrl('/market/orders', 'https://dev-os.targonglobal.com'),
    'https://dev-os.targonglobal.com/talos/market/orders',
  )
})

test('buildAppCallbackUrl preserves query strings for operations routes', () => {
  process.env.BASE_PATH = '/talos'
  process.env.NEXT_PUBLIC_BASE_PATH = '/talos'

  assert.equal(
    buildAppCallbackUrl('/operations/inbound?tenant=UK', 'https://dev-os.targonglobal.com'),
    'https://dev-os.targonglobal.com/talos/operations/inbound?tenant=UK',
  )
})
