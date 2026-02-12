import { randomUUID } from 'crypto'
import {
  CostCategory,
  FinancialLedgerCategory,
  FinancialLedgerSourceType,
  PurchaseOrderStatus,
  Prisma,
  TransactionType,
} from '@targon/prisma-talos'
import { ValidationError } from '@/lib/api'
import { normalizePoCostCurrency } from '@/lib/constants/cost-currency'
import { getCurrentTenant, getTenantPrisma } from '@/lib/tenant/server'
import { buildPoForwardingCostLedgerEntries } from '@/lib/costing/po-forwarding-costing'

export async function syncPurchaseOrderForwardingCostLedger(params: {
  purchaseOrderId: string
  createdByName: string
}) {
  const prisma = await getTenantPrisma()
  const tenant = await getCurrentTenant()
  const tenantCurrency = normalizePoCostCurrency(tenant.currency)
  if (!tenantCurrency) {
    throw new ValidationError(`Unsupported tenant currency: ${tenant.currency}`)
  }

  await prisma.$transaction(async tx => {
    const order = await tx.purchaseOrder.findUnique({
      where: { id: params.purchaseOrderId },
      select: {
        id: true,
        status: true,
        receivedDate: true,
      },
    })

    if (!order) {
      throw new ValidationError('Purchase order not found')
    }

    if (order.status !== PurchaseOrderStatus.WAREHOUSE) {
      return
    }

    if (!order.receivedDate) {
      throw new ValidationError('Received date is required to allocate forwarding costs')
    }

    const transactions = await tx.inventoryTransaction.findMany({
      where: {
        purchaseOrderId: order.id,
        transactionType: TransactionType.RECEIVE,
      },
      select: {
        id: true,
        skuCode: true,
        skuDescription: true,
        lotRef: true,
        purchaseOrderId: true,
        purchaseOrderLineId: true,
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

    const forwardingCosts = await tx.purchaseOrderForwardingCost.findMany({
      where: { purchaseOrderId: order.id },
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
      const resolvedCurrency = normalizePoCostCurrency(cost.currency) ?? tenantCurrency
      const builtEntries = buildPoForwardingCostLedgerEntries({
        costName: cost.costName,
        totalCost: Number(cost.totalCost),
        lines,
        warehouseCode,
        warehouseName,
        createdAt: order.receivedDate!,
        createdByName: params.createdByName,
      })

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
            purchaseOrderId: txRow.purchaseOrderId,
            purchaseOrderLineId: txRow.purchaseOrderLineId,
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
