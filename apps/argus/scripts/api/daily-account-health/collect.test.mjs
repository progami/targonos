import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./collect.mjs', import.meta.url), 'utf8')

test('account health skips stale active reports instead of pinning launchd', () => {
  assert.match(source, /ACTIVE_REPORT_REUSE_MAX_AGE_MS = 30 \* 60 \* 1000/)
  assert.match(source, /Date\.parse\(report\?\.createdTime\)/)
  assert.match(source, /nowMs - createdMs <= ACTIVE_REPORT_REUSE_MAX_AGE_MS/)
})
