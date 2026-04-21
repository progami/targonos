import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('source heatmap renders presence-only cells without file count badges', () => {
  const source = readFileSync(new URL('./source-heatmap.tsx', import.meta.url), 'utf8')

  assert.match(source, /const isPresent = cell\.present;/)
  assert.doesNotMatch(source, /cell\.file_count/)
  assert.doesNotMatch(source, /\{cell\.file_count\}/)
})
