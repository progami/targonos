import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('monitoring bootstrap route delegates to getMonitoringBootstrap', () => {
  const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')

  assert.match(source, /getMonitoringBootstrap/)
  assert.match(source, /export async function GET/)
})
