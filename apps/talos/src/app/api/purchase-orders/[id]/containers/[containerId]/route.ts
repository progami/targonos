import { NextRequest } from 'next/server'
import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import { getTenantPrisma } from '@/lib/tenant/server'
import { NotFoundError } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { auditLog } from '@/lib/security/audit-logger'
import { Prisma } from '@targon/prisma-talos'

const CONTAINER_SIZES = ['20FT', '40FT', '40HC', '45HC'] as const

const UpdateContainerSchema = z.object({
  containerNumber: z.string().min(1).optional(),
  containerSize: z.enum(CONTAINER_SIZES).optional(),
  sealNumber: z.string().optional(),
})

/**
 * GET /api/purchase-orders/[id]/containers/[containerId]
 * Get a specific container
 */
export const GET = withAuthAndParams(async (request: NextRequest, params, _session) => {
  const id = params.id as string
  const containerId = params.containerId as string
  const prisma = await getTenantPrisma()

  const container = await prisma.purchaseOrderContainer.findFirst({
    where: {
      id: containerId,
      purchaseOrderId: id,
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
 * PATCH /api/purchase-orders/[id]/containers/[containerId]
 * Update a container
 */
export const PATCH = withAuthAndParams(async (request: NextRequest, params, _session) => {
  const id = params.id as string
  const containerId = params.containerId as string
  const prisma = await getTenantPrisma()

  const canEdit = await hasPermission(_session.user.id, 'po.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
  })

  if (!order) {
    throw new NotFoundError(`Purchase Order not found: ${id}`)
  }

  // Only allow editing containers before WAREHOUSE stage
  if (!['RFQ', 'MANUFACTURING', 'OCEAN'].includes(order.status)) {
    return ApiResponses.badRequest('Can only edit containers before WAREHOUSE stage')
  }

  const container = await prisma.purchaseOrderContainer.findFirst({
    where: {
      id: containerId,
      purchaseOrderId: id,
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

  const updateData: Prisma.PurchaseOrderContainerUpdateInput = {}
  if (result.data.containerNumber !== undefined) updateData.containerNumber = result.data.containerNumber
  if (result.data.containerSize !== undefined) updateData.containerSize = result.data.containerSize
  if (result.data.sealNumber !== undefined) updateData.sealNumber = result.data.sealNumber

  if (Object.keys(updateData).length === 0) {
    return ApiResponses.badRequest('No fields to update')
  }

  let updated
  try {
    updated = await prisma.purchaseOrderContainer.update({
      where: { id: containerId },
      data: updateData,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return ApiResponses.conflict('A container with this number already exists for the purchase order')
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
      entityType: 'PurchaseOrder',
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
 * DELETE /api/purchase-orders/[id]/containers/[containerId]
 * Delete a container
 */
export const DELETE = withAuthAndParams(async (request: NextRequest, params, _session) => {
  const id = params.id as string
  const containerId = params.containerId as string
  const prisma = await getTenantPrisma()

  const canEdit = await hasPermission(_session.user.id, 'po.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
  })

  if (!order) {
    throw new NotFoundError(`Purchase Order not found: ${id}`)
  }

  // Only allow deleting containers before WAREHOUSE stage
  if (!['RFQ', 'MANUFACTURING', 'OCEAN'].includes(order.status)) {
    return ApiResponses.badRequest('Can only delete containers before WAREHOUSE stage')
  }

  const container = await prisma.purchaseOrderContainer.findFirst({
    where: {
      id: containerId,
      purchaseOrderId: id,
    },
  })

  if (!container) {
    throw new NotFoundError(`Container not found: ${containerId}`)
  }

  await prisma.purchaseOrderContainer.delete({
    where: { id: containerId },
  })

  await auditLog({
    entityType: 'PurchaseOrder',
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
