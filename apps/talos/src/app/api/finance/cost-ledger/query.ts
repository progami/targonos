import type { CostLedgerBucketTotals, CostLedgerGroupResult } from '@targon/ledger'
import { aggregateCostLedger } from '@targon/ledger'
import { Prisma } from '@targon/prisma-talos'

type CostLedgerPrisma = {
  costLedger: {
    findMany: (args: Prisma.CostLedgerFindManyArgs) => Promise<Array<{
      id: string
      transactionId: string | null
      costCategory: string
      quantity: Prisma.Decimal | null
      unitRate: Prisma.Decimal | null
      totalCost: Prisma.Decimal
      createdAt: Date
      warehouseCode: string
    }>>
  }
  inventoryTransaction: {
    findMany: (args: Prisma.InventoryTransactionFindManyArgs) => Promise<Array<{
      id: string
      transactionType: string
      warehouseCode: string
      warehouseName: string | null
      skuCode: string
      skuDescription: string | null
      lotRef: string
    }>>
  }
}

export type CostLedgerQuery = {
  startDate: string
  endDate: string
  groupBy: 'week' | 'month'
  warehouseCode: string | null
}

export type CostLedgerData = {
  groups: CostLedgerGroupResult[]
  totals: CostLedgerBucketTotals
  groupBy: 'week' | 'month'
}

export function parseCostLedgerQuery(searchParams: URLSearchParams): CostLedgerQuery {
  return {
    startDate:
      searchParams.get('startDate') ??
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: searchParams.get('endDate') ?? new Date().toISOString().split('T')[0],
    groupBy: searchParams.get('groupBy') === 'month' ? 'month' : 'week',
    warehouseCode: searchParams.get('warehouseCode'),
  }
}

export async function loadCostLedgerData(
  prisma: CostLedgerPrisma,
  query: CostLedgerQuery
): Promise<CostLedgerData> {
  const startDate = new Date(query.startDate)
  startDate.setUTCHours(0, 0, 0, 0)

  const endDate = new Date(query.endDate)
  endDate.setUTCHours(23, 59, 59, 999)

  const where: Prisma.CostLedgerWhereInput = {
    createdAt: {
      gte: startDate,
      lte: endDate,
    },
    ...(query.warehouseCode ? { warehouseCode: query.warehouseCode } : {}),
  }

  const costEntries = await prisma.costLedger.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  })

  const transactionIds = Array.from(
    new Set(
      costEntries
        .map((entry) => entry.transactionId)
        .filter((transactionId): transactionId is string => Boolean(transactionId))
    )
  )

  if (transactionIds.length === 0) {
    return {
      groups: [],
      totals: {
        inbound: 0,
        outbound: 0,
        forwarding: 0,
        storage: 0,
        other: 0,
        total: 0,
      },
      groupBy: query.groupBy,
    }
  }

  const validTransactions = await prisma.inventoryTransaction.findMany({
    where: {
      id: { in: transactionIds },
      ...(query.warehouseCode ? { warehouseCode: query.warehouseCode } : {}),
    },
    select: {
      id: true,
      transactionType: true,
      warehouseCode: true,
      warehouseName: true,
      skuCode: true,
      skuDescription: true,
      lotRef: true,
    },
  })

  const transactionMap = new Map(validTransactions.map((transaction) => [transaction.id, transaction]))
  const filteredEntries = costEntries.filter(
    (entry) => entry.transactionId !== null && transactionMap.has(entry.transactionId)
  )

  const aggregated = aggregateCostLedger(
    filteredEntries.map((entry) => {
      const transaction = transactionMap.get(entry.transactionId!)
      return {
        id: entry.id,
        transactionId: entry.transactionId,
        costCategory: entry.costCategory,
        quantity: entry.quantity as unknown as number | string | null,
        unitRate: entry.unitRate as unknown as number | string | null,
        totalCost: entry.totalCost as unknown as number | string | null,
        createdAt: entry.createdAt,
        warehouseCode: entry.warehouseCode,
        context:
          transaction === undefined
            ? undefined
            : {
                transactionType: transaction.transactionType,
                warehouseCode: transaction.warehouseCode,
                warehouseName: transaction.warehouseName,
                skuCode: transaction.skuCode,
                skuDescription: transaction.skuDescription,
                lotRef: transaction.lotRef,
              },
      }
    }),
    { groupBy: query.groupBy }
  )

  return {
    groups: aggregated.groups,
    totals: aggregated.totals,
    groupBy: query.groupBy,
  }
}
