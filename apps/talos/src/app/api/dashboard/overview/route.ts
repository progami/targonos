import { NextResponse } from 'next/server'
import { Prisma } from '@targon/prisma-talos'
import { aggregateInventoryTransactions } from '@targon/ledger'
import { withAuth } from '@/lib/api/auth-wrapper'
import {
  buildDashboardOverviewSnapshot,
  mapPurchaseOrderToDashboardOverviewInput,
} from '@/lib/dashboard/dashboard-overview'
import { getTenantPrisma } from '@/lib/tenant/server'
import {
  AMAZON_WAREHOUSE_CODES,
  canRegionUseWarehouseCode,
  type TalosRegion,
} from '@/lib/warehouses/amazon-warehouse'

export const dynamic = 'force-dynamic'

type DashboardOverviewSession = {
  user: {
    role?: string
    warehouseId?: string | null
  }
}

export async function resolveDashboardOverviewWarehouseCodeFilter(
  prisma: Awaited<ReturnType<typeof getTenantPrisma>>,
  session: DashboardOverviewSession
): Promise<string | Response | null> {
  if (session.user.role !== 'staff') {
    return null
  }

  if (!session.user.warehouseId) {
    return NextResponse.json({ error: 'No warehouse assigned' }, { status: 400 })
  }

  const staffWarehouse = await prisma.warehouse.findUnique({
    where: { id: session.user.warehouseId },
    select: { code: true },
  })

  if (staffWarehouse === null) {
    return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 })
  }

  return staffWarehouse.code
}

export const GET = withAuth(async (_request, session) => {
  const prisma = await getTenantPrisma()
  const warehouseCodeFilter = await resolveDashboardOverviewWarehouseCodeFilter(prisma, session)

  if (warehouseCodeFilter instanceof Response) {
    return warehouseCodeFilter
  }

  const resolvedWarehouseCodeFilter = warehouseCodeFilter
  const blockedAmazonWarehouseCodes =
    resolvedWarehouseCodeFilter === null
      ? AMAZON_WAREHOUSE_CODES.filter(
          warehouseCode =>
            !canRegionUseWarehouseCode(session.user.region as TalosRegion, warehouseCode)
        )
      : []

  const transactionWhere: Prisma.InventoryTransactionWhereInput = {}
  if (resolvedWarehouseCodeFilter !== null) {
    transactionWhere.warehouseCode = resolvedWarehouseCodeFilter
  } else if (blockedAmazonWarehouseCodes.length > 0) {
    transactionWhere.NOT = { warehouseCode: { in: blockedAmazonWarehouseCodes } }
  }

  const purchaseOrderWhere: Prisma.PurchaseOrderWhereInput = {
    status: { in: ['MANUFACTURING', 'OCEAN'] },
  }
  if (resolvedWarehouseCodeFilter !== null) {
    purchaseOrderWhere.warehouseCode = resolvedWarehouseCodeFilter
  } else if (blockedAmazonWarehouseCodes.length > 0) {
    purchaseOrderWhere.NOT = { warehouseCode: { in: blockedAmazonWarehouseCodes } }
  }

  const [transactions, purchaseOrders] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where: transactionWhere,
      orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        purchaseOrder: { select: { orderNumber: true } },
        fulfillmentOrder: { select: { foNumber: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: purchaseOrderWhere,
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        orderNumber: true,
        status: true,
        counterpartyName: true,
        warehouseCode: true,
        warehouseName: true,
        totalCartons: true,
        totalPallets: true,
        lines: { select: { unitsOrdered: true } },
      },
    }),
  ])

  const aggregated = aggregateInventoryTransactions(
    transactions.map(({ purchaseOrder, fulfillmentOrder, ...transaction }) => ({
      ...transaction,
      purchaseOrderNumber: purchaseOrder?.orderNumber ?? null,
      fulfillmentOrderNumber: fulfillmentOrder?.foNumber ?? null,
    }))
  )

  return NextResponse.json(
    buildDashboardOverviewSnapshot({
      purchaseOrders: purchaseOrders.map(mapPurchaseOrderToDashboardOverviewInput),
      balances: aggregated.balances.map(balance => ({
        warehouseCode: balance.warehouseCode,
        warehouseName: balance.warehouseName,
        skuCode: balance.skuCode,
        currentCartons: balance.currentCartons,
        currentPallets: balance.currentPallets,
        currentUnits: balance.currentUnits,
      })),
    })
  )
})
