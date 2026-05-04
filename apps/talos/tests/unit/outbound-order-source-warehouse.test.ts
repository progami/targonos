import assert from 'node:assert/strict'
import test from 'node:test'

import { WarehouseKind } from '@targon/prisma-talos'

import { ValidationError } from '../../src/lib/api/errors'
import { assertValidOutboundSourceWarehouse } from '../../src/lib/services/outbound-source-warehouse'

test('rejects Amazon virtual warehouses as outbound sources', () => {
  assert.throws(
    () =>
      assertValidOutboundSourceWarehouse({
        code: 'AMZN-UK',
        kind: WarehouseKind.AMAZON_FBA,
      }),
    ValidationError
  )
})

test('rejects legacy Amazon warehouse codes even when kind is wrong', () => {
  assert.throws(
    () =>
      assertValidOutboundSourceWarehouse({
        code: 'AMZN-UK',
        kind: WarehouseKind.THIRD_PARTY,
      }),
    ValidationError
  )
})

test('allows physical warehouses as outbound sources', () => {
  assert.doesNotThrow(() =>
    assertValidOutboundSourceWarehouse({
      code: 'FMC',
      kind: WarehouseKind.THIRD_PARTY,
    })
  )
})
