import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getQueryableInboundOrderStatuses,
  getVisibleInboundOrderStatuses,
} from '../../src/lib/inbound/workflow'

test('inbound reads keep legacy compatibility statuses visible until cleanup is complete', () => {
  assert.deepEqual(getVisibleInboundOrderStatuses(), [
    'RFQ',
    'ISSUED',
    'MANUFACTURING',
    'OCEAN',
    'WAREHOUSE',
    'CANCELLED',
    'ARCHIVED',
    'AWAITING_PROOF',
    'REVIEW',
    'POSTED',
    'SHIPPED',
    'CLOSED',
    'REJECTED',
  ])
})

test('inbound queries stay within the persisted Prisma enum values', () => {
  assert.deepEqual(getQueryableInboundOrderStatuses(), [
    'RFQ',
    'ISSUED',
    'MANUFACTURING',
    'OCEAN',
    'WAREHOUSE',
    'CANCELLED',
    'ARCHIVED',
    'AWAITING_PROOF',
    'REVIEW',
    'POSTED',
  ])
})
