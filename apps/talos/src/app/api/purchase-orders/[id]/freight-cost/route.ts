import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { syncPurchaseOrderForwardingCostLedger } from '@/lib/services/po-forwarding-cost-service'
import { getTenantPrisma } from '@/lib/tenant/server'
import { PurchaseOrderStatus, Prisma } from '@targon/prisma-talos'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const AmountSchema = z.preprocess((value) => {
  if (value === undefined || value === null) return value
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return value
    const parsed = Number(trimmed)
    return Number.isNaN(parsed) ? value : parsed
  }
  return value
}, z.number().positive())

const FreightCostSchema = z.object({
  amount: AmountSchema,
})

function readParam(params: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = params?.[key]
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

export const GET = withAuthAndParams(async (_request: NextRequest, params, session) => {
  const id = readParam(params, 'id')
  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const canView = await hasPermission(session.user.id, 'po.view')
  if (!canView) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const prisma = await getTenantPrisma()

  const entries = await prisma.purchaseOrderForwardingCost.findMany({
    where: { purchaseOrderId: id },
    select: { totalCost: true },
  })

  const amount = entries.reduce((sum, row) => sum + Number(row.totalCost), 0)

  return ApiResponses.success({
    amount: Number(amount.toFixed(2)),
  })
})

export const PATCH = withAuthAndParams(async (request: NextRequest, params, session) => {
  const id = readParam(params, 'id')
  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const canEdit = await hasPermission(session.user.id, 'po.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const payload = await request.json().catch(() => null)
  const parsed = FreightCostSchema.safeParse(payload)
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const prisma = await getTenantPrisma()

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      warehouseCode: true,
      receivedDate: true,
    },
  })

  if (!order) {
    return ApiResponses.notFound('Purchase order not found')
  }

  if (order.status !== PurchaseOrderStatus.OCEAN && order.status !== PurchaseOrderStatus.WAREHOUSE) {
    return ApiResponses.conflict('Freight cost can be set during OCEAN or WAREHOUSE stages')
  }

  const warehouse =
    typeof order.warehouseCode === 'string' && order.warehouseCode.trim().length > 0
      ? await prisma.warehouse.findUnique({
          where: { code: order.warehouseCode.trim() },
          select: { id: true },
        })
      : null

  const fallbackWarehouse = warehouse
    ? null
    : await prisma.warehouse.findFirst({
        where: { isActive: true },
        select: { id: true },
        orderBy: [{ code: 'asc' }],
      })

  const resolvedWarehouseId = warehouse?.id ?? fallbackWarehouse?.id
  if (!resolvedWarehouseId) {
    return ApiResponses.conflict('No active warehouse found')
  }

  const normalizedAmount = Number(parsed.data.amount.toFixed(2))

  const createdByName = session.user.name ?? session.user.email ?? null

  const updated = await prisma.$transaction(async tx => {
    await tx.purchaseOrderForwardingCost.deleteMany({
      where: { purchaseOrderId: id },
    })

    return tx.purchaseOrderForwardingCost.create({
      data: {
        purchaseOrderId: id,
        warehouseId: resolvedWarehouseId,
        costRateId: null,
        costName: 'Freight',
        quantity: new Prisma.Decimal(1),
        unitRate: new Prisma.Decimal(normalizedAmount),
        totalCost: new Prisma.Decimal(normalizedAmount),
        currency: null,
        notes: null,
        createdById: session.user.id,
        createdByName,
      },
      select: {
        id: true,
        purchaseOrderId: true,
        costRateId: true,
        costName: true,
        quantity: true,
        unitRate: true,
        totalCost: true,
        currency: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  })

  if (order.status === PurchaseOrderStatus.WAREHOUSE && order.receivedDate && createdByName) {
    await syncPurchaseOrderForwardingCostLedger({
      purchaseOrderId: id,
      createdByName,
    })
  }

  return ApiResponses.success({
    ...updated,
    quantity: Number(updated.quantity),
    unitRate: Number(updated.unitRate),
    totalCost: Number(updated.totalCost),
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
})

