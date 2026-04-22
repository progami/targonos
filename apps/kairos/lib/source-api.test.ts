import { afterEach, describe, expect, it, vi } from 'vitest'

describe('getTimeSeriesCsvPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('prefixes the Kairos base path for CSV imports', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/kairos')

    const { getTimeSeriesCsvPath } = await import('./source-api')

    expect(getTimeSeriesCsvPath()).toBe('/kairos/api/v1/time-series/csv')
  })
})
