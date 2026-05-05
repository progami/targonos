import assert from 'node:assert/strict'
import { test } from 'node:test'

test('alert email loads Argus env through shared loader', async () => {
  const previousArgusMode = process.env.ARGUS_ENV_MODE
  const previousTargonosMode = process.env.TARGONOS_ENV_MODE
  const previousRegion = process.env.AMAZON_SP_API_REGION_US

  process.env.ARGUS_ENV_MODE = 'ci'
  delete process.env.TARGONOS_ENV_MODE
  delete process.env.AMAZON_SP_API_REGION_US

  try {
    const { loadMonitoringEnv } = await import('./alert-email.mjs')
    assert.doesNotThrow(() => loadMonitoringEnv())
    assert.equal(process.env.AMAZON_SP_API_REGION_US, 'na')
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
    if (previousRegion === undefined) {
      delete process.env.AMAZON_SP_API_REGION_US
    } else {
      process.env.AMAZON_SP_API_REGION_US = previousRegion
    }
  }
})
