import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('dashboard shell passes change entries into all week-based WPR tabs', () => {
  const shellSource = readFileSync(new URL('./wpr-dashboard-shell.tsx', import.meta.url), 'utf8')

  assert.match(shellSource, /<ScpTab bundle=\{bundle\} changeEntries=\{changeEntries\} \/>/)
  assert.match(shellSource, /<BusinessReportsTab bundle=\{bundle\} changeEntries=\{changeEntries\} \/>/)
  assert.match(shellSource, /<CompareTab bundle=\{bundle\} changeEntries=\{changeEntries\} \/>/)
})

test('dashboard shell loads weeks and the selected week bundle instead of the full WPR payload', () => {
  const shellSource = readFileSync(new URL('./wpr-dashboard-shell.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(shellSource, /useWprPayloadQuery/)
  assert.match(shellSource, /useWprWeeksQuery/)
  assert.match(shellSource, /useWprWeekBundleQuery/)
  assert.match(shellSource, /useWprChangeLogWeekQuery/)
  assert.match(shellSource, /useWprSourcesQuery\(activeTab === 'sources'\)/)
})

test('tst tab forwards change entries into the weekly panel', () => {
  const tabSource = readFileSync(new URL('./tabs/tst-tab.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(tabSource, /changeEntries:\s*_changeEntries/)
  assert.match(tabSource, /<TstWeeklyPanel[\s\S]*changeEntries=\{changeEntries\}/)
})

test('business reports chart keeps a dedicated SVG change overlay', () => {
  const tabSource = readFileSync(new URL('./tabs/business-reports-tab.tsx', import.meta.url), 'utf8')

  assert.match(tabSource, /data-change-overlay="business-reports"/)
  assert.match(tabSource, /<BusinessReportsChangeOverlay chartRootRef=\{chartRootRef\} markers=\{changeMarkers\} \/>/)
})

test('business reports uses one exclusive selector for weekly versus daily view mode', () => {
  const tabSource = readFileSync(new URL('./tabs/business-reports-tab.tsx', import.meta.url), 'utf8')

  assert.match(tabSource, /<ToggleButtonGroup/)
  assert.match(tabSource, /aria-label="Business Reports view mode"/)
  assert.match(tabSource, /exclusive/)
  assert.match(tabSource, /<ToggleButton value="weekly">Weekly<\/ToggleButton>/)
  assert.match(tabSource, /<ToggleButton value="daily">Daily<\/ToggleButton>/)
})

test('SQP, SCP, BR, and TST use the shared chart shell with visible change summaries', () => {
  const sqpSource = readFileSync(new URL('./tabs/sqp-weekly-panel.tsx', import.meta.url), 'utf8')
  const scpSource = readFileSync(new URL('./tabs/scp-tab.tsx', import.meta.url), 'utf8')
  const tstSource = readFileSync(new URL('./tabs/tst-weekly-panel.tsx', import.meta.url), 'utf8')
  const brSource = readFileSync(new URL('./tabs/business-reports-tab.tsx', import.meta.url), 'utf8')
  const shellSource = readFileSync(new URL('./wpr-chart-shell.tsx', import.meta.url), 'utf8')

  assert.match(shellSource, /data-change-visibility="wpr"/)
  assert.match(sqpSource, /<WprChartShell/)
  assert.match(scpSource, /<WprChartShell/)
  assert.match(tstSource, /<WprChartShell/)
  assert.match(brSource, /<WprChartShell/)
  assert.match(sqpSource, /summarizeChangeMarkers\(changeMarkers, 'week'\)/)
  assert.match(scpSource, /summarizeChangeMarkers\(changeMarkers, 'week'\)/)
  assert.match(tstSource, /summarizeChangeMarkers\(changeMarkers, 'week'\)/)
  assert.match(brSource, /summarizeChangeMarkers\(changeMarkers, viewMode === 'weekly' \? 'week' : 'day'\)/)
})

test('all week-based WPR charts use the shared change tooltip renderer', () => {
  const scpSource = readFileSync(new URL('./tabs/scp-tab.tsx', import.meta.url), 'utf8')
  const tstSource = readFileSync(new URL('./tabs/tst-weekly-panel.tsx', import.meta.url), 'utf8')
  const brSource = readFileSync(new URL('./tabs/business-reports-tab.tsx', import.meta.url), 'utf8')
  const compareSource = readFileSync(new URL('./tabs/compare-tab.tsx', import.meta.url), 'utf8')

  assert.match(scpSource, /<WprChangeTooltipContent/)
  assert.match(tstSource, /<WprChangeTooltipContent/)
  assert.match(brSource, /<WprChangeTooltipContent/)
  assert.equal(compareSource.match(/<WprChangeTooltipContent/g)?.length, 2)
})
