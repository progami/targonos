import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWeekStartDateLookup,
  formatWeekLabelWithDateRange,
  formatWeekWindowLabel,
} from './week-display'

test('formatWeekLabelWithDateRange appends the weekly date span', () => {
  assert.equal(formatWeekLabelWithDateRange('W16', '2026-04-13'), 'W16 · 13 Apr - 19 Apr 26')
})

test('formatWeekWindowLabel appends the overall date span for a week window', () => {
  assert.equal(
    formatWeekWindowLabel(['W15', 'W16'], {
      W15: '2026-04-06',
      W16: '2026-04-13',
    }),
    'W15 - W16 · 06 Apr - 19 Apr 26',
  )
})

test('buildWeekStartDateLookup collects week start dates from weekly series rows', () => {
  assert.deepEqual(
    buildWeekStartDateLookup([
      { week_label: 'W15', start_date: '2026-04-06' },
      { week_label: 'W16', start_date: '2026-04-13' },
    ]),
    {
      W15: '2026-04-06',
      W16: '2026-04-13',
    },
  )
})
