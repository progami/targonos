import assert from 'node:assert/strict'
import test from 'node:test'

function restoreEnv(name: string, value: string | undefined) {
  if (typeof value === 'string') {
    process.env[name] = value
  } else {
    delete process.env[name]
  }
}

test('buildTalosApiPath prefixes Talos api paths exactly once', async () => {
  const previousPublicBasePath = process.env.NEXT_PUBLIC_BASE_PATH
  process.env.NEXT_PUBLIC_BASE_PATH = '/talos'

  try {
    const { buildTalosApiPath } = await import('./talos-api-path')

    assert.equal(buildTalosApiPath('/api/warehouses'), '/talos/api/warehouses')
    assert.equal(buildTalosApiPath('/talos/api/warehouses'), '/talos/api/warehouses')
    assert.equal(buildTalosApiPath('/dashboard'), '/dashboard')
    assert.throws(() => buildTalosApiPath('api/warehouses'), /must start with "\/"/i)
  } finally {
    restoreEnv('NEXT_PUBLIC_BASE_PATH', previousPublicBasePath)
  }
})

test('buildTalosApiPath rejects root api paths when no Talos base path is available', async () => {
  const previousBasePath = process.env.BASE_PATH
  const previousPublicBasePath = process.env.NEXT_PUBLIC_BASE_PATH
  delete process.env.BASE_PATH
  delete process.env.NEXT_PUBLIC_BASE_PATH

  try {
    const { buildTalosApiPath } = await import('./talos-api-path')

    assert.throws(
      () => buildTalosApiPath('/api/dashboard/overview'),
      /Talos API paths require a base path/i,
    )
  } finally {
    restoreEnv('BASE_PATH', previousBasePath)
    restoreEnv('NEXT_PUBLIC_BASE_PATH', previousPublicBasePath)
  }
})
