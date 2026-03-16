import assert from 'node:assert/strict'
import test from 'node:test'

import {
  derivePurchaseOrderUnitCost,
  normalizePurchaseOrderTotalCost,
  normalizePurchaseOrderUnitCost,
  resolvePurchaseOrderUnitCost,
  toPurchaseOrderTotalCostNumberOrNull,
  toPurchaseOrderUnitCostNumberOrNull,
} from '../../src/lib/purchase-order-line-costs'

test('derivePurchaseOrderUnitCost preserves invoice-level precision', () => {
  assert.equal(derivePurchaseOrderUnitCost(10584, 18000), 0.588)
  assert.equal(derivePurchaseOrderUnitCost(6360, 2400), 2.65)
})

test('purchase-order line cost normalizers keep total and unit precision separate', () => {
  assert.equal(normalizePurchaseOrderTotalCost(33636.724), 33636.72)
  assert.equal(normalizePurchaseOrderUnitCost(0.588), 0.588)
  assert.equal(normalizePurchaseOrderUnitCost(0.58806), 0.5881)
})

test('purchase-order line cost parsers round totals to cents and unit costs to four decimals', () => {
  assert.equal(toPurchaseOrderTotalCostNumberOrNull('33636.724'), 33636.72)
  assert.equal(toPurchaseOrderUnitCostNumberOrNull('0.58806'), 0.5881)
  assert.equal(toPurchaseOrderUnitCostNumberOrNull(null), null)
})

test('resolvePurchaseOrderUnitCost prefers derived precision over stale stored unit cost', () => {
  assert.equal(
    resolvePurchaseOrderUnitCost({
      unitCost: '0.5900',
      totalCost: '10584.00',
      unitsOrdered: 18000,
    }),
    0.588
  )
})
