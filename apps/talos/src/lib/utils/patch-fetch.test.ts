import assert from 'node:assert/strict'
import test from 'node:test'

test('patched fetch rejects non-json Talos API responses before the JSON parser', async () => {
  const previousFetch = globalThis.fetch
  const previousBasePath = process.env.BASE_PATH
  const previousPublicBasePath = process.env.NEXT_PUBLIC_BASE_PATH
  const apiPath = ['', 'api', 'dashboard', 'overview'].join('/')
  const portalApiUrl = new URL('https://os.targonglobal.com/api/v1/session/active-tenant')
  const fetchedInputs: Array<RequestInfo | URL> = []

  try {
    process.env.NEXT_PUBLIC_BASE_PATH = '/talos'
    delete process.env.BASE_PATH
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchedInputs.push(input)
      if (input === portalApiUrl) {
        return Response.json({ ok: true })
      }

      return new Response('<!DOCTYPE html>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }) as typeof fetch

    await import(`./patch-fetch.ts?non-json-${Date.now()}`)

    const response = await fetch(apiPath)
    assert.equal(fetchedInputs[0], '/talos/api/dashboard/overview')
    await assert.rejects(
      () => response.json(),
      /Talos API expected JSON but received text\/html; charset=utf-8 from \/talos\/api\/dashboard\/overview \(404\)/,
    )

    await fetch(portalApiUrl)
    assert.equal(fetchedInputs[1], portalApiUrl)
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
