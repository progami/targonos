import assert from 'node:assert/strict'
import test from 'node:test'

import { loadCostLedgerData, parseCostLedgerQuery } from './query'

test('parseCostLedgerQuery defaults to week and preserves warehouseCode', () => {
  const query = parseCostLedgerQuery(
    new URLSearchParams('startDate=2026-04-01&endDate=2026-04-30&warehouseCode=LAX')
  )

  assert.deepEqual(query, {
    startDate: '2026-04-01',
    endDate: '2026-04-30',
    groupBy: 'week',
    warehouseCode: 'LAX',
  })
})

test('loadCostLedgerData returns empty totals when no entries match', async () => {
  const prisma = {
    costLedger: { findMany: async () => [] },
    inventoryTransaction: { findMany: async () => [] },
  }

  const result = await loadCostLedgerData(prisma as never, {
    startDate: '2026-04-01',
    endDate: '2026-04-30',
    groupBy: 'week',
    warehouseCode: null,
  })

  assert.deepEqual(result, {
    groups: [],
    totals: {
      inbound: 0,
      outbound: 0,
      forwarding: 0,
      storage: 0,
      other: 0,
      total: 0,
    },
    groupBy: 'week',
  })
})
