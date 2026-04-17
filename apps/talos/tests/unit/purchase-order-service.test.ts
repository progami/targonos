import assert from 'node:assert/strict'
import test from 'node:test'

import { getVisiblePurchaseOrderStatuses } from '../../src/lib/purchase-orders/workflow'

test('purchase-order reads keep legacy terminal statuses visible until the enum migration is applied', () => {
  assert.deepEqual(getVisiblePurchaseOrderStatuses(), [
    'RFQ',
    'ISSUED',
    'MANUFACTURING',
    'OCEAN',
    'WAREHOUSE',
    'CANCELLED',
    'SHIPPED',
    'CLOSED',
    'REJECTED',
  ])
})
