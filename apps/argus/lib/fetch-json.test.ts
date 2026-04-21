import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAppPath, readJsonOrThrow } from './fetch-json'

test('buildAppPath uses the normalized public base path', () => {
  const previous = process.env.NEXT_PUBLIC_BASE_PATH
  process.env.NEXT_PUBLIC_BASE_PATH = '/argus/argus'

  try {
    assert.equal(buildAppPath('/api/monitoring/bootstrap'), '/argus/api/monitoring/bootstrap')
  } finally {
    process.env.NEXT_PUBLIC_BASE_PATH = previous
  }
})

test('readJsonOrThrow parses a successful JSON response', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })

  try {
    const payload = await readJsonOrThrow<{ ok: boolean }>('/api/test')
    assert.deepEqual(payload, { ok: true })
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('readJsonOrThrow throws a clear error for non-JSON responses', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response('<!DOCTYPE html><html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })

  try {
    await assert.rejects(
      readJsonOrThrow('/api/test'),
      /Expected JSON response for \/api\/test but received "text\/html; charset=utf-8"\./,
    )
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('readJsonOrThrow surfaces JSON API errors', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'No access to Argus' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })

  try {
    await assert.rejects(readJsonOrThrow('/api/test'), /No access to Argus/)
  } finally {
    globalThis.fetch = previousFetch
  }
})
