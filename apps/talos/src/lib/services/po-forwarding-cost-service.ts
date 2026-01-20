import { CostCategory, PurchaseOrderStatus, TransactionType } from '@targon/prisma-talos'
import { ValidationError } from '@/lib/api'
import { getTenantPrisma } from '@/lib/tenant/server'
import { buildPoForwardingCostLedgerEntries } from '@/lib/costing/po-forwarding-costing'

export async function syncPurchaseOrderForwardingCostLedger(params: {
  purchaseOrderId: string
  createdByName: string
}) {
  const prisma = await getTenantPrisma()

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
      select: { costName: true, totalCost: true },
      orderBy: [{ createdAt: 'asc' }],
    })

    const transactionIds = transactions.map(row => row.id)

    await tx.costLedger.deleteMany({
      where: {
        transactionId: { in: transactionIds },
        costCategory: CostCategory.Forwarding,
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

    const forwardingEntries = forwardingCosts.flatMap(cost =>
      buildPoForwardingCostLedgerEntries({
        costName: cost.costName,
        totalCost: Number(cost.totalCost),
        lines,
        warehouseCode,
        warehouseName,
        createdAt: order.receivedDate!,
        createdByName: params.createdByName,
      })
    )

    if (forwardingEntries.length > 0) {
      await tx.costLedger.createMany({ data: forwardingEntries })
    }
  })
}
