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
