import assert from 'node:assert/strict'
import { test } from 'node:test'

import { selectEmailEvents } from './alert-selection.mjs'

test('selects BSR changes for hourly alert email', () => {
  const events = [
    {
      asin: 'B0LOWNOISE',
      severity: 'low',
      changed_fields: ['root_bsr_rank'],
    },
  ]

  assert.deepEqual(selectEmailEvents(events).map((event) => event.asin), ['B0LOWNOISE'])
})

test('selects high and critical non-BSR changes for hourly alert email', () => {
  const events = [
    {
      asin: 'B0PRICEHIGH',
      severity: 'high',
      changed_fields: ['lowest_fba_landed_price', 'total_offer_count'],
    },
    {
      asin: 'B0IMAGECRIT',
      severity: 'critical',
      changed_fields: ['image_urls'],
    },
  ]

  assert.deepEqual(selectEmailEvents(events).map((event) => event.asin), [
    'B0PRICEHIGH',
    'B0IMAGECRIT',
  ])
})

test('does not select medium or low non-BSR changes for hourly alert email', () => {
  const events = [
    {
      asin: 'B0MEDIUM',
      severity: 'medium',
      changed_fields: ['total_offer_count'],
    },
    {
      asin: 'B0LOW',
      severity: 'low',
      changed_fields: ['brand'],
    },
  ]

  assert.deepEqual(selectEmailEvents(events), [])
})
