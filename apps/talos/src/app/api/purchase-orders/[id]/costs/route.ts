import { ApiResponses, withAuthAndParams } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { getTenantPrisma } from '@/lib/tenant/server'
import { CostCategory } from '@targon/prisma-talos'

export const dynamic = 'force-dynamic'

type CostBreakdownRow = {
  costName: string
  totalCost: number
}

function readParam(params: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = params?.[key]
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2))
}

export const GET = withAuthAndParams(async (_request, params, session) => {
  const id = readParam(params, 'id')
  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const canView = await hasPermission(session.user.id, 'po.view')
  if (!canView) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const prisma = await getTenantPrisma()

  const orderExists = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!orderExists) {
    return ApiResponses.notFound('Purchase order not found')
  }

  const entries = await prisma.costLedger.findMany({
    where: {
      transaction: { purchaseOrderId: id },
    },
    select: {
      costCategory: true,
      costName: true,
      totalCost: true,
    },
  })

  const totals = {
    inbound: 0,
    outbound: 0,
    forwarding: 0,
    storage: 0,
    total: 0,
  }

  const breakdownByCategory = new Map<CostCategory, Map<string, number>>()

  for (const entry of entries) {
    const totalCost = Number(entry.totalCost)
    if (!Number.isFinite(totalCost) || totalCost <= 0) continue

    totals.total += totalCost

    switch (entry.costCategory) {
      case CostCategory.Inbound:
        totals.inbound += totalCost
        break
      case CostCategory.Outbound:
        totals.outbound += totalCost
        break
      case CostCategory.Forwarding:
        totals.forwarding += totalCost
        break
      case CostCategory.Storage:
        totals.storage += totalCost
        break
    }

    if (!breakdownByCategory.has(entry.costCategory)) {
      breakdownByCategory.set(entry.costCategory, new Map<string, number>())
    }

    const categoryMap = breakdownByCategory.get(entry.costCategory)
    if (!categoryMap) continue
    categoryMap.set(entry.costName, (categoryMap.get(entry.costName) ?? 0) + totalCost)
  }

  const inventoryLots = await prisma.inventoryTransaction.findMany({
    where: { purchaseOrderId: id },
    select: { lotRef: true },
    distinct: ['lotRef'],
  })

  const lotRefs = inventoryLots
    .map(row => row.lotRef)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

  if (lotRefs.length > 0) {
    const storageLedgerRows = await prisma.storageLedger.findMany({
      where: {
        lotRef: { in: lotRefs },
        isCostCalculated: true,
      },
      select: { totalStorageCost: true },
    })

    let storageLedgerTotal = 0
    for (const row of storageLedgerRows) {
      const value = Number(row.totalStorageCost)
      if (!Number.isFinite(value) || value <= 0) continue
      storageLedgerTotal += value
    }

    if (storageLedgerTotal > 0) {
      totals.storage += storageLedgerTotal
      totals.total += storageLedgerTotal

      if (!breakdownByCategory.has(CostCategory.Storage)) {
        breakdownByCategory.set(CostCategory.Storage, new Map<string, number>())
      }

      const categoryMap = breakdownByCategory.get(CostCategory.Storage)
      if (categoryMap) {
        categoryMap.set('Storage', (categoryMap.get('Storage') ?? 0) + storageLedgerTotal)
      }
    }
  }

  const toBreakdown = (category: CostCategory): CostBreakdownRow[] => {
    const categoryMap = breakdownByCategory.get(category)
    if (!categoryMap) return []
    return Array.from(categoryMap.entries())
      .map(([costName, totalCost]) => ({ costName, totalCost: roundMoney(totalCost) }))
      .sort((a, b) => a.costName.localeCompare(b.costName))
  }

  return ApiResponses.success({
    totals: {
      inbound: roundMoney(totals.inbound),
      outbound: roundMoney(totals.outbound),
      forwarding: roundMoney(totals.forwarding),
      storage: roundMoney(totals.storage),
      total: roundMoney(totals.total),
    },
    breakdown: {
      inbound: toBreakdown(CostCategory.Inbound),
      outbound: toBreakdown(CostCategory.Outbound),
      forwarding: toBreakdown(CostCategory.Forwarding),
      storage: toBreakdown(CostCategory.Storage),
    },
  })
})
