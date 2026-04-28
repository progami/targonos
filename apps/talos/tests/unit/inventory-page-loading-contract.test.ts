import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { aggregateInventoryTransactions } from '@targon/ledger'

test('inventory page renders loading state before reading summary totals', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/app/operations/inventory/page.tsx'),
    'utf8',
  )

  const loadingGuardIndex = source.indexOf('if (loading) {')
  const summaryTotalIndex = source.indexOf('summary.totalSkuCount')

  assert.notEqual(summaryTotalIndex, -1, 'inventory page should render summary total SKU count')
  assert.notEqual(loadingGuardIndex, -1, 'inventory page must guard the loading state')
  assert.equal(
    loadingGuardIndex < summaryTotalIndex,
    true,
    'inventory page must not read summary totals while balances are still loading',
  )
})

test('inventory outbound source uses Amazon shipment references instead of local fulfillment orders', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/app/operations/inventory/page.tsx'),
    'utf8',
  )
  const balancesApi = readFileSync(
    join(process.cwd(), 'src/app/api/inventory/balances/route.ts'),
    'utf8',
  )
  const inventoryHook = readFileSync(
    join(process.cwd(), 'src/hooks/useInventoryFilters.ts'),
    'utf8',
  )

  assert.equal(source.includes('/operations/fulfillment-orders/'), false)
  assert.equal(source.includes('fulfillmentOrderId'), false)
  assert.equal(source.includes('fulfillmentOrderNumber'), false)
  assert.equal(balancesApi.includes('fulfillmentOrder:'), false)
  assert.equal(balancesApi.includes('fulfillmentOrderId'), false)
  assert.equal(balancesApi.includes('fulfillmentOrderNumber'), false)
  assert.equal(inventoryHook.includes('fulfillmentOrderId'), false)
  assert.equal(inventoryHook.includes('fulfillmentOrderNumber'), false)
  assert.equal(source.includes('lastTransactionReference'), true)
})

test('ledger groups outbound inventory by shipment reference when legacy fulfillment order ids are present', () => {
  const transactionDate = new Date('2026-01-07T12:00:00.000Z')
  const result = aggregateInventoryTransactions([
    {
      id: 'ship-tx-1',
      transactionDate,
      transactionType: 'SHIP',
      warehouseCode: 'FMC',
      warehouseName: 'FMC',
      skuCode: 'SKU-1',
      skuDescription: 'Test SKU',
      lotRef: 'LOT-A',
      cartonsIn: 0,
      cartonsOut: 12,
      unitsPerCarton: 10,
      referenceId: 'FBA123SHIPMENT',
      fulfillmentOrderId: 'fo-local-1',
      fulfillmentOrderNumber: 'FO-0001',
    },
  ])

  assert.equal(result.balances.length, 1)
  assert.equal(result.balances[0].id, 'FMC::SKU-1::LOT-A::FBA123SHIPMENT')
  assert.equal(result.balances[0].lastTransactionReference, 'FBA123SHIPMENT')
  assert.equal(result.balances[0].fulfillmentOrderId, null)
  assert.equal(result.balances[0].fulfillmentOrderNumber, null)
})
