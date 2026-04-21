import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('change timeline exposes the new change dialog controls', () => {
  const source = readFileSync(new URL('./change-timeline.tsx', import.meta.url), 'utf8')

  assert.match(source, /New change/)
  assert.match(source, /DialogTitle[\s\S]*Log a new standardized change/)
  assert.match(source, /label="Entry date"/)
  assert.match(source, /label="Type"/)
  assert.match(source, /label="ASINs"/)
  assert.match(source, /label="What changed \(one per line\)"/)
})
