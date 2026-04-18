import assert from 'node:assert/strict'
import test from 'node:test'

import { getVisiblePurchaseOrderStatuses } from '../../src/lib/purchase-orders/workflow'

test('purchase-order reads keep legacy compatibility statuses visible until cleanup is complete', () => {
  assert.deepEqual(getVisiblePurchaseOrderStatuses(), [
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
