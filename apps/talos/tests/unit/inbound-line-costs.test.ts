import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveInboundOrderUnitCost,
  normalizeInboundOrderTotalCost,
  normalizeInboundOrderUnitCost,
  resolveInboundOrderUnitCost,
  toInboundOrderTotalCostNumberOrNull,
  toInboundOrderUnitCostNumberOrNull,
} from '../../src/lib/inbound-line-costs'

test('deriveInboundOrderUnitCost preserves invoice-level precision', () => {
  assert.equal(deriveInboundOrderUnitCost(10584, 18000), 0.588)
  assert.equal(deriveInboundOrderUnitCost(6360, 2400), 2.65)
})

test('inbound line cost normalizers keep total and unit precision separate', () => {
  assert.equal(normalizeInboundOrderTotalCost(33636.724), 33636.72)
  assert.equal(normalizeInboundOrderUnitCost(0.588), 0.588)
  assert.equal(normalizeInboundOrderUnitCost(0.58806), 0.5881)
})

test('inbound line cost parsers round totals to cents and unit costs to four decimals', () => {
  assert.equal(toInboundOrderTotalCostNumberOrNull('33636.724'), 33636.72)
  assert.equal(toInboundOrderUnitCostNumberOrNull('0.58806'), 0.5881)
  assert.equal(toInboundOrderUnitCostNumberOrNull(null), null)
})

test('resolveInboundOrderUnitCost prefers derived precision over stale stored unit cost', () => {
  assert.equal(
    resolveInboundOrderUnitCost({
      unitCost: '0.5900',
      totalCost: '10584.00',
      unitsOrdered: 18000,
    }),
    0.588
  )
})
