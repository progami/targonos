import assert from 'node:assert/strict'
import test from 'node:test'

import { formatLegacyInboundOrderReviewRow } from '../../src/lib/inbound/legacy-status-review'

test('formats a legacy inbound review row for shipped workflow statuses', () => {
  const result = formatLegacyInboundOrderReviewRow({
    id: 'inbound_123',
    inboundNumber: 'IN-16-PDS',
    status: 'SHIPPED',
    postedAt: null,
    warehouseCode: 'AMZN-US',
    shipToName: 'Amazon LBA1',
    shippedDate: new Date('2026-03-30T00:00:00.000Z'),
  })

  assert.deepEqual(result, {
    id: 'inbound_123',
    inboundNumber: 'IN-16-PDS',
    currentStatus: 'SHIPPED',
    posted: false,
    warehouseCode: 'AMZN-US',
    shipToName: 'Amazon LBA1',
    shippedDate: '2026-03-30',
  })
})

test('formats legacy inbound review rows when shippedDate is string or null', () => {
  const withStringDate = formatLegacyInboundOrderReviewRow({
    id: 'inbound_456',
    inboundNumber: 'IN-17-PDS',
    status: 'CLOSED',
    postedAt: '2026-04-01T08:15:00.000Z',
    warehouseCode: 'AMZN-US',
    shipToName: null,
    shippedDate: '2026-03-31T17:45:00.000Z',
  })

  assert.deepEqual(withStringDate, {
    id: 'inbound_456',
    inboundNumber: 'IN-17-PDS',
    currentStatus: 'CLOSED',
    posted: true,
    warehouseCode: 'AMZN-US',
    shipToName: null,
    shippedDate: '2026-03-31',
  })

  const withNullDate = formatLegacyInboundOrderReviewRow({
    id: 'inbound_789',
     inboundNumber: null,
    status: 'REJECTED',
    postedAt: null,
    warehouseCode: null,
    shipToName: 'Amazon BHX4',
    shippedDate: null,
  })

  assert.deepEqual(withNullDate, {
    id: 'inbound_789',
     inboundNumber: null,
    currentStatus: 'REJECTED',
    posted: false,
    warehouseCode: null,
    shipToName: 'Amazon BHX4',
    shippedDate: null,
  })
})
