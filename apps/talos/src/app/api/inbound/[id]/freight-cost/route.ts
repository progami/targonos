import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import {
  INBOUND_COST_CURRENCIES,
  INBOUND_BASE_CURRENCY,
  normalizeInboundCostCurrency,
} from '@/lib/constants/cost-currency'
import { hasPermission } from '@/lib/services/permission-service'
import { syncInboundOrderForwardingCostLedger } from '@/lib/services/inbound-forwarding-cost-service'
import { enforceCrossTenantManufacturingOnlyForInboundOrder } from '@/lib/services/inbound-cross-tenant-access'
import { getTenantPrisma } from '@/lib/tenant/server'
import { InboundOrderStatus, Prisma } from '@targon/prisma-talos'
import type { NextRequest } from 'next/server'
import { assertInboundOrderMutable } from '@/lib/inbound/workflow'

export const dynamic = 'force-dynamic'

const AmountSchema = z.preprocess(value => {
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
  currency: z.preprocess(
    value => normalizeInboundCostCurrency(value) ?? value,
    z.enum(INBOUND_COST_CURRENCIES).optional()
  ),
})

const FreightLineSchema = z.object({
  costName: z.string().trim().min(1, 'Cost name is required').max(200),
  amount: AmountSchema,
  currency: z.preprocess(
    value => normalizeInboundCostCurrency(value) ?? value,
    z.enum(INBOUND_COST_CURRENCIES).optional()
  ),
  notes: z.string().trim().max(500).optional(),
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
    return ApiResponses.badRequest('Inbound ID is required')
  }

  const canView = await hasPermission(session.user.id, 'inbound.view')
  if (!canView) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const prisma = await getTenantPrisma()

  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForInboundOrder({
    prisma,
    inboundOrderId: id,
  })
  if (crossTenantGuard) {
    return crossTenantGuard
  }

  const entries = await prisma.inboundOrderForwardingCost.findMany({
    where: { inboundOrderId: id },
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
    return ApiResponses.badRequest('Inbound ID is required')
  }

  const canEdit = await hasPermission(session.user.id, 'inbound.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const payload = await request.json().catch(() => null)
  const parsed = FreightCostSchema.safeParse(payload)
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const prisma = await getTenantPrisma()

  const order = await prisma.inboundOrder.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      postedAt: true,
      warehouseCode: true,
      receivedDate: true,
    },
  })

  if (!order) {
    return ApiResponses.notFound('Inbound not found')
  }

  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForInboundOrder({
    prisma,
    inboundOrderId: id,
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

  if (
    order.status !== InboundOrderStatus.OCEAN &&
    order.status !== InboundOrderStatus.WAREHOUSE
  ) {
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
  const currency = parsed.data.currency ?? INBOUND_BASE_CURRENCY

  const createdByName = session.user.name ?? session.user.email ?? null

  const updated = await prisma.$transaction(async tx => {
    await tx.inboundOrderForwardingCost.deleteMany({
      where: { inboundOrderId: id },
    })

    return tx.inboundOrderForwardingCost.create({
      data: {
        inboundOrderId: id,
        warehouseId: resolvedWarehouseId,
        costRateId: null,
        costName: 'Freight',
        quantity: new Prisma.Decimal(1),
        unitRate: new Prisma.Decimal(normalizedAmount),
        totalCost: new Prisma.Decimal(normalizedAmount),
        currency,
        notes: null,
        createdById: session.user.id,
        createdByName,
      },
      select: {
        id: true,
        inboundOrderId: true,
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

  if (order.status === InboundOrderStatus.WAREHOUSE && order.receivedDate && createdByName) {
    await syncInboundOrderForwardingCostLedger({
      inboundOrderId: id,
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

export const POST = withAuthAndParams(async (request: NextRequest, params, session) => {
  const id = readParam(params, 'id')
  if (!id) {
    return ApiResponses.badRequest('Inbound ID is required')
  }

  const canEdit = await hasPermission(session.user.id, 'inbound.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const payload = await request.json().catch(() => null)
  const parsed = FreightLineSchema.safeParse(payload)
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const prisma = await getTenantPrisma()

  const order = await prisma.inboundOrder.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      postedAt: true,
      warehouseCode: true,
      receivedDate: true,
    },
  })

  if (!order) {
    return ApiResponses.notFound('Inbound not found')
  }

  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForInboundOrder({
    prisma,
    inboundOrderId: id,
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

  if (
    order.status !== InboundOrderStatus.OCEAN &&
    order.status !== InboundOrderStatus.WAREHOUSE
  ) {
    return ApiResponses.conflict('Freight cost can be added during OCEAN or WAREHOUSE stages')
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
  const currency = parsed.data.currency ?? INBOUND_BASE_CURRENCY
  const createdByName = session.user.name ?? session.user.email ?? null

  const created = await prisma.inboundOrderForwardingCost.create({
    data: {
      inboundOrderId: id,
      warehouseId: resolvedWarehouseId,
      costRateId: null,
      costName: parsed.data.costName,
      quantity: new Prisma.Decimal(1),
      unitRate: new Prisma.Decimal(normalizedAmount),
      totalCost: new Prisma.Decimal(normalizedAmount),
      currency,
      notes: parsed.data.notes ? parsed.data.notes : null,
      createdById: session.user.id,
      createdByName,
    },
    select: {
      id: true,
      inboundOrderId: true,
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

  if (order.status === InboundOrderStatus.WAREHOUSE && order.receivedDate && createdByName) {
    await syncInboundOrderForwardingCostLedger({
      inboundOrderId: id,
      createdByName,
    })
  }

  return ApiResponses.success({
    ...created,
    quantity: Number(created.quantity),
    unitRate: Number(created.unitRate),
    totalCost: Number(created.totalCost),
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  })
})

export const DELETE = withAuthAndParams(async (request: NextRequest, params, session) => {
  const id = readParam(params, 'id')
  if (!id) {
    return ApiResponses.badRequest('Inbound ID is required')
  }

  const canEdit = await hasPermission(session.user.id, 'inbound.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const url = new URL(request.url)
  const costId = url.searchParams.get('costId')
  if (!costId) {
    return ApiResponses.badRequest('costId query parameter is required')
  }

  const prisma = await getTenantPrisma()

  const order = await prisma.inboundOrder.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      postedAt: true,
      receivedDate: true,
    },
  })

  if (!order) {
    return ApiResponses.notFound('Inbound not found')
  }

  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForInboundOrder({
    prisma,
    inboundOrderId: id,
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

  if (
    order.status !== InboundOrderStatus.OCEAN &&
    order.status !== InboundOrderStatus.WAREHOUSE
  ) {
    return ApiResponses.conflict('Freight cost can be removed during OCEAN or WAREHOUSE stages')
  }

  const costRow = await prisma.inboundOrderForwardingCost.findUnique({
    where: { id: costId },
    select: { id: true, inboundOrderId: true },
  })

  if (!costRow || costRow.inboundOrderId !== id) {
    return ApiResponses.notFound('Freight cost entry not found')
  }

  await prisma.inboundOrderForwardingCost.delete({
    where: { id: costId },
  })

  const createdByName = session.user.name ?? session.user.email ?? null
  if (order.status === InboundOrderStatus.WAREHOUSE && order.receivedDate && createdByName) {
    await syncInboundOrderForwardingCostLedger({
      inboundOrderId: id,
      createdByName,
    })
  }

  return ApiResponses.success({ deleted: true })
})
