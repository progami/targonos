import test from 'node:test'
import assert from 'node:assert/strict'

import { formatDashboardCurrency } from './currency'

test('formatDashboardCurrency uses USD for the US tenant', () => {
  assert.equal(formatDashboardCurrency(0, 'US'), '$0.00')
})

test('formatDashboardCurrency uses GBP for the UK tenant', () => {
  assert.equal(formatDashboardCurrency(1234.5, 'UK'), '£1,234.50')
})

test('formatDashboardCurrency rejects unknown tenant codes', () => {
  assert.throws(
    () => formatDashboardCurrency(10, 'CA'),
    /Invalid tenant code for dashboard currency/
  )
})
