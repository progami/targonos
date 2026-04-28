import { NextRequest } from 'next/server'
import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import { getTenantPrisma } from '@/lib/tenant/server'
import { NotFoundError } from '@/lib/api'
import { assertInboundOrderMutable } from '@/lib/inbound/workflow'
import { hasPermission } from '@/lib/services/permission-service'
import { enforceCrossTenantManufacturingOnlyForInboundOrder } from '@/lib/services/inbound-cross-tenant-access'
import { auditLog } from '@/lib/security/audit-logger'
import { Prisma } from '@targon/prisma-talos'

const CONTAINER_SIZES = ['20FT', '40FT', '40HC', '45HC'] as const

const UpdateContainerSchema = z.object({
  containerNumber: z.string().min(1).optional(),
  containerSize: z.enum(CONTAINER_SIZES).optional(),
  sealNumber: z.string().optional(),
})

/**
 * GET /api/inbound/[id]/containers/[containerId]
 * Get a specific container
 */
export const GET = withAuthAndParams(async (request: NextRequest, params, _session) => {
  const id = params.id as string
  const containerId = params.containerId as string
  const prisma = await getTenantPrisma()

  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForInboundOrder({
    prisma,
    inboundOrderId: id,
  })
  if (crossTenantGuard) {
    return crossTenantGuard
  }

  const container = await prisma.inboundOrderContainer.findFirst({
    where: {
      id: containerId,
      inboundOrderId: id,
    },
  })

  if (!container) {
    throw new NotFoundError(`Container not found: ${containerId}`)
  }

  return ApiResponses.success({
    id: container.id,
    containerNumber: container.containerNumber,
    containerSize: container.containerSize,
    sealNumber: container.sealNumber,
    createdAt: container.createdAt.toISOString(),
    updatedAt: container.updatedAt.toISOString(),
  })
})

/**
 * PATCH /api/inbound/[id]/containers/[containerId]
 * Update a container
 */
export const PATCH = withAuthAndParams(async (request: NextRequest, params, _session) => {
  const id = params.id as string
  const containerId = params.containerId as string
  const prisma = await getTenantPrisma()

  const canEdit = await hasPermission(_session.user.id, 'inbound.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const order = await prisma.inboundOrder.findUnique({
    where: { id },
  })

  if (!order) {
    throw new NotFoundError(`Inbound not found: ${id}`)
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

  // Only allow editing containers before WAREHOUSE stage
  if (!['ISSUED', 'RFQ', 'MANUFACTURING', 'OCEAN'].includes(order.status)) {
    return ApiResponses.badRequest('Can only edit containers before WAREHOUSE stage')
  }

  const container = await prisma.inboundOrderContainer.findFirst({
    where: {
      id: containerId,
      inboundOrderId: id,
    },
  })

  if (!container) {
    throw new NotFoundError(`Container not found: ${containerId}`)
  }

  const payload = await request.json().catch(() => null)
  const result = UpdateContainerSchema.safeParse(payload)

  if (!result.success) {
    return ApiResponses.badRequest(
      `Invalid payload: ${result.error.errors.map((e) => e.message).join(', ')}`
    )
  }

  const updateData: Prisma.InboundOrderContainerUpdateInput = {}
  if (result.data.containerNumber !== undefined) updateData.containerNumber = result.data.containerNumber
  if (result.data.containerSize !== undefined) updateData.containerSize = result.data.containerSize
  if (result.data.sealNumber !== undefined) updateData.sealNumber = result.data.sealNumber

  if (Object.keys(updateData).length === 0) {
    return ApiResponses.badRequest('No fields to update')
  }

  let updated
  try {
    updated = await prisma.inboundOrderContainer.update({
      where: { id: containerId },
      data: updateData,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return ApiResponses.conflict('A container with this number already exists for the inbound')
    }
    throw error
  }

  const before = {
    containerId: container.id,
    containerNumber: container.containerNumber,
    containerSize: container.containerSize,
    sealNumber: container.sealNumber ?? null,
  }
  const after = {
    containerId: updated.id,
    containerNumber: updated.containerNumber,
    containerSize: updated.containerSize,
    sealNumber: updated.sealNumber ?? null,
  }

  const auditOldValue: Record<string, unknown> = { containerId: container.id }
  const auditNewValue: Record<string, unknown> = { containerId: container.id }

  for (const key of Object.keys(after) as Array<keyof typeof after>) {
    if (key === 'containerId') continue
    if (before[key] === after[key]) continue
    auditOldValue[key] = before[key]
    auditNewValue[key] = after[key]
  }

  if (Object.keys(auditNewValue).length > 1) {
    await auditLog({
      entityType: 'InboundOrder',
      entityId: id,
      action: 'CONTAINER_UPDATE',
      userId: _session.user.id,
      oldValue: auditOldValue,
      newValue: auditNewValue,
    })
  }

  return ApiResponses.success({
    id: updated.id,
    containerNumber: updated.containerNumber,
    containerSize: updated.containerSize,
    sealNumber: updated.sealNumber,
    updatedAt: updated.updatedAt.toISOString(),
  })
})

/**
 * DELETE /api/inbound/[id]/containers/[containerId]
 * Delete a container
 */
export const DELETE = withAuthAndParams(async (request: NextRequest, params, _session) => {
  const id = params.id as string
  const containerId = params.containerId as string
  const prisma = await getTenantPrisma()

  const canEdit = await hasPermission(_session.user.id, 'inbound.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const order = await prisma.inboundOrder.findUnique({
    where: { id },
  })

  if (!order) {
    throw new NotFoundError(`Inbound not found: ${id}`)
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

  // Only allow deleting containers before WAREHOUSE stage
  if (!['ISSUED', 'RFQ', 'MANUFACTURING', 'OCEAN'].includes(order.status)) {
    return ApiResponses.badRequest('Can only delete containers before WAREHOUSE stage')
  }

  const container = await prisma.inboundOrderContainer.findFirst({
    where: {
      id: containerId,
      inboundOrderId: id,
    },
  })

  if (!container) {
    throw new NotFoundError(`Container not found: ${containerId}`)
  }

  await prisma.inboundOrderContainer.delete({
    where: { id: containerId },
  })

  await auditLog({
    entityType: 'InboundOrder',
    entityId: id,
    action: 'CONTAINER_DELETE',
    userId: _session.user.id,
    oldValue: {
      containerId: container.id,
      containerNumber: container.containerNumber,
      containerSize: container.containerSize,
      sealNumber: container.sealNumber ?? null,
    },
    newValue: { containerId: container.id, deleted: true },
  })

  return ApiResponses.success({ deleted: true })
})
