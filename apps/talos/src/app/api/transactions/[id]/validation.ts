import type { Prisma } from '@targon/prisma-talos'

type TransactionValidationPrisma = {
  inventoryTransaction: {
    findUnique: (args: Prisma.InventoryTransactionFindUniqueArgs) => Promise<{
      id: string
      skuCode: string
      lotRef: string
      warehouseCode: string
      transactionType: string
      transactionDate: Date
    } | null>
    findMany: (args: Prisma.InventoryTransactionFindManyArgs) => Promise<Array<{
      id?: string
      transactionType?: string
      transactionDate?: Date
      cartonsIn: number
      cartonsOut: number
    }>>
  }
  warehouse: {
    findUnique: (args: Prisma.WarehouseFindUniqueArgs) => Promise<{ code: string } | null>
  }
}

type ValidationSessionUser = {
  role: string
  warehouseId: string | null
}

export class TransactionValidationError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'TransactionValidationError'
    this.status = status
  }
}

export type TransactionDeleteValidation = {
  canEdit: boolean
  canDelete: boolean
  reason: string | null
  details: {
    currentInventory?: {
      skuCode: string
      lotRef: string
      quantity: number
      allocated: number
      available: number
    }
    dependentTransactions?: Array<{
      id: string
      transactionType: string
      transactionDate: Date
      quantity: number
    }>
  }
}

export async function validateTransactionDelete(
  prisma: TransactionValidationPrisma,
  sessionUser: ValidationSessionUser,
  id: string
): Promise<TransactionDeleteValidation> {
  const transaction = await prisma.inventoryTransaction.findUnique({
    where: { id },
  })

  if (transaction === null) {
    throw new TransactionValidationError('Transaction not found', 404)
  }

  if (sessionUser.role === 'staff' && sessionUser.warehouseId !== null) {
    const userWarehouse = await prisma.warehouse.findUnique({
      where: { id: sessionUser.warehouseId },
      select: { code: true },
    })

    if (userWarehouse !== null && userWarehouse.code !== transaction.warehouseCode) {
      throw new TransactionValidationError('Access denied', 403)
    }
  }

  const allTransactionsForInventory = await prisma.inventoryTransaction.findMany({
    where: {
      skuCode: transaction.skuCode,
      lotRef: transaction.lotRef,
      warehouseCode: transaction.warehouseCode,
    },
    orderBy: {
      transactionDate: 'asc',
    },
  })

  let totalIn = 0
  let totalOut = 0
  for (const row of allTransactionsForInventory) {
    totalIn += row.cartonsIn
    totalOut += row.cartonsOut
  }

  const currentQuantity = totalIn - totalOut
  const result: TransactionDeleteValidation = {
    canEdit: true,
    canDelete: true,
    reason: null,
    details: {
      currentInventory: {
        skuCode: transaction.skuCode,
        lotRef: transaction.lotRef,
        quantity: currentQuantity,
        allocated: 0,
        available: currentQuantity,
      },
    },
  }

  if (transaction.transactionType === 'RECEIVE') {
    const outgoingTransactions = await prisma.inventoryTransaction.findMany({
      where: {
        skuCode: transaction.skuCode,
        lotRef: transaction.lotRef,
        warehouseCode: transaction.warehouseCode,
        transactionType: { in: ['SHIP', 'ADJUST_OUT'] },
        transactionDate: {
          gte: transaction.transactionDate,
        },
      },
      orderBy: {
        transactionDate: 'asc',
      },
    })

    if (outgoingTransactions.length > 0) {
      const shippedQuantity = outgoingTransactions.reduce((sum, row) => sum + row.cartonsOut, 0)
      result.canDelete = false
      result.reason = `Cannot delete: ${shippedQuantity} cartons from this lot have been shipped/adjusted. You must delete the ${outgoingTransactions.length} dependent transaction(s) first.`
      result.details.dependentTransactions = outgoingTransactions.map((row) => ({
        id: row.id!,
        transactionType: row.transactionType!,
        transactionDate: row.transactionDate!,
        quantity: row.cartonsOut,
      }))
    }
  }

  if (transaction.transactionType === 'SHIP' || transaction.transactionType === 'ADJUST_OUT') {
    const allTransactions = await prisma.inventoryTransaction.findMany({
      where: {
        skuCode: transaction.skuCode,
        lotRef: transaction.lotRef,
        warehouseCode: transaction.warehouseCode,
      },
      orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
    })

    let balance = 0
    for (const row of allTransactions) {
      if (row.id === id) continue

      balance += row.cartonsIn - row.cartonsOut

      if (balance < 0) {
        result.canDelete = false
        result.reason = `Cannot delete this ${transaction.transactionType.toLowerCase()}. It would create negative inventory in the historical record.`
        break
      }
    }
  }

  return result
}
