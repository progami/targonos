import assert from 'node:assert/strict'
import test from 'node:test'

import { formatLegacyPurchaseOrderReviewRow } from '../../src/lib/purchase-orders/legacy-status-review'

test('formats a legacy purchase-order review row for shipped workflow statuses', () => {
  const result = formatLegacyPurchaseOrderReviewRow({
    id: 'po_123',
    poNumber: 'PO-16-PDS',
    status: 'SHIPPED',
    postedAt: null,
    warehouseCode: 'AMZN-US',
    shipToName: 'Amazon LBA1',
    shippedDate: new Date('2026-03-30T00:00:00.000Z'),
  })

  assert.deepEqual(result, {
    id: 'po_123',
    poNumber: 'PO-16-PDS',
    currentStatus: 'SHIPPED',
    posted: false,
    warehouseCode: 'AMZN-US',
    shipToName: 'Amazon LBA1',
    shippedDate: '2026-03-30',
  })
})

test('formats legacy purchase-order review rows when shippedDate is string or null', () => {
  const withStringDate = formatLegacyPurchaseOrderReviewRow({
    id: 'po_456',
    poNumber: 'PO-17-PDS',
    status: 'CLOSED',
    postedAt: '2026-04-01T08:15:00.000Z',
    warehouseCode: 'AMZN-US',
    shipToName: null,
    shippedDate: '2026-03-31T17:45:00.000Z',
  })

  assert.deepEqual(withStringDate, {
    id: 'po_456',
    poNumber: 'PO-17-PDS',
    currentStatus: 'CLOSED',
    posted: true,
    warehouseCode: 'AMZN-US',
    shipToName: null,
    shippedDate: '2026-03-31',
  })

  const withNullDate = formatLegacyPurchaseOrderReviewRow({
    id: 'po_789',
    poNumber: null,
    status: 'REJECTED',
    postedAt: null,
    warehouseCode: null,
    shipToName: 'Amazon BHX4',
    shippedDate: null,
  })

  assert.deepEqual(withNullDate, {
    id: 'po_789',
    poNumber: null,
    currentStatus: 'REJECTED',
    posted: false,
    warehouseCode: null,
    shipToName: 'Amazon BHX4',
    shippedDate: null,
  })
})
