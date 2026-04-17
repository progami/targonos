import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildFinancialLedgerQueryString,
  createDefaultFinancialLedgerFilters,
} from '../../src/lib/financial/financial-ledger-filters'

test('default filters start empty', () => {
  assert.deepEqual(createDefaultFinancialLedgerFilters(), {
    startDate: '',
    endDate: '',
    warehouseCode: '',
    category: '',
  })
})

test('query builder only sends explicit filters and the fixed limit', () => {
  const query = buildFinancialLedgerQueryString({
    startDate: '',
    endDate: '',
    warehouseCode: '',
    category: '',
  })

  assert.equal(query, 'limit=500')
})

test('query builder includes only populated filters', () => {
  const query = buildFinancialLedgerQueryString({
    startDate: '2026-04-01',
    endDate: '',
    warehouseCode: 'AMZN-US',
    category: 'Inbound',
  })

  assert.equal(query, 'startDate=2026-04-01&warehouseCode=AMZN-US&category=Inbound&limit=500')
})
