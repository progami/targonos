import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveDatedCaseReportRouteState,
  resolveLatestCaseReportRouteState,
} from './route-state'
import {
  readCaseReportMarketLabel,
  type CaseReportBundle,
  type CaseReportMarketSlug,
} from './reader-core'

function buildCaseReportBundle(
  marketSlug: CaseReportMarketSlug,
  reportDate: string,
): CaseReportBundle {
  return {
    reportDate,
    marketCode: marketSlug.toUpperCase(),
    sections: [],
    marketSlug,
    marketLabel: readCaseReportMarketLabel(marketSlug),
    caseRoot: '/tmp/cases',
    reportPath: '/tmp/cases/reports/report.json',
    caseJsonPath: '/tmp/cases/case.json',
    availableReportDates: [reportDate],
    reportSectionsByDate: {
      [reportDate]: [],
    },
    daySummaries: [],
    trackedCaseIds: [],
    caseRecordsById: {},
    generatedAt: null,
  }
}

test('latest case route redirects when the supported market bundle loads', async () => {
  const state = await resolveLatestCaseReportRouteState('us', async (marketSlug) =>
    buildCaseReportBundle(marketSlug, '2026-04-29'),
  )

  assert.deepEqual(state, {
    kind: 'redirect',
    marketSlug: 'us',
    reportDate: '2026-04-29',
  })
})

test('latest case route renders unavailable state instead of 404 when bundle loading fails', async () => {
  const state = await resolveLatestCaseReportRouteState('uk', async () => {
    throw new Error('case source unavailable')
  })

  assert.deepEqual(state, {
    kind: 'unavailable',
    marketLabel: 'UK - Dust Sheets',
    marketSlug: 'uk',
  })
})

test('latest case route rejects unsupported markets before reading data', async () => {
  let readerCalled = false
  const state = await resolveLatestCaseReportRouteState('de', async () => {
    readerCalled = true
    throw new Error('reader should not run')
  })

  assert.deepEqual(state, { kind: 'not_found' })
  assert.equal(readerCalled, false)
})

test('dated case route returns the loaded bundle for supported market and date', async () => {
  const bundle = buildCaseReportBundle('us', '2026-04-29')
  const state = await resolveDatedCaseReportRouteState('us', '2026-04-29', async () => bundle)

  assert.deepEqual(state, {
    kind: 'bundle',
    bundle,
  })
})

test('dated case route renders unavailable state instead of 404 when bundle loading fails', async () => {
  const state = await resolveDatedCaseReportRouteState('us', '2026-04-29', async () => {
    throw new Error('case source unavailable')
  })

  assert.deepEqual(state, {
    kind: 'unavailable',
    marketLabel: 'USA - Dust Sheets',
    marketSlug: 'us',
    reportDate: '2026-04-29',
  })
})

test('dated case route rejects malformed report dates before reading data', async () => {
  let readerCalled = false
  const state = await resolveDatedCaseReportRouteState('us', 'latest', async () => {
    readerCalled = true
    throw new Error('reader should not run')
  })

  assert.deepEqual(state, { kind: 'not_found' })
  assert.equal(readerCalled, false)
})
