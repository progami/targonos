import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('brand metrics tab owns the brand metrics chart', () => {
  const source = readFileSync(new URL('./brand-metrics-tab.tsx', import.meta.url), 'utf8')

  assert.match(source, /title="Brand Metrics"/)
  assert.match(source, /dataKey="awareness"/)
  assert.match(source, /dataKey="consideration"/)
  assert.match(source, /dataKey="purchase"/)
  assert.match(source, /<Legend content=\{<CompareChartLegend \/>/)
})

test('brand metrics tab keeps weekly change markers in the chart tooltip', () => {
  const source = readFileSync(new URL('./brand-metrics-tab.tsx', import.meta.url), 'utf8')

  assert.match(source, /buildWeeklyChangeMarkers\(changeEntries\)/)
  assert.match(source, /buildChangeMarkerLookup\(weeklyChangeMarkers\)/)
  assert.match(source, /<WprChangeTooltipContent/)
  assert.match(source, /<RechartsChangeMarkers markers=\{weeklyChangeMarkers\} \/>/)
})
