import { NextRequest } from 'next/server'
import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import { OutboundOrderStatus } from '@targon/prisma-talos'
import {
  transitionOutboundOrderStage,
  getValidNextOutboundStages,
  type OutboundUserContext,
} from '@/lib/services/outbound-order-service'
import { hasPermission } from '@/lib/services/permission-service'

const DateInputSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: 'Invalid date',
  })

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim().length === 0 ? undefined : value

const OptionalString = z.preprocess(emptyToUndefined, z.string().trim().optional())
const OptionalDateString = z.preprocess(emptyToUndefined, DateInputSchema.optional())

const StageTransitionSchema = z.object({
  targetStatus: z.enum(['DRAFT', 'SHIPPED', 'CANCELLED'] as const),
  stageData: z
    .object({
      shippedDate: OptionalDateString,
      deliveredDate: OptionalDateString,
      shippingCarrier: OptionalString,
      shippingMethod: OptionalString,
      trackingNumber: OptionalString,
    })
    .optional()
    .default({}),
})

/**
 * PATCH /api/outbound-orders/[id]/stage
 * Transition an outbound order to a new stage.
 */
export const PATCH = withAuthAndParams(async (request: NextRequest, params, session) => {
  const id =
    typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params?.id?.[0] : undefined

  if (!id) {
    return ApiResponses.badRequest('Outbound order ID is required')
  }

  const payload = await request.json().catch(() => null)
  const result = StageTransitionSchema.safeParse(payload)

  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path?.length ? issue.path.join('.') : 'payload'
    return ApiResponses.badRequest(
      issue?.message ? `Invalid ${path}: ${issue.message}` : 'Invalid stage transition payload'
    )
  }

  const canTransition = await hasPermission(session.user.id, 'outbound.stage')
  if (!canTransition) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const userContext: OutboundUserContext = {
    id: session.user.id,
    name: session.user.name || session.user.email || 'Unknown',
  }

  try {
    const order = await transitionOutboundOrderStage(
      id,
      result.data.targetStatus as OutboundOrderStatus,
      result.data.stageData,
      userContext
    )
    return ApiResponses.success({ data: order })
  } catch (error) {
    return ApiResponses.handleError(error)
  }
})

/**
 * GET /api/outbound-orders/[id]/stage
 * Get valid next stages for an outbound order.
 */
export const GET = withAuthAndParams(async (_request: NextRequest, params, _session) => {
  const id =
    typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params?.id?.[0] : undefined

  if (!id) {
    return ApiResponses.badRequest('Outbound order ID is required')
  }

  const { getTenantPrisma } = await import('@/lib/tenant/server')
  const prisma = await getTenantPrisma()

  const order = await prisma.outboundOrder.findUnique({
    where: { id },
    select: { status: true },
  })

  if (!order) {
    return ApiResponses.notFound('Outbound order not found')
  }

  const validNextStages = getValidNextOutboundStages(order.status as OutboundOrderStatus)

  return ApiResponses.success({
    currentStatus: order.status,
    validNextStages,
  })
})
