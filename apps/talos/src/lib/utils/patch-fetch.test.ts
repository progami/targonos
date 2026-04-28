import assert from 'node:assert/strict'
import test from 'node:test'

test('patched fetch rejects non-json Talos API responses before the JSON parser', async () => {
  const previousFetch = globalThis.fetch
  const previousBasePath = process.env.BASE_PATH
  const previousPublicBasePath = process.env.NEXT_PUBLIC_BASE_PATH
  const apiPath = ['', 'api', 'dashboard', 'overview'].join('/')
  let fetchedInput: RequestInfo | URL | undefined

  try {
    process.env.NEXT_PUBLIC_BASE_PATH = '/talos'
    delete process.env.BASE_PATH
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchedInput = input
      return new Response('<!DOCTYPE html>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }) as typeof fetch

    await import(`./patch-fetch.ts?non-json-${Date.now()}`)

    const response = await fetch(apiPath)
    assert.equal(fetchedInput, '/talos/api/dashboard/overview')
    await assert.rejects(
      () => response.json(),
      /Talos API expected JSON but received text\/html; charset=utf-8 from \/talos\/api\/dashboard\/overview \(404\)/,
    )
  } finally {
    globalThis.fetch = previousFetch
    if (typeof previousBasePath === 'string') {
      process.env.BASE_PATH = previousBasePath
    } else {
      delete process.env.BASE_PATH
    }
    if (typeof previousPublicBasePath === 'string') {
      process.env.NEXT_PUBLIC_BASE_PATH = previousPublicBasePath
    } else {
      delete process.env.NEXT_PUBLIC_BASE_PATH
    }
  }
})
