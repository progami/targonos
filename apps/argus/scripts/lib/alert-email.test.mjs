import assert from 'node:assert/strict'
import { test } from 'node:test'

test('alert email local env loading does not require shared env files', async () => {
  const previousArgusMode = process.env.ARGUS_ENV_MODE
  const previousTargonosMode = process.env.TARGONOS_ENV_MODE

  process.env.ARGUS_ENV_MODE = 'local'
  delete process.env.TARGONOS_ENV_MODE

  try {
    const { loadMonitoringEnv } = await import('./alert-email.mjs')
    assert.doesNotThrow(() => loadMonitoringEnv())
  } finally {
    if (previousArgusMode === undefined) {
      delete process.env.ARGUS_ENV_MODE
    } else {
      process.env.ARGUS_ENV_MODE = previousArgusMode
    }
    if (previousTargonosMode === undefined) {
      delete process.env.TARGONOS_ENV_MODE
    } else {
      process.env.TARGONOS_ENV_MODE = previousTargonosMode
    }
  }
})
