import { withAuthAndParams, ApiResponses, requireRole, z } from '@/lib/api'
import { getTenantPrisma } from '@/lib/tenant/server'
import { Prisma } from '@targon/prisma-talos'
import { sanitizeForDisplay } from '@/lib/security/input-sanitization'
import { formatDimensionTripletCm, resolveDimensionTripletCm } from '@/lib/sku-dimensions'

const optionalDimensionValueSchema = z.number().positive().nullable().optional()

const packagingTypeSchema = z.preprocess(
  value => {
    if (value === undefined) return undefined
    if (value === null) return null
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    if (!trimmed) return null
    const normalized = trimmed.toUpperCase().replace(/[^A-Z]/g, '')
    if (normalized === 'BOX') return 'BOX'
    if (normalized === 'POLYBAG') return 'POLYBAG'
    return trimmed
  },
  z.enum(['BOX', 'POLYBAG']).nullable().optional()
)

type CartonDimensionRefineShape = {
  cartonSide1Cm: z.ZodTypeAny
  cartonSide2Cm: z.ZodTypeAny
  cartonSide3Cm: z.ZodTypeAny
}

const refineCartonDimensions = <T extends z.ZodRawShape & CartonDimensionRefineShape>(
  schema: z.ZodObject<T>
) =>
  schema.superRefine((value, ctx) => {
    const cartonValues = [value.cartonSide1Cm, value.cartonSide2Cm, value.cartonSide3Cm]
    const cartonAny = cartonValues.some(part => part !== undefined && part !== null)
    const cartonAll = cartonValues.every(part => part !== undefined && part !== null)
    if (cartonAny && !cartonAll) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Carton dimensions require all three sides',
      })
    }
  })

const createBatchSchema = refineCartonDimensions(
  z.object({
    batchCode: z.string().trim().min(1).max(64),
    description: z.string().trim().max(200).optional().nullable(),
    productionDate: z.string().optional().nullable(),
    expiryDate: z.string().optional().nullable(),
    packSize: z.number().int().positive(),
    unitsPerCarton: z.number().int().positive(),
    material: z.string().trim().max(120).optional().nullable(),
    packagingType: packagingTypeSchema,
    amazonSizeTier: z.string().trim().max(80).optional().nullable(),
    amazonFbaFulfillmentFee: z.number().min(0).optional().nullable(),
    amazonReferenceWeightKg: z.number().positive().optional().nullable(),
    storageCartonsPerPallet: z.number().int().positive(),
    shippingCartonsPerPallet: z.number().int().positive(),
    cartonDimensionsCm: z.string().trim().max(120).optional().nullable(),
    cartonSide1Cm: optionalDimensionValueSchema,
    cartonSide2Cm: optionalDimensionValueSchema,
    cartonSide3Cm: optionalDimensionValueSchema,
    cartonWeightKg: z.number().positive().optional().nullable(),
  })
)

export const GET = withAuthAndParams(async (_request, params, session) => {
  if (!requireRole(session, ['admin', 'staff'])) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const prisma = await getTenantPrisma()
  const skuId = params.id as string

  const sku = await prisma.sku.findUnique({
    where: { id: skuId },
    select: {
      id: true,
      skuCode: true,
    },
  })

  if (!sku) {
    return ApiResponses.notFound('SKU not found')
  }

  const batches = await prisma.skuBatch.findMany({
    where: { skuId },
    orderBy: { createdAt: 'desc' },
  })

  return ApiResponses.success({ batches })
})

export const POST = withAuthAndParams(async (request, params, session) => {
  if (!requireRole(session, ['admin', 'staff'])) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const prisma = await getTenantPrisma()
  const skuId = params.id as string
  const body = await request.json().catch(() => null)

  if (!body) {
    return ApiResponses.badRequest('Invalid JSON payload')
  }

  const parsed = createBatchSchema.safeParse(body)
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const sku = await prisma.sku.findUnique({
    where: { id: skuId },
    select: { id: true, unitWeightKg: true },
  })

  if (!sku) {
    return ApiResponses.notFound('SKU not found')
  }

  const payload = parsed.data

  const normalizedCode = sanitizeForDisplay(payload.batchCode.toUpperCase())
  if (!normalizedCode) {
    return ApiResponses.badRequest('Invalid batch code')
  }
  if (normalizedCode === 'DEFAULT') {
    return ApiResponses.badRequest('Batch code DEFAULT is not allowed')
  }
  const productionDate = payload.productionDate ? new Date(payload.productionDate) : null
  const expiryDate = payload.expiryDate ? new Date(payload.expiryDate) : null

  if (productionDate && Number.isNaN(productionDate.getTime())) {
    return ApiResponses.validationError({ productionDate: 'Invalid production date' })
  }

  if (expiryDate && Number.isNaN(expiryDate.getTime())) {
    return ApiResponses.validationError({ expiryDate: 'Invalid expiry date' })
  }

  const cartonTriplet = resolveDimensionTripletCm({
    side1Cm: payload.cartonSide1Cm,
    side2Cm: payload.cartonSide2Cm,
    side3Cm: payload.cartonSide3Cm,
    legacy: payload.cartonDimensionsCm,
  })

  const cartonInputProvided =
    payload.cartonDimensionsCm ||
    payload.cartonSide1Cm ||
    payload.cartonSide2Cm ||
    payload.cartonSide3Cm

  if (cartonInputProvided && !cartonTriplet) {
    return ApiResponses.badRequest('Carton dimensions must be a valid LxWxH triple')
  }

  // Use SKU's unitWeightKg for amazonReferenceWeightKg if not provided
  const skuWeightKg = sku.unitWeightKg ? Number(sku.unitWeightKg) : null

  try {
    const batch = await prisma.skuBatch.create({
      data: {
        sku: { connect: { id: skuId } },
        batchCode: normalizedCode,
        description: payload.description ? sanitizeForDisplay(payload.description) : null,
        productionDate,
        expiryDate,
        packSize: payload.packSize,
        unitsPerCarton: payload.unitsPerCarton,
        material: payload.material ? sanitizeForDisplay(payload.material) : null,
        cartonDimensionsCm: cartonTriplet ? formatDimensionTripletCm(cartonTriplet) : null,
        cartonSide1Cm: cartonTriplet ? cartonTriplet.side1Cm : null,
        cartonSide2Cm: cartonTriplet ? cartonTriplet.side2Cm : null,
        cartonSide3Cm: cartonTriplet ? cartonTriplet.side3Cm : null,
        cartonWeightKg: payload.cartonWeightKg ?? null,
        packagingType: payload.packagingType ?? null,
        amazonSizeTier: payload.amazonSizeTier ? sanitizeForDisplay(payload.amazonSizeTier) : null,
        amazonFbaFulfillmentFee: payload.amazonFbaFulfillmentFee ?? null,
        amazonReferenceWeightKg: payload.amazonReferenceWeightKg ?? skuWeightKg,
        storageCartonsPerPallet: payload.storageCartonsPerPallet,
        shippingCartonsPerPallet: payload.shippingCartonsPerPallet,
        isActive: true,
      },
    })

    return ApiResponses.created({ batch })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return ApiResponses.conflict('A batch with this code already exists for the SKU')
    }

    throw error
  }
})
