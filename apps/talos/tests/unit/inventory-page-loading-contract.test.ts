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

test('inventory outbound source uses Amazon shipment references instead of local outbound orders', () => {
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

  assert.equal(source.includes('/operations/outbound/'), false)
  assert.equal(source.includes('outboundOrderId'), false)
  assert.equal(source.includes('outboundOrderNumber'), false)
  assert.equal(balancesApi.includes('outboundOrder:'), false)
  assert.equal(balancesApi.includes('outboundOrderId'), false)
  assert.equal(balancesApi.includes('outboundOrderNumber'), false)
  assert.equal(inventoryHook.includes('outboundOrderId'), false)
  assert.equal(inventoryHook.includes('outboundOrderNumber'), false)
  assert.equal(source.includes('lastTransactionReference'), true)
})

test('ledger groups outbound inventory by shipment reference when legacy outbound order ids are present', () => {
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
      outboundOrderId: 'fo-local-1',
      outboundOrderNumber: 'OUT-0001',
    },
  ])

  assert.equal(result.balances.length, 1)
  assert.equal(result.balances[0].id, 'FMC::SKU-1::LOT-A::FBA123SHIPMENT')
  assert.equal(result.balances[0].lastTransactionReference, 'FBA123SHIPMENT')
  assert.equal(result.balances[0].outboundOrderId, null)
  assert.equal(result.balances[0].outboundOrderNumber, null)
})
