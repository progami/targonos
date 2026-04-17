import assert from 'node:assert/strict'
import test from 'node:test'

import { validateTransactionDelete } from './validation'

test('validateTransactionDelete blocks deleting a receive transaction with dependent outgoing moves', async () => {
  const prisma = {
    inventoryTransaction: {
      findUnique: async () => ({
        id: 'tx_receive',
        skuCode: 'SKU-1',
        lotRef: 'LOT-1',
        warehouseCode: 'LAX',
        transactionType: 'RECEIVE',
        transactionDate: new Date('2026-04-01T00:00:00.000Z'),
      }),
      findMany: async (args: { where?: { transactionType?: { in: string[] } } }) => {
        if (args.where?.transactionType) {
          return [
            {
              id: 'tx_ship',
              transactionType: 'SHIP',
              transactionDate: new Date('2026-04-02T00:00:00.000Z'),
              cartonsOut: 12,
            },
          ]
        }

        return [
          { cartonsIn: 20, cartonsOut: 0 },
          { cartonsIn: 0, cartonsOut: 12 },
        ]
      },
    },
    warehouse: {
      findUnique: async () => ({ code: 'LAX' }),
    },
  }

  const result = await validateTransactionDelete(
    prisma as never,
    {
      role: 'admin',
      warehouseId: null,
    },
    'tx_receive'
  )

  assert.equal(result.canDelete, false)
  assert.match(result.reason ?? '', /dependent transaction/i)
})
