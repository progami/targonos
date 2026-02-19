import { NextRequest } from 'next/server'
import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import { getTenantPrisma } from '@/lib/tenant/server'
import { NotFoundError } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { enforceCrossTenantManufacturingOnlyForPurchaseOrder } from '@/lib/services/purchase-order-cross-tenant-access'
import { auditLog } from '@/lib/security/audit-logger'
import { Prisma } from '@targon/prisma-talos'

const CONTAINER_SIZES = ['20FT', '40FT', '40HC', '45HC'] as const

const ContainerSchema = z.object({
  containerNumber: z.string().min(1),
  containerSize: z.enum(CONTAINER_SIZES),
  sealNumber: z.string().optional(),
})

/**
 * GET /api/purchase-orders/[id]/containers
 * Get all containers for a purchase order
 */
export const GET = withAuthAndParams(async (request: NextRequest, params, _session) => {
  const id = params.id as string
  const prisma = await getTenantPrisma()

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { containers: true },
  })

  if (!order) {
    throw new NotFoundError(`Purchase Order not found: ${id}`)
  }

  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForPurchaseOrder({
    prisma,
    purchaseOrderId: id,
    purchaseOrderStatus: order.status,
  })
  if (crossTenantGuard) {
    return crossTenantGuard
  }

  return ApiResponses.success({
    data: order.containers.map((container) => ({
      id: container.id,
      containerNumber: container.containerNumber,
      containerSize: container.containerSize,
      sealNumber: container.sealNumber,
      createdAt: container.createdAt.toISOString(),
    })),
  })
})

/**
 * POST /api/purchase-orders/[id]/containers
 * Add a new container to a purchase order (Stage 3: Ocean)
 */
export const POST = withAuthAndParams(async (request: NextRequest, params, _session) => {
  const id = params.id as string
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

  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForPurchaseOrder({
    prisma,
    purchaseOrderId: id,
    purchaseOrderStatus: order.status,
  })
  if (crossTenantGuard) {
    return crossTenantGuard
  }

  // Only allow adding containers in OCEAN status (or earlier for prep)
  if (!['ISSUED', 'RFQ', 'MANUFACTURING', 'OCEAN'].includes(order.status)) {
    return ApiResponses.badRequest('Can only add containers before or during OCEAN stage')
  }

  const payload = await request.json().catch(() => null)
  const result = ContainerSchema.safeParse(payload)

  if (!result.success) {
    return ApiResponses.badRequest(
      `Invalid payload: ${result.error.errors.map((e) => e.message).join(', ')}`
    )
  }

  let container
  try {
    container = await prisma.purchaseOrderContainer.create({
      data: {
        purchaseOrderId: id,
        containerNumber: result.data.containerNumber,
        containerSize: result.data.containerSize,
        sealNumber: result.data.sealNumber,
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return ApiResponses.conflict('A container with this number already exists for the purchase order')
    }
    throw error
  }

  await auditLog({
    entityType: 'PurchaseOrder',
    entityId: id,
    action: 'CONTAINER_ADD',
    userId: _session.user.id,
    newValue: {
      containerId: container.id,
      containerNumber: container.containerNumber,
      containerSize: container.containerSize,
      sealNumber: container.sealNumber ?? null,
    },
  })

  return ApiResponses.success({
    id: container.id,
    containerNumber: container.containerNumber,
    containerSize: container.containerSize,
    sealNumber: container.sealNumber,
    createdAt: container.createdAt.toISOString(),
  })
})
