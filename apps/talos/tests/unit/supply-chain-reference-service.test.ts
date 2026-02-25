import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseOrderReference,
  resolveOrderReferenceSeed,
} from '../../src/lib/services/supply-chain-reference-service'

test('parseOrderReference handles canonical PO format', () => {
  const parsed = parseOrderReference('PO-16-PDS')
  assert.deepEqual(parsed, { sequence: 16, skuGroup: 'PDS' })
})

test('parseOrderReference handles legacy alphanumeric PO sequence format', () => {
  const parsed = parseOrderReference('PO-6B-PDS')
  assert.deepEqual(parsed, { sequence: 6, skuGroup: 'PDS' })
})

test('resolveOrderReferenceSeed accepts legacy alphanumeric PO format', () => {
  const seed = resolveOrderReferenceSeed({
    orderNumber: 'PO-6B-PDS',
    poNumber: null,
    skuGroup: 'PDS',
  })

  assert.deepEqual(seed, { sequence: 6, skuGroup: 'PDS' })
})

test('resolveOrderReferenceSeed still rejects malformed PO references', () => {
  assert.throws(
    () =>
      resolveOrderReferenceSeed({
        orderNumber: 'PO-XYZ-PDS',
        poNumber: null,
        skuGroup: 'PDS',
      }),
    /does not match the PO naming convention/
  )
})
