import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('compare tab uses custom legend content for chart legends', () => {
  const source = readFileSync(new URL('./compare-tab.tsx', import.meta.url), 'utf8')
  const legendUsages = source.match(/<Legend\b[\s\S]*?\/>/g) ?? []
  const customLegendUsages = legendUsages.filter((usage) => usage.includes('content='))

  assert.equal(legendUsages.length, 2)
  assert.equal(customLegendUsages.length, 2)
})

test('compare tab uses shared change tooltips for weekly charts and shared dark styling for the rest', () => {
  const source = readFileSync(new URL('./compare-tab.tsx', import.meta.url), 'utf8')
  const tooltipUsages = source.match(/<Tooltip\b[\s\S]*?\/>/g) ?? []
  const sharedTooltipUsages = tooltipUsages.filter((usage) => usage.includes('{...compareTooltipProps}'))
  const changeTooltipUsages = source.match(/<WprChangeTooltipContent\b/g) ?? []

  assert.match(source, /const compareTooltipProps = \{/)
  assert.equal(tooltipUsages.length, 3)
  assert.equal(sharedTooltipUsages.length, 2)
  assert.equal(changeTooltipUsages.length, 1)
  assert.equal(source.match(/labelText=\{/g)?.length, 1)
})

test('compare tab no longer owns brand metrics', () => {
  const source = readFileSync(new URL('./compare-tab.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /Brand Metrics/)
  assert.doesNotMatch(source, /dataKey="awareness"/)
  assert.doesNotMatch(source, /dataKey="consideration"/)
  assert.doesNotMatch(source, /dataKey="purchase"/)
})
