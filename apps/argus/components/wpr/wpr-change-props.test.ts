import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('dashboard shell passes change entries into all week-based WPR tabs', () => {
  const shellSource = readFileSync(new URL('./wpr-dashboard-shell.tsx', import.meta.url), 'utf8')

  assert.match(shellSource, /<ScpTab bundle=\{bundle\} changeEntries=\{chartChangeEntries\} \/>/)
  assert.match(shellSource, /<BusinessReportsTab bundle=\{bundle\} changeEntries=\{chartChangeEntries\} \/>/)
  assert.match(shellSource, /<CompareTab bundle=\{bundle\} changeEntries=\{chartChangeEntries\} \/>/)
})

test('dashboard shell loads weeks and the selected week bundle instead of the full WPR payload', () => {
  const shellSource = readFileSync(new URL('./wpr-dashboard-shell.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(shellSource, /useWprPayloadQuery/)
  assert.match(shellSource, /useWprWeeksQuery/)
  assert.match(shellSource, /useWprWeekBundleQuery/)
  assert.match(shellSource, /useWprChangeLogWeekQuery/)
  assert.match(shellSource, /useWprSourcesQuery\(activeTab === 'sources'\)/)
  assert.match(shellSource, /weekStartDates=\{weeksQuery\.data\.weekStartDates\}/)
})

test('dashboard shell keeps chart bundles pinned to the default week while changelog follows the selected week', () => {
  const shellSource = readFileSync(new URL('./wpr-dashboard-shell.tsx', import.meta.url), 'utf8')

  assert.match(shellSource, /const bundleWeek = weeksQuery\.data\?\.defaultWeek \?\? null/)
  assert.match(shellSource, /useWprWeekBundleQuery\(bundleWeek, needsBundle\)/)
  assert.match(shellSource, /useWprChangeLogWeekQuery\(bundleWeek, needsChartChangeEntries\)/)
  assert.match(shellSource, /useWprChangeLogWeekQuery\(selectedWeek, activeTab === 'changelog'\)/)
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

test('SQP, SCP, BR, and TST use the shared chart shell with controls only', () => {
  const sqpSource = readFileSync(new URL('./tabs/sqp-weekly-panel.tsx', import.meta.url), 'utf8')
  const scpSource = readFileSync(new URL('./tabs/scp-tab.tsx', import.meta.url), 'utf8')
  const tstSource = readFileSync(new URL('./tabs/tst-weekly-panel.tsx', import.meta.url), 'utf8')
  const brSource = readFileSync(new URL('./tabs/business-reports-tab.tsx', import.meta.url), 'utf8')
  const shellSource = readFileSync(new URL('./wpr-chart-shell.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(shellSource, /data-change-visibility="wpr"/)
  assert.doesNotMatch(shellSource, /title:/)
  assert.doesNotMatch(shellSource, /description:/)
  assert.doesNotMatch(shellSource, /changeSummary:/)
  assert.match(sqpSource, /<WprChartShell/)
  assert.match(scpSource, /<WprChartShell/)
  assert.match(tstSource, /<WprChartShell/)
  assert.match(brSource, /<WprChartShell/)
  assert.doesNotMatch(sqpSource, /<WprChartShell[^>]*title=/)
  assert.doesNotMatch(sqpSource, /<WprChartShell[^>]*description=/)
  assert.doesNotMatch(sqpSource, /<WprChartShell[^>]*changeSummary=/)
  assert.doesNotMatch(scpSource, /<WprChartShell[^>]*title=/)
  assert.doesNotMatch(scpSource, /<WprChartShell[^>]*description=/)
  assert.doesNotMatch(scpSource, /<WprChartShell[^>]*changeSummary=/)
  assert.doesNotMatch(tstSource, /<WprChartShell[^>]*title=/)
  assert.doesNotMatch(tstSource, /<WprChartShell[^>]*description=/)
  assert.doesNotMatch(tstSource, /<WprChartShell[^>]*changeSummary=/)
  assert.doesNotMatch(brSource, /<WprChartShell[^>]*title=/)
  assert.doesNotMatch(brSource, /<WprChartShell[^>]*description=/)
  assert.doesNotMatch(brSource, /<WprChartShell[^>]*changeSummary=/)
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

test('SQP, SCP, BR, and TST use one shared analytics panel shell', () => {
  const analyticsPanelSource = readFileSync(new URL('./wpr-analytics-panel.tsx', import.meta.url), 'utf8')
  const sqpSource = readFileSync(new URL('./tabs/sqp-weekly-panel.tsx', import.meta.url), 'utf8')
  const scpSource = readFileSync(new URL('./tabs/scp-tab.tsx', import.meta.url), 'utf8')
  const brSource = readFileSync(new URL('./tabs/business-reports-tab.tsx', import.meta.url), 'utf8')
  const tstSource = readFileSync(new URL('./tabs/tst-weekly-panel.tsx', import.meta.url), 'utf8')

  assert.match(analyticsPanelSource, /export function WprAnalyticsPanel/)
  assert.match(sqpSource, /<WprAnalyticsPanel/)
  assert.match(scpSource, /<WprAnalyticsPanel/)
  assert.match(brSource, /<WprAnalyticsPanel/)
  assert.match(tstSource, /<WprAnalyticsPanel/)
})

test('week-based analytics panels drop the summary metric strip above the charts', () => {
  const analyticsPanelSource = readFileSync(new URL('./wpr-analytics-panel.tsx', import.meta.url), 'utf8')
  const sqpSource = readFileSync(new URL('./tabs/sqp-weekly-panel.tsx', import.meta.url), 'utf8')
  const scpSource = readFileSync(new URL('./tabs/scp-tab.tsx', import.meta.url), 'utf8')
  const brSource = readFileSync(new URL('./tabs/business-reports-tab.tsx', import.meta.url), 'utf8')
  const tstSource = readFileSync(new URL('./tabs/tst-weekly-panel.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(analyticsPanelSource, /metricColumns/)
  assert.doesNotMatch(analyticsPanelSource, /metrics:/)
  assert.doesNotMatch(sqpSource, /metrics=\{/)
  assert.doesNotMatch(scpSource, /metrics=\{/)
  assert.doesNotMatch(brSource, /metrics=\{/)
  assert.doesNotMatch(tstSource, /metrics=\{/)
})

test('SQP, SCP, BR, and TST use one shared selection panel shell', () => {
  const selectionPanelSource = readFileSync(new URL('./wpr-selection-panel.tsx', import.meta.url), 'utf8')
  const sqpSource = readFileSync(new URL('./tabs/sqp-selection-table.tsx', import.meta.url), 'utf8')
  const scpSource = readFileSync(new URL('./tabs/scp-selection-table.tsx', import.meta.url), 'utf8')
  const brSource = readFileSync(new URL('./tabs/business-reports-selection-table.tsx', import.meta.url), 'utf8')
  const tstSource = readFileSync(new URL('./tabs/tst-selection-table.tsx', import.meta.url), 'utf8')

  assert.match(selectionPanelSource, /export function WprSelectionPanel/)
  assert.match(sqpSource, /<WprSelectionPanel/)
  assert.match(scpSource, /<WprSelectionPanel/)
  assert.match(brSource, /<WprSelectionPanel/)
  assert.match(tstSource, /<WprSelectionPanel/)
})

test('the sticky WPR top bar keeps tab navigation only', () => {
  const topBarSource = readFileSync(new URL('./wpr-top-bar.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(topBarSource, /<Select/)
  assert.doesNotMatch(topBarSource, /onSelectWeek/)
})

test('selection tables own the shared week selector near the table header', () => {
  const selectionPanelSource = readFileSync(new URL('./wpr-selection-panel.tsx', import.meta.url), 'utf8')
  const sqpSource = readFileSync(new URL('./tabs/sqp-selection-table.tsx', import.meta.url), 'utf8')
  const scpSource = readFileSync(new URL('./tabs/scp-selection-table.tsx', import.meta.url), 'utf8')
  const brSource = readFileSync(new URL('./tabs/business-reports-selection-table.tsx', import.meta.url), 'utf8')
  const tstSource = readFileSync(new URL('./tabs/tst-selection-table.tsx', import.meta.url), 'utf8')

  assert.match(selectionPanelSource, /toolbar\?: ReactNode/)
  assert.match(sqpSource, /<WprWeekSelect/)
  assert.match(scpSource, /<WprWeekSelect/)
  assert.match(brSource, /<WprWeekSelect/)
  assert.match(tstSource, /<WprWeekSelect/)
})

test('changelog owns its week selector once the top bar stops rendering one', () => {
  const changelogSource = readFileSync(new URL('./change-timeline.tsx', import.meta.url), 'utf8')
  const changelogTabSource = readFileSync(new URL('./tabs/changelog-tab.tsx', import.meta.url), 'utf8')

  assert.match(changelogSource, /<WprWeekSelect/)
  assert.match(changelogTabSource, /weeks=\{weeks\}/)
  assert.match(changelogTabSource, /weekStartDates=\{weekStartDates\}/)
  assert.match(changelogTabSource, /onSelectWeek=\{onSelectWeek\}/)
})
