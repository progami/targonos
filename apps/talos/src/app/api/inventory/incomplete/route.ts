import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'
import type { TransactionType } from '@targon/prisma-talos'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (_request, session) => {
  try {
    const prisma = await getTenantPrisma()

    // Get incomplete transactions based on user's warehouse
    let scopedWarehouseCode: string | undefined
    if (session.user.role === 'staff' && session.user.warehouseId) {
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: session.user.warehouseId },
        select: { code: true },
      })
      scopedWarehouseCode = warehouse?.code
    }

    const whereClause = scopedWarehouseCode ? { warehouseCode: scopedWarehouseCode } : {}

    // Find RECEIVE transactions missing tracking number or pickup date
    const incompleteReceive = await prisma.inventoryTransaction.findMany({
      where: {
        ...whereClause,
        transactionType: 'RECEIVE',
        OR: [{ trackingNumber: null }, { pickupDate: null }],
      },
      select: {
        id: true,
        transactionType: true,
        transactionDate: true,
        trackingNumber: true,
        pickupDate: true,
        attachments: true,
        skuCode: true,
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    })

    // Find SHIP transactions missing pickup date
    const incompleteShip = await prisma.inventoryTransaction.findMany({
      where: {
        ...whereClause,
        transactionType: 'SHIP',
        pickupDate: null,
      },
      select: {
        id: true,
        transactionType: true,
        transactionDate: true,
        pickupDate: true,
        attachments: true,
        skuCode: true,
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    })

    // Format response with missing fields
    type IncompleteTransaction = {
      id: string
      transactionType: TransactionType
      transactionDate: Date
      trackingNumber: string | null
      pickupDate: Date | null
      attachments: unknown
      skuCode: string
    }

    const formatTransaction = (tx: IncompleteTransaction) => {
      const missingFields: string[] = []

      if (tx.transactionType === 'RECEIVE') {
        if (!tx.trackingNumber) missingFields.push('tracking_number')
        if (!tx.pickupDate) missingFields.push('pickup_date')
      } else if (tx.transactionType === 'SHIP') {
        if (!tx.pickupDate) missingFields.push('pickup_date')
      }

      const attachmentsMissing = (() => {
        if (!tx.attachments) {
          return true
        }
        if (Array.isArray(tx.attachments)) {
          return tx.attachments.length === 0
        }
        if (typeof tx.attachments === 'object') {
          const keys = Object.keys(tx.attachments as Record<string, unknown>)
          return keys.filter(key => key !== 'notes').length === 0
        }
        return true
      })()

      if (attachmentsMissing) {
        missingFields.push('attachments')
      }

      return {
        id: tx.id,
        transactionType: tx.transactionType,
        skuCode: tx.skuCode,
        transactionDate: tx.transactionDate,
        missingFields,
      }
    }

    const allIncomplete = [
      ...incompleteReceive.map(tx => formatTransaction(tx as IncompleteTransaction)),
      ...incompleteShip.map(tx => formatTransaction(tx as IncompleteTransaction)),
    ].sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime())

    return NextResponse.json(allIncomplete)
  } catch (_error) {
    // console.error('Error fetching incomplete transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch incomplete transactions' },
      { status: 500 }
    )
  }
})

