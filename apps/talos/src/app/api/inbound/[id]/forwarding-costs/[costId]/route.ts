import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import { INBOUND_COST_CURRENCIES, normalizeInboundCostCurrency } from '@/lib/constants/cost-currency'
import { hasPermission } from '@/lib/services/permission-service'
import { syncInboundOrderForwardingCostLedger } from '@/lib/services/inbound-forwarding-cost-service'
import { enforceCrossTenantManufacturingOnlyForInboundOrder } from '@/lib/services/inbound-cross-tenant-access'
import { getTenantPrisma } from '@/lib/tenant/server'
import { CostCategory, Prisma } from '@targon/prisma-talos'
import type { NextRequest } from 'next/server'
import { assertInboundOrderMutable } from '@/lib/inbound/workflow'

export const dynamic = 'force-dynamic'

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim().length === 0 ? undefined : value

const OptionalString = z.preprocess(emptyToUndefined, z.string().trim().optional())

const OptionalNumber = z.preprocess((value) => {
  const cleaned = emptyToUndefined(value)
  if (cleaned === undefined || cleaned === null) return undefined
  if (typeof cleaned === 'string') {
    const parsed = Number(cleaned)
    return Number.isNaN(parsed) ? cleaned : parsed
  }
  return cleaned
}, z.number().positive().optional())

const UpdateForwardingCostSchema = z.object({
  costName: OptionalString,
  quantity: OptionalNumber,
  notes: OptionalString,
  currency: z.preprocess(
    value => {
      const cleaned = emptyToUndefined(value)
      if (cleaned === undefined) return undefined
      return normalizeInboundCostCurrency(cleaned) ?? cleaned
    },
    z.enum(INBOUND_COST_CURRENCIES).optional()
  ),
})

function readParam(params: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = params?.[key]
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

export const DELETE = withAuthAndParams(async (_request: NextRequest, params, session) => {
  const inboundOrderId = readParam(params, 'id')
  const costId = readParam(params, 'costId')

  if (!inboundOrderId || !costId) {
    return ApiResponses.badRequest('Inbound ID and cost ID are required')
  }

  const canEdit = await hasPermission(session.user.id, 'inbound.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const prisma = await getTenantPrisma()

  const order = await prisma.inboundOrder.findUnique({
    where: { id: inboundOrderId },
    select: { status: true, postedAt: true },
  })

  if (!order) {
    return ApiResponses.notFound('Inbound not found')
  }

  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForInboundOrder({
    prisma,
    inboundOrderId: inboundOrderId,
    inboundOrderStatus: order.status,
  })
  if (crossTenantGuard) {
    return crossTenantGuard
  }

  try {
    assertInboundOrderMutable({
      status: order.status,
      postedAt: order.postedAt,
    })
  } catch (error) {
    return ApiResponses.handleError(error)
  }

  if (order.status !== 'OCEAN' && order.status !== 'WAREHOUSE') {
    return ApiResponses.conflict('Forwarding costs can be updated during OCEAN or WAREHOUSE stages')
  }

  const existing = await prisma.inboundOrderForwardingCost.findFirst({
    where: { id: costId, inboundOrderId },
    select: { id: true },
  })

  if (!existing) {
    return ApiResponses.notFound('Forwarding cost not found')
  }

  await prisma.inboundOrderForwardingCost.delete({ where: { id: costId } })

  if (order.status === 'WAREHOUSE') {
    await syncInboundOrderForwardingCostLedger({
      inboundOrderId,
      createdByName: session.user.name ?? session.user.email ?? 'Unknown',
    })
  }

  return ApiResponses.success({ success: true })
})

export const PATCH = withAuthAndParams(async (request: NextRequest, params, session) => {
  const inboundOrderId = readParam(params, 'id')
  const costId = readParam(params, 'costId')

  if (!inboundOrderId || !costId) {
    return ApiResponses.badRequest('Inbound ID and cost ID are required')
  }

  const canEdit = await hasPermission(session.user.id, 'inbound.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const payload = await request.json().catch(() => null)
  const parsed = UpdateForwardingCostSchema.safeParse(payload)
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const prisma = await getTenantPrisma()

  const order = await prisma.inboundOrder.findUnique({
    where: { id: inboundOrderId },
    select: { status: true, postedAt: true },
  })

  if (!order) {
    return ApiResponses.notFound('Inbound not found')
  }

  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForInboundOrder({
    prisma,
    inboundOrderId: inboundOrderId,
    inboundOrderStatus: order.status,
  })
  if (crossTenantGuard) {
    return crossTenantGuard
  }

  try {
    assertInboundOrderMutable({
      status: order.status,
      postedAt: order.postedAt,
    })
  } catch (error) {
    return ApiResponses.handleError(error)
  }

  if (order.status !== 'OCEAN' && order.status !== 'WAREHOUSE') {
    return ApiResponses.conflict('Forwarding costs can be updated during OCEAN or WAREHOUSE stages')
  }

  const existing = await prisma.inboundOrderForwardingCost.findFirst({
    where: { id: costId, inboundOrderId },
    select: { id: true, warehouseId: true },
  })

  if (!existing) {
    return ApiResponses.notFound('Forwarding cost not found')
  }

  let nextCostName: string | undefined
  if (parsed.data.costName !== undefined) {
    nextCostName = parsed.data.costName
  }

  let nextQuantity: number | undefined
  if (parsed.data.quantity !== undefined) {
    nextQuantity = parsed.data.quantity
  }

  const nextRate = nextCostName
    ? await prisma.costRate.findFirst({
        where: {
          warehouseId: existing.warehouseId,
          costCategory: CostCategory.Forwarding,
          costName: nextCostName,
          isActive: true,
        },
        orderBy: [{ updatedAt: 'desc' }],
      })
    : null

  if (nextCostName && !nextRate) {
    return ApiResponses.badRequest(`No forwarding rate found for ${nextCostName}`)
  }

  const current = await prisma.inboundOrderForwardingCost.findUnique({
    where: { id: costId },
    select: { costName: true, quantity: true, unitRate: true },
  })

  if (!current) {
    return ApiResponses.notFound('Forwarding cost not found')
  }

  const resolvedCostName = nextRate?.costName ?? current.costName
  const resolvedUnitRate = nextRate ? Number(nextRate.costValue) : Number(current.unitRate)
  const resolvedQuantity = nextQuantity ?? Number(current.quantity)
  const resolvedTotalCost = Number((resolvedUnitRate * resolvedQuantity).toFixed(2))

  const updated = await prisma.inboundOrderForwardingCost.update({
    where: { id: costId },
    data: {
      costRateId: nextRate?.id ?? undefined,
      costName: resolvedCostName,
      quantity: new Prisma.Decimal(resolvedQuantity),
      unitRate: new Prisma.Decimal(resolvedUnitRate),
      totalCost: new Prisma.Decimal(resolvedTotalCost),
      currency: parsed.data.currency ?? undefined,
      notes: parsed.data.notes ?? undefined,
    },
    select: {
      id: true,
      inboundOrderId: true,
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
    await syncInboundOrderForwardingCostLedger({
      inboundOrderId,
      createdByName: session.user.name ?? session.user.email ?? 'Unknown',
    })
  }

  return ApiResponses.success({
    id: updated.id,
    inboundOrderId: updated.inboundOrderId,
    warehouse: updated.warehouse,
    costRateId: updated.costRateId,
    costName: updated.costName,
    quantity: Number(updated.quantity),
    unitRate: Number(updated.unitRate),
    totalCost: Number(updated.totalCost),
    currency: updated.currency ?? null,
    notes: updated.notes ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    createdById: updated.createdById ?? null,
    createdByName: updated.createdByName ?? null,
  })
})
