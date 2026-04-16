import assert from 'node:assert/strict'
import test from 'node:test'

test('buildTalosApiPath prefixes Talos api paths exactly once', async () => {
  const previousBasePath = process.env.NEXT_PUBLIC_BASE_PATH
  process.env.NEXT_PUBLIC_BASE_PATH = '/talos'

  const { buildTalosApiPath } = await import('./talos-api-path')

  assert.equal(buildTalosApiPath('/api/warehouses'), '/talos/api/warehouses')
  assert.equal(buildTalosApiPath('/talos/api/warehouses'), '/talos/api/warehouses')
  assert.equal(buildTalosApiPath('/dashboard'), '/dashboard')
  assert.throws(() => buildTalosApiPath('api/warehouses'), /must start with "\/"/i)

  process.env.NEXT_PUBLIC_BASE_PATH = previousBasePath
})
