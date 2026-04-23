import assert from 'node:assert/strict'
import test from 'node:test'

import { WarehouseKind } from '@targon/prisma-talos'

import { ValidationError } from '../../src/lib/api/errors'
import { assertValidFulfillmentSourceWarehouse } from '../../src/lib/services/fulfillment-source-warehouse'

test('rejects Amazon virtual warehouses as fulfillment sources', () => {
  assert.throws(
    () =>
      assertValidFulfillmentSourceWarehouse({
        code: 'AMZN-UK',
        kind: WarehouseKind.AMAZON_FBA,
      }),
    ValidationError
  )
})

test('rejects legacy Amazon warehouse codes even when kind is wrong', () => {
  assert.throws(
    () =>
      assertValidFulfillmentSourceWarehouse({
        code: 'AMZN-UK',
        kind: WarehouseKind.THIRD_PARTY,
      }),
    ValidationError
  )
})

test('allows physical warehouses as fulfillment sources', () => {
  assert.doesNotThrow(() =>
    assertValidFulfillmentSourceWarehouse({
      code: 'FMC',
      kind: WarehouseKind.THIRD_PARTY,
    })
  )
})
