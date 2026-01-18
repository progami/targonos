import { NextResponse } from 'next/server'
import { getTenantPrisma } from '@/lib/tenant/server'
import { Prisma } from '@targon/prisma-talos'
import {
  getPaginationParams,
  getPaginationSkipTake,
  createPaginatedResponse
} from '@/lib/database/pagination'
import { toPublicOrderNumber } from '@/lib/services/purchase-order-utils'
import { sanitizeSearchQuery } from '@/lib/security/input-sanitization'
import { aggregateInventoryTransactions } from '@targon/ledger'
import { withAuth } from '@/lib/api/auth-wrapper'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req, session) => {
 try {
 const prisma = await getTenantPrisma()
 const searchParams = req.nextUrl.searchParams
 const warehouseId = searchParams.get('warehouseId') || session.user.warehouseId
 const date = searchParams.get('date')
 const showZeroStock = searchParams.get('showZeroStock') === 'true'
 const skuCode = searchParams.get('skuCode')

 const paginationParams = getPaginationParams(req)

 const pointInTime = date ? new Date(date) : new Date()
 pointInTime.setHours(23, 59, 59, 999)

 const transactionWhere: Prisma.InventoryTransactionWhereInput = {
 transactionDate: { lte: pointInTime },
 }

 if (session.user.role === 'staff' && session.user.warehouseId) {
 const staffWarehouse = await prisma.warehouse.findUnique({
 where: { id: session.user.warehouseId },
 select: { code: true }
 })
 if (staffWarehouse) {
 transactionWhere.warehouseCode = staffWarehouse.code
 }
 } else if (warehouseId) {
 const warehouse = await prisma.warehouse.findUnique({
 where: { id: warehouseId },
 select: { code: true }
 })
 if (warehouse) {
 transactionWhere.warehouseCode = warehouse.code
 }
 } else {
 transactionWhere.NOT = {
 OR: [
 { warehouseCode: 'AMZN' },
 { warehouseCode: 'AMZN-UK' }
 ]
 }
 }

 if (skuCode) {
 transactionWhere.skuCode = {
 contains: sanitizeSearchQuery(skuCode),
 mode: 'insensitive'
 }
 }

  const { skip, take } = getPaginationSkipTake(paginationParams)

  const transactions = await prisma.inventoryTransaction.findMany({
    where: transactionWhere,
    orderBy: [
      { transactionDate: 'asc' },
      { createdAt: 'asc' }
    ],
    include: {
      purchaseOrder: {
        select: { orderNumber: true }
      },
      fulfillmentOrder: {
        select: { foNumber: true }
      }
    }
  })

  const ledgerTransactions = transactions.map(({ purchaseOrder, fulfillmentOrder, ...transaction }) => ({
    ...transaction,
    purchaseOrderNumber: purchaseOrder?.orderNumber ? toPublicOrderNumber(purchaseOrder.orderNumber) : null,
    fulfillmentOrderNumber: fulfillmentOrder?.foNumber ?? null,
  }))

  const aggregated = aggregateInventoryTransactions(ledgerTransactions, {
    includeZeroStock: showZeroStock
  })

  const paginatedBalances = date
    ? aggregated.balances
    : aggregated.balances.slice(skip, skip + take)

  const warehouseCodes = [...new Set(paginatedBalances.map(b => b.warehouseCode))]
  const warehouses = await prisma.warehouse.findMany({
    where: { code: { in: warehouseCodes } },
    select: { id: true, code: true }
  })
  const warehouseMap = new Map(warehouses.map(w => [w.code, w.id]))

  const skuCodes = [...new Set(paginatedBalances.map(b => b.skuCode))]
  const skus = await prisma.sku.findMany({
    where: { skuCode: { in: skuCodes } },
    select: { id: true, skuCode: true }
  })
  const skuMap = new Map(skus.map(s => [s.skuCode, s.id]))

  const results = paginatedBalances.map(balance => {
    const receiveTransaction = balance.firstReceive
      ? {
          createdBy: {
            fullName: balance.firstReceive.createdByName ?? 'Unknown'
          },
          transactionDate: balance.firstReceive.transactionDate,
          createdById: balance.firstReceive.createdById ?? undefined
        }
      : undefined

    return {
      id: balance.id,
      warehouseId: warehouseMap.get(balance.warehouseCode) || balance.warehouseCode,
      warehouse: {
        code: balance.warehouseCode,
        name: balance.warehouseName
      },
      skuId: skuMap.get(balance.skuCode) || balance.skuCode,
      sku: {
        skuCode: balance.skuCode,
        description: balance.skuDescription,
        unitsPerCarton: balance.unitsPerCarton
      },
      batchLot: balance.batchLot,
      currentCartons: balance.currentCartons,
      currentPallets: balance.currentPallets,
      currentUnits: balance.currentUnits,
      storageCartonsPerPallet: balance.storageCartonsPerPallet ?? undefined,
      shippingCartonsPerPallet: balance.shippingCartonsPerPallet ?? undefined,
      lastTransactionDate: balance.lastTransactionDate,
      lastTransactionId: balance.lastTransactionId ?? undefined,
      lastTransactionType: balance.lastTransactionType ?? undefined,
      lastTransactionReference: balance.lastTransactionReference ?? undefined,
      purchaseOrderId: balance.purchaseOrderId ?? null,
      purchaseOrderNumber: balance.purchaseOrderNumber ? toPublicOrderNumber(balance.purchaseOrderNumber) : null,
      fulfillmentOrderId: balance.fulfillmentOrderId ?? null,
      fulfillmentOrderNumber: balance.fulfillmentOrderNumber ?? null,
      receiveTransaction
    }
  })

  const summary = aggregated.summary

  if (date) {
    return NextResponse.json({
      data: results,
      summary
    })
  }

  const paginatedResponse = createPaginatedResponse(results, aggregated.balances.length, paginationParams)

  return NextResponse.json({
    ...paginatedResponse,
    summary
  })
 } catch (_error) {
 return NextResponse.json(
 {
 error: 'Failed to fetch inventory balances',
 details: _error instanceof Error ? _error.message : 'Unknown error'
 },
 { status: 500 }
 )
 }
})
