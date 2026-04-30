import { randomUUID } from 'crypto'
import {
  CostCategory,
  FinancialLedgerCategory,
  FinancialLedgerSourceType,
  InboundOrderStatus,
  Prisma,
  TransactionType,
} from '@targon/prisma-talos'
import { ValidationError } from '@/lib/api'
import {
  normalizeInboundCostCurrency,
  INBOUND_BASE_CURRENCY,
} from '@/lib/constants/cost-currency'
import { getTenantPrisma } from '@/lib/tenant/server'
import { buildInboundForwardingCostLedgerEntries } from '@/lib/costing/inbound-forwarding-costing'

export async function syncInboundOrderForwardingCostLedger(params: {
  inboundOrderId: string
  createdByName: string
}) {
  const prisma = await getTenantPrisma()
  const tenantCurrency = INBOUND_BASE_CURRENCY

  await prisma.$transaction(async tx => {
    const order = await tx.inboundOrder.findUnique({
      where: { id: params.inboundOrderId },
      select: {
        id: true,
        status: true,
        receivedDate: true,
      },
    })

    if (!order) {
      throw new ValidationError('Inbound not found')
    }

    if (order.status !== InboundOrderStatus.WAREHOUSE) {
      return
    }

    if (!order.receivedDate) {
      throw new ValidationError('Received date is required to allocate forwarding costs')
    }

    const transactions = await tx.inventoryTransaction.findMany({
      where: {
        inboundOrderId: order.id,
        transactionType: TransactionType.RECEIVE,
      },
      select: {
        id: true,
        skuCode: true,
        skuDescription: true,
        lotRef: true,
        inboundOrderId: true,
        inboundOrderLineId: true,
        cartonsIn: true,
        cartonDimensionsCm: true,
        warehouseCode: true,
        warehouseName: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    })

    if (transactions.length === 0) {
      return
    }

    const forwardingCosts = await tx.inboundOrderForwardingCost.findMany({
      where: { inboundOrderId: order.id },
      select: { costName: true, totalCost: true, currency: true },
      orderBy: [{ createdAt: 'asc' }],
    })

    const transactionIds = transactions.map(row => row.id)

    await tx.costLedger.deleteMany({
      where: {
        transactionId: { in: transactionIds },
        costCategory: CostCategory.Forwarding,
      },
    })
    await tx.financialLedgerEntry.deleteMany({
      where: {
        sourceType: FinancialLedgerSourceType.COST_LEDGER,
        inventoryTransactionId: { in: transactionIds },
        category: FinancialLedgerCategory.Forwarding,
      },
    })

    if (forwardingCosts.length === 0) {
      return
    }

    const warehouseCode = transactions[0]!.warehouseCode
    const warehouseName = transactions[0]!.warehouseName

    const lines = transactions.map(txRow => ({
      transactionId: txRow.id,
      skuCode: txRow.skuCode,
      cartons: txRow.cartonsIn,
      cartonDimensionsCm: txRow.cartonDimensionsCm,
    }))

    const forwardingEntries: Array<Prisma.CostLedgerCreateManyInput & { currency: string }> = []
    for (const cost of forwardingCosts) {
      const resolvedCurrency = normalizeInboundCostCurrency(cost.currency) ?? tenantCurrency
      let builtEntries: Prisma.CostLedgerCreateManyInput[] = []
      try {
        builtEntries = buildInboundForwardingCostLedgerEntries({
          costName: cost.costName,
          totalCost: Number(cost.totalCost),
          lines,
          warehouseCode,
          warehouseName,
          createdAt: order.receivedDate!,
          createdByName: params.createdByName,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Cost allocation failed'
        throw new ValidationError(message)
      }

      for (const entry of builtEntries) {
        forwardingEntries.push({
          id: randomUUID(),
          ...entry,
          currency: resolvedCurrency,
        })
      }
    }

    if (forwardingEntries.length > 0) {
      await tx.costLedger.createMany({
        data: forwardingEntries.map(({ currency: _currency, ...entry }) => entry),
      })

      const txById = new Map(transactions.map(row => [row.id, row]))
      const financialEntries: Prisma.FinancialLedgerEntryCreateManyInput[] = forwardingEntries.map(
        row => {
          const txRow = txById.get(row.transactionId)
          if (!txRow) {
            throw new ValidationError(
              `Missing inventory transaction context for ${row.transactionId}`
            )
          }

          return {
            id: row.id,
            sourceType: FinancialLedgerSourceType.COST_LEDGER,
            sourceId: row.id,
            category: FinancialLedgerCategory.Forwarding,
            costName: row.costName,
            quantity: row.quantity,
            unitRate: row.unitRate,
            amount: row.totalCost,
            currency: row.currency,
            warehouseCode: row.warehouseCode,
            warehouseName: row.warehouseName,
            skuCode: txRow.skuCode,
            skuDescription: txRow.skuDescription,
            lotRef: txRow.lotRef,
            inventoryTransactionId: row.transactionId,
            inboundOrderId: txRow.inboundOrderId,
            inboundOrderLineId: txRow.inboundOrderLineId,
            effectiveAt: row.createdAt,
            createdAt: row.createdAt,
            createdByName: row.createdByName,
          }
        }
      )

      if (financialEntries.length > 0) {
        await tx.financialLedgerEntry.createMany({
          data: financialEntries,
          skipDuplicates: true,
        })
      }
    }
  })
}
