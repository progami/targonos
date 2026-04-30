import { NextResponse } from 'next/server'
import { Prisma } from '@targon/prisma-talos'
import { aggregateInventoryTransactions } from '@targon/ledger'
import { withAuth } from '@/lib/api/auth-wrapper'
import {
  buildDashboardOverviewSnapshot,
  mapInboundOrderToDashboardOverviewInput,
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

  const inboundOrderWhere: Prisma.InboundOrderWhereInput = {
    status: { in: ['MANUFACTURING', 'OCEAN'] },
  }
  if (resolvedWarehouseCodeFilter !== null) {
    inboundOrderWhere.warehouseCode = resolvedWarehouseCodeFilter
  } else if (blockedAmazonWarehouseCodes.length > 0) {
    inboundOrderWhere.NOT = { warehouseCode: { in: blockedAmazonWarehouseCodes } }
  }

  const [transactions, inboundOrders] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where: transactionWhere,
      orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        inboundOrder: { select: { orderNumber: true } },
        outboundOrder: { select: { outboundNumber: true } },
      },
    }),
    prisma.inboundOrder.findMany({
      where: inboundOrderWhere,
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
    transactions.map(({ inboundOrder, outboundOrder, ...transaction }) => ({
      ...transaction,
      inboundOrderNumber: inboundOrder?.orderNumber ?? null,
      outboundOrderNumber: outboundOrder?.outboundNumber ?? null,
    }))
  )

  return NextResponse.json(
    buildDashboardOverviewSnapshot({
      inboundOrders: inboundOrders.map(mapInboundOrderToDashboardOverviewInput),
      balances: aggregated.balances.map(balance => ({
        warehouseCode: balance.warehouseCode,
        warehouseName: balance.warehouseName,
        skuCode: balance.skuCode,
        currentCartons: balance.currentCartons,
        currentPallets: balance.currentPallets,
        currentUnits: balance.currentUnits,
      })),
      movements: transactions.map(
        ({
          inboundOrder: _inboundOrder,
          outboundOrder: _outboundOrder,
          ...transaction
        }) => ({
          id: transaction.id,
          transactionType: transaction.transactionType,
          transactionDate: transaction.transactionDate,
          createdAt: transaction.createdAt,
          warehouseCode: transaction.warehouseCode,
          warehouseName: transaction.warehouseName,
          skuCode: transaction.skuCode,
          skuDescription: transaction.skuDescription,
          lotRef: transaction.lotRef,
          cartonsIn: transaction.cartonsIn,
          cartonsOut: transaction.cartonsOut,
          storagePalletsIn: transaction.storagePalletsIn,
          shippingPalletsOut: transaction.shippingPalletsOut,
          unitsPerCarton: transaction.unitsPerCarton,
        })
      ),
    })
  )
})
