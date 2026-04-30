import { NextRequest } from 'next/server'
import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import { InboundOrderStatus } from '@targon/prisma-talos'
import {
  transitionInboundOrderStage,
  serializeInboundOrder,
  getValidNextStages,
} from '@/lib/services/inbound-stage-service'
import { enforceCrossTenantManufacturingOnlyForInboundOrder } from '@/lib/services/inbound-cross-tenant-access'
import type { StageTransitionInput, UserContext } from '@/lib/services/inbound-stage-service'
import { getTenantPrisma } from '@/lib/tenant/server'
import { deriveSupplierCountry } from '@/lib/suppliers/derive-country'
import { normalizeInboundOrderWorkflowStatus } from '@/lib/inbound/workflow'

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

const OptionalNumber = z.preprocess((value) => {
  const cleaned = emptyToUndefined(value)
  if (cleaned === undefined || cleaned === null) return undefined
  if (typeof cleaned === 'string') {
    const parsed = Number(cleaned)
    return Number.isNaN(parsed) ? cleaned : parsed
  }
  return cleaned
}, z.number().optional())

const OptionalInboundReceiveType = z.preprocess(
  emptyToUndefined,
  z
    .enum(['CONTAINER_20', 'CONTAINER_40', 'CONTAINER_40_HQ', 'CONTAINER_40_HQ_LARGE', 'CONTAINER_45_HQ', 'LCL'] as const)
    .optional()
)

const OptionalInt = z.preprocess((value) => {
  const cleaned = emptyToUndefined(value)
  if (cleaned === undefined || cleaned === null) return undefined
  if (typeof cleaned === 'string') {
    const parsed = Number(cleaned)
    return Number.isNaN(parsed) ? cleaned : parsed
  }
  return cleaned
}, z.number().int().optional())

function normalizeWorkflowStatus(status: InboundOrderStatus): InboundOrderStatus {
  return normalizeInboundOrderWorkflowStatus(status) as InboundOrderStatus
}

const StageTransitionSchema = z.object({
  targetStatus: z.enum([
    'ISSUED',
    'MANUFACTURING',
    'OCEAN',
    'WAREHOUSE',
    'CANCELLED',
  ] as const),
  stageData: z
    .object({
      // ===========================================
      // Stage 2: Manufacturing
      // ===========================================
      proformaInvoiceNumber: OptionalString,
      proformaInvoiceDate: OptionalDateString,
      factoryName: OptionalString,
      manufacturingStartDate: OptionalDateString,
      expectedCompletionDate: OptionalDateString,
      actualCompletionDate: OptionalDateString,
      totalWeightKg: OptionalNumber,
      totalVolumeCbm: OptionalNumber,
      totalCartons: OptionalInt,
      totalPallets: OptionalInt,
      packagingNotes: OptionalString,
      splitAllocations: z
        .array(
          z.object({
            lineId: z.string().trim().min(1),
            shipNowCartons: OptionalInt,
          })
        )
        .optional(),

      // ===========================================
      // Stage 3: Ocean
      // ===========================================
      houseBillOfLading: OptionalString,
      masterBillOfLading: OptionalString,
      commercialInvoiceNumber: OptionalString,
      packingListRef: OptionalString,
      vesselName: OptionalString,
      voyageNumber: OptionalString,
      portOfLoading: OptionalString,
      portOfDischarge: OptionalString,
      estimatedDeparture: OptionalDateString,
      estimatedArrival: OptionalDateString,
      actualDeparture: OptionalDateString,
      actualArrival: OptionalDateString,

      // ===========================================
      // Stage 4: Warehouse (warehouse selected here)
      // ===========================================
      warehouseCode: OptionalString,
      warehouseName: OptionalString,
      receiveType: OptionalInboundReceiveType,
      customsEntryNumber: OptionalString,
      customsClearedDate: OptionalDateString,
      dutyAmount: OptionalNumber,
      dutyCurrency: OptionalString,
      surrenderBlDate: OptionalDateString,
      transactionCertNumber: OptionalString,
      receivedDate: OptionalDateString,
      discrepancyNotes: OptionalString,

      // ===========================================
      // Legacy fields (backward compatibility)
      // ===========================================
      proformaInvoiceId: OptionalString,
      proformaInvoiceData: z.any().optional(),
      manufacturingStart: OptionalDateString,
      manufacturingEnd: OptionalDateString,
      cargoDetails: z.any().optional(),
      commercialInvoiceId: OptionalString,
      warehouseInvoiceId: OptionalString,
      surrenderBL: OptionalString,
      transactionCertificate: OptionalString,
      customsDeclaration: OptionalString,
      proofOfDelivery: OptionalString,
    })
    .optional()
    .default({}),
})

/**
 * PATCH /api/inbound/[id]/stage
 * Transition a inbound to a new stage
 */
export const PATCH = withAuthAndParams(
  async (request: NextRequest, params, session) => {
    const id =
      typeof params?.id === 'string'
        ? params.id
        : Array.isArray(params?.id)
          ? params?.id?.[0]
          : undefined

    if (!id) {
      return ApiResponses.badRequest('Inbound ID is required')
    }

    const prisma = await getTenantPrisma()
    const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForInboundOrder({
      prisma,
      inboundOrderId: id,
    })
    if (crossTenantGuard) {
      return crossTenantGuard
    }

    const payload = await request.json().catch(() => null)
    const result = StageTransitionSchema.safeParse(payload)

    if (!result.success) {
      const issue = result.error.issues[0]
      const path = issue?.path?.length ? issue.path.join('.') : 'payload'
      return ApiResponses.badRequest(issue?.message ? `Invalid ${path}: ${issue.message}` : 'Invalid stage transition payload')
    }

    const userContext: UserContext = {
      id: session.user.id,
      name: session.user.name ?? session.user.email ?? 'Unknown',
      email: session.user.email ?? '',
    }

    try {
      const order = await transitionInboundOrderStage(
        id,
        result.data.targetStatus as InboundOrderStatus,
        result.data.stageData as StageTransitionInput,
        userContext
      )
      const supplier =
        order.counterpartyName && order.counterpartyName.trim().length > 0
          ? await prisma.supplier.findFirst({
              where: { name: { equals: order.counterpartyName.trim(), mode: 'insensitive' } },
              select: { phone: true, bankingDetails: true, address: true },
            })
          : null
      return ApiResponses.success({
        ...serializeInboundOrder(order),
        supplier: supplier
          ? {
              phone: supplier.phone ?? null,
              bankingDetails: supplier.bankingDetails ?? null,
              address: supplier.address ?? null,
              country: deriveSupplierCountry(supplier.address),
            }
          : null,
      })
    } catch (error) {
      return ApiResponses.handleError(error)
    }
  }
)

/**
 * GET /api/inbound/[id]/stage
 * Get valid next stages for a inbound
 */
export const GET = withAuthAndParams(
  async (_request: NextRequest, params, _session) => {
    const id =
      typeof params?.id === 'string'
        ? params.id
        : Array.isArray(params?.id)
          ? params?.id?.[0]
          : undefined

    if (!id) {
      return ApiResponses.badRequest('Inbound ID is required')
    }

    // Import prisma to get current status
    const { getTenantPrisma } = await import('@/lib/tenant/server')
    const prisma = await getTenantPrisma()

    const order = await prisma.inboundOrder.findUnique({
      where: { id },
      select: { status: true },
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

    const validNextStages = getValidNextStages(order.status as InboundOrderStatus)

    return ApiResponses.success({
      currentStatus: normalizeWorkflowStatus(order.status as InboundOrderStatus),
      validNextStages,
    })
  }
)
