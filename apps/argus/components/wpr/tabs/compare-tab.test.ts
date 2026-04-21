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

test('compare tab uses shared change tooltips for weekly charts and shared dark styling for the rest', () => {
  const source = readFileSync(new URL('./compare-tab.tsx', import.meta.url), 'utf8')
  const tooltipUsages = source.match(/<Tooltip\b[\s\S]*?\/>/g) ?? []
  const sharedTooltipUsages = tooltipUsages.filter((usage) => usage.includes('{...compareTooltipProps}'))
  const changeTooltipUsages = source.match(/<WprChangeTooltipContent\b/g) ?? []

  assert.match(source, /const compareTooltipProps = \{/)
  assert.equal(tooltipUsages.length, 4)
  assert.equal(sharedTooltipUsages.length, 2)
  assert.equal(changeTooltipUsages.length, 2)
})
