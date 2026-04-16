import assert from 'node:assert/strict'
import test from 'node:test'

test('legacy csrf fetch wrapper prefixes Talos API paths before issuing the request', async () => {
  const previousBasePath = process.env.NEXT_PUBLIC_BASE_PATH
  process.env.NEXT_PUBLIC_BASE_PATH = '/talos'

  Object.defineProperty(globalThis, 'window', {
    value: {},
    configurable: true,
  })

  Object.defineProperty(globalThis, 'document', {
    value: { cookie: 'csrf-token=token-123' },
    configurable: true,
  })

  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init })
    return new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  const { fetchWithCSRF } = await import('./csrf')
  await fetchWithCSRF('/api/reports', {
    method: 'POST',
    body: JSON.stringify({ month: '2026-04' }),
  })

  assert.equal(calls[0]?.input, '/talos/api/reports')

  globalThis.fetch = originalFetch
  process.env.NEXT_PUBLIC_BASE_PATH = previousBasePath
})
