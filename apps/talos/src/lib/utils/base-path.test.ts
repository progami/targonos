import assert from 'node:assert/strict'
import test from 'node:test'

test('server path inference resolves Talos base path when env is unavailable', async () => {
  const previousBasePath = process.env.BASE_PATH
  const previousPublicBasePath = process.env.NEXT_PUBLIC_BASE_PATH
  delete process.env.BASE_PATH
  delete process.env.NEXT_PUBLIC_BASE_PATH

  const { getBasePath, withoutBasePath } = await import('./base-path')

  assert.equal(getBasePath('/talos'), '/talos')
  assert.equal(getBasePath('/talos/api/tenant/select'), '/talos')
  assert.equal(withoutBasePath('/talos/api/tenant/select', '/talos/api/tenant/select'), '/api/tenant/select')
  assert.equal(withoutBasePath('/talos', '/talos'), '/')

  process.env.BASE_PATH = previousBasePath
  process.env.NEXT_PUBLIC_BASE_PATH = previousPublicBasePath
})
