import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BRAND_METRICS_SOURCE_LIMIT_NOTE,
  createBrandMetricsAvailabilityLagDetail,
  getLatestCompletedWeekEndDate,
} from './brand-metrics-availability.mjs'

test('getLatestCompletedWeekEndDate returns the most recent Saturday', () => {
  assert.equal(getLatestCompletedWeekEndDate('2026-04-06'), '2026-04-04')
  assert.equal(getLatestCompletedWeekEndDate('2026-04-04'), '2026-04-04')
  assert.equal(getLatestCompletedWeekEndDate('2026-04-03'), '2026-03-28')
})

test('createBrandMetricsAvailabilityLagDetail explains when latest published data trails the latest completed week', () => {
  assert.equal(
    createBrandMetricsAvailabilityLagDetail({
      exportedEndDate: '2026-03-28',
      referenceDate: '2026-04-06',
    }),
    'Brand Metrics availability: latest completed week ended 2026-04-04; exported week ended 2026-03-28 (1 completed week behind).',
  )
})

test('createBrandMetricsAvailabilityLagDetail explains when the latest completed week is available', () => {
  assert.equal(
    createBrandMetricsAvailabilityLagDetail({
      exportedEndDate: '2026-04-04',
      referenceDate: '2026-04-06',
    }),
    'Brand Metrics availability: latest completed week ended 2026-04-04; exported week ended 2026-04-04 (latest completed week available).',
  )
})

test('BRAND_METRICS_SOURCE_LIMIT_NOTE makes the source lag explicit', () => {
  assert.equal(
    BRAND_METRICS_SOURCE_LIMIT_NOTE,
    "Brand Metrics uses Amazon's latest published week, not necessarily the latest completed calendar week. This source typically lags the calendar by about 2 weeks.",
  )
})
