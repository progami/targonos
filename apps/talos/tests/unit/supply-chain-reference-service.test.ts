import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseOrderReference,
  resolveOrderReferenceSeed,
} from '../../src/lib/services/supply-chain-reference-service'

test('parseOrderReference handles canonical Inbound format', () => {
  const parsed = parseOrderReference('IN-16-PDS')
  assert.deepEqual(parsed, { sequence: 16, skuGroup: 'PDS' })
})

test('parseOrderReference handles legacy alphanumeric Inbound sequence format', () => {
  const parsed = parseOrderReference('IN-6B-PDS')
  assert.deepEqual(parsed, { sequence: 6, skuGroup: 'PDS' })
})

test('resolveOrderReferenceSeed accepts legacy alphanumeric Inbound format', () => {
  const seed = resolveOrderReferenceSeed({
    orderNumber: 'IN-6B-PDS',
     inboundNumber: null,
    skuGroup: 'PDS',
  })

  assert.deepEqual(seed, { sequence: 6, skuGroup: 'PDS' })
})

test('resolveOrderReferenceSeed still rejects malformed Inbound references', () => {
  assert.throws(
    () =>
      resolveOrderReferenceSeed({
        orderNumber: 'IN-XYZ-PDS',
         inboundNumber: null,
        skuGroup: 'PDS',
      }),
    /does not match the Inbound naming convention/
  )
})
