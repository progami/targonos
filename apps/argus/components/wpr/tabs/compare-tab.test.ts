import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('compare tab uses custom legend content for chart legends', () => {
  const source = readFileSync(new URL('./compare-tab.tsx', import.meta.url), 'utf8')
  const legendUsages = source.match(/<Legend\b[\s\S]*?\/>/g) ?? []
  const customLegendUsages = legendUsages.filter((usage) => usage.includes('content='))

  assert.equal(legendUsages.length, 3)
  assert.equal(customLegendUsages.length, 3)
})
