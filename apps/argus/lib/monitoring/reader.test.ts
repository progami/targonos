import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('monitoring reader caches the monitoring model between requests', () => {
  const source = readFileSync(new URL('./reader.ts', import.meta.url), 'utf8')

  assert.match(source, /type CacheState/)
  assert.match(source, /let cacheState: CacheState \| null = null/)
  assert.match(source, /let pendingCacheKey: string \| null = null/)
  assert.match(source, /if \(cacheState !== null && cacheState\.key === cacheKey\)/)
})
