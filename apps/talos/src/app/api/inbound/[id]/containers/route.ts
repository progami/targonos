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

const ContainerSchema = z.object({
  containerNumber: z.string().min(1),
  containerSize: z.enum(CONTAINER_SIZES),
  sealNumber: z.string().optional(),
})

/**
 * GET /api/inbound/[id]/containers
 * Get all containers for a inbound
 */
export const GET = withAuthAndParams(async (request: NextRequest, params, _session) => {
  const id = params.id as string
  const prisma = await getTenantPrisma()

  const order = await prisma.inboundOrder.findUnique({
    where: { id },
    include: { containers: true },
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
 * POST /api/inbound/[id]/containers
 * Add a new container to a inbound (Stage 3: Ocean)
 */
export const POST = withAuthAndParams(async (request: NextRequest, params, _session) => {
  const id = params.id as string
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
    container = await prisma.inboundOrderContainer.create({
      data: {
        inboundOrderId: id,
        containerNumber: result.data.containerNumber,
        containerSize: result.data.containerSize,
        sealNumber: result.data.sealNumber,
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return ApiResponses.conflict('A container with this number already exists for the inbound')
    }
    throw error
  }

  await auditLog({
    entityType: 'InboundOrder',
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
