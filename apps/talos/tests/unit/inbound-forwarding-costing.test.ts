import assert from 'node:assert/strict'
import test from 'node:test'
import { buildInboundForwardingCostLedgerEntries } from '../../src/lib/costing/inbound-forwarding-costing'

test('buildInboundForwardingCostLedgerEntries skips lines with zero cartons', () => {
  const entries = buildInboundForwardingCostLedgerEntries({
    costName: 'Ocean Freight',
    totalCost: 100,
    lines: [
      {
        transactionId: 'tx-zero',
        skuCode: 'SKU-ZERO',
        cartons: 0,
        cartonDimensionsCm: '40 x 40 x 40',
      },
      {
        transactionId: 'tx-a',
        skuCode: 'SKU-A',
        cartons: 10,
        cartonDimensionsCm: '10 x 10 x 10',
      },
      {
        transactionId: 'tx-b',
        skuCode: 'SKU-B',
        cartons: 5,
        cartonDimensionsCm: '20 x 10 x 10',
      },
    ],
    warehouseCode: 'UK-MAIN',
    warehouseName: 'UK Main Warehouse',
    createdAt: new Date('2026-02-24T00:00:00.000Z'),
    createdByName: 'Test User',
  })

  assert.equal(entries.length, 2)

  const byTxId = new Map(entries.map(entry => [entry.transactionId, entry]))
  assert.equal(byTxId.has('tx-zero'), false)
  assert.equal(byTxId.get('tx-a')?.totalCost, 50)
  assert.equal(byTxId.get('tx-b')?.totalCost, 50)
})

test('buildInboundForwardingCostLedgerEntries returns empty when every line has zero cartons', () => {
  const entries = buildInboundForwardingCostLedgerEntries({
    costName: 'Ocean Freight',
    totalCost: 100,
    lines: [
      {
        transactionId: 'tx-zero-a',
        skuCode: 'SKU-ZERO-A',
        cartons: 0,
        cartonDimensionsCm: '10 x 10 x 10',
      },
      {
        transactionId: 'tx-zero-b',
        skuCode: 'SKU-ZERO-B',
        cartons: 0,
        cartonDimensionsCm: '20 x 20 x 20',
      },
    ],
    warehouseCode: 'UK-MAIN',
    warehouseName: 'UK Main Warehouse',
    createdAt: new Date('2026-02-24T00:00:00.000Z'),
    createdByName: 'Test User',
  })

  assert.equal(entries.length, 0)
})

test('buildInboundForwardingCostLedgerEntries still rejects missing dimensions for positive-carton lines', () => {
  assert.throws(
    () =>
      buildInboundForwardingCostLedgerEntries({
        costName: 'Ocean Freight',
        totalCost: 100,
        lines: [
          {
            transactionId: 'tx-a',
            skuCode: 'SKU-A',
            cartons: 5,
            cartonDimensionsCm: null,
          },
        ],
        warehouseCode: 'UK-MAIN',
        warehouseName: 'UK Main Warehouse',
        createdAt: new Date('2026-02-24T00:00:00.000Z'),
        createdByName: 'Test User',
      }),
    /Missing\/invalid carton dimensions/
  )
})
