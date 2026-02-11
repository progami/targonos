import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { syncPurchaseOrderForwardingCostLedger } from '@/lib/services/po-forwarding-cost-service'
import { enforceCrossTenantManufacturingOnlyForPurchaseOrder } from '@/lib/services/purchase-order-cross-tenant-access'
import { getTenantPrisma } from '@/lib/tenant/server'
import { CostCategory, Prisma } from '@targon/prisma-talos'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim().length === 0 ? undefined : value

const OptionalString = z.preprocess(emptyToUndefined, z.string().trim().optional())

const QuantitySchema = z.preprocess((value) => {
  const cleaned = emptyToUndefined(value)
  if (cleaned === undefined || cleaned === null) return undefined
  if (typeof cleaned === 'string') {
    const parsed = Number(cleaned)
    return Number.isNaN(parsed) ? cleaned : parsed
  }
  return cleaned
}, z.number().positive())


const CreateForwardingCostSchema = z.object({
  warehouseCode: z.string().trim().min(1),
  costName: z.string().trim().min(1),
  quantity: QuantitySchema,
  notes: OptionalString,
  currency: OptionalString,
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

  const prisma = await getTenantPrisma()

  const canView = await hasPermission(session.user.id, 'po.view')
  if (!canView) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForPurchaseOrder({
    prisma,
    purchaseOrderId: id,
  })
  if (crossTenantGuard) {
    return crossTenantGuard
  }

  const costs = await prisma.purchaseOrderForwardingCost.findMany({
    where: { purchaseOrderId: id },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      purchaseOrderId: true,
      warehouseId: true,
      costRateId: true,
      costName: true,
      quantity: true,
      unitRate: true,
      totalCost: true,
      currency: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      createdByName: true,
      warehouse: { select: { code: true, name: true } },
    },
  })

  return ApiResponses.success({
    data: costs.map((row) => ({
      id: row.id,
      purchaseOrderId: row.purchaseOrderId,
      warehouse: row.warehouse,
      costRateId: row.costRateId,
      costName: row.costName,
      quantity: Number(row.quantity),
      unitRate: Number(row.unitRate),
      totalCost: Number(row.totalCost),
      currency: row.currency ?? null,
      notes: row.notes ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdById: row.createdById ?? null,
      createdByName: row.createdByName ?? null,
    })),
  })
})

export const POST = withAuthAndParams(async (request: NextRequest, params, session) => {
  const id = readParam(params, 'id')
  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const canEdit = await hasPermission(session.user.id, 'po.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const payload = await request.json().catch(() => null)
  const parsed = CreateForwardingCostSchema.safeParse(payload)
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const prisma = await getTenantPrisma()

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
    },
  })

  if (!order) {
    return ApiResponses.notFound('Purchase order not found')
  }

  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForPurchaseOrder({
    prisma,
    purchaseOrderId: id,
    purchaseOrderStatus: order.status,
  })
  if (crossTenantGuard) {
    return crossTenantGuard
  }

  if (order.status !== 'OCEAN' && order.status !== 'WAREHOUSE') {
    return ApiResponses.conflict('Forwarding costs can be set during OCEAN or WAREHOUSE stages')
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { code: parsed.data.warehouseCode },
    select: { id: true, code: true, name: true },
  })

  if (!warehouse) {
    return ApiResponses.badRequest(`Invalid warehouseCode: ${parsed.data.warehouseCode}`)
  }

  const rate = await prisma.costRate.findFirst({
    where: {
      warehouseId: warehouse.id,
      costCategory: CostCategory.Forwarding,
      costName: parsed.data.costName,
      isActive: true,
    },
    orderBy: [{ updatedAt: 'desc' }],
  })

  if (!rate) {
    return ApiResponses.badRequest(`No forwarding rate found for ${parsed.data.costName}`)
  }

  const quantity = parsed.data.quantity
  const unitRate = Number(rate.costValue)
  const totalCost = Number((unitRate * quantity).toFixed(2))

  const created = await prisma.purchaseOrderForwardingCost.create({
    data: {
      purchaseOrderId: id,
      warehouseId: warehouse.id,
      costRateId: rate.id,
      costName: rate.costName,
      quantity: new Prisma.Decimal(quantity),
      unitRate: new Prisma.Decimal(unitRate),
      totalCost: new Prisma.Decimal(totalCost),
      currency: parsed.data.currency ?? null,
      notes: parsed.data.notes ?? null,
      createdById: session.user.id,
      createdByName: session.user.name ?? session.user.email ?? null,
    },
    select: {
      id: true,
      purchaseOrderId: true,
      costRateId: true,
      warehouseId: true,
      costName: true,
      quantity: true,
      unitRate: true,
      totalCost: true,
      currency: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      createdByName: true,
      warehouse: { select: { code: true, name: true } },
    },
  })

  if (order.status === 'WAREHOUSE') {
    await syncPurchaseOrderForwardingCostLedger({
      purchaseOrderId: id,
      createdByName: session.user.name ?? session.user.email ?? 'Unknown',
    })
  }

  return ApiResponses.success({
    id: created.id,
    purchaseOrderId: created.purchaseOrderId,
    warehouse: created.warehouse,
    costRateId: created.costRateId,
    costName: created.costName,
    quantity: Number(created.quantity),
    unitRate: Number(created.unitRate),
    totalCost: Number(created.totalCost),
    currency: created.currency ?? null,
    notes: created.notes ?? null,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
    createdById: created.createdById ?? null,
    createdByName: created.createdByName ?? null,
  })
})
