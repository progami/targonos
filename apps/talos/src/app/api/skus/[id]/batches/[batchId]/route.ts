import { withAuthAndParams, ApiResponses, requireRole, z } from '@/lib/api'
import { getTenantPrisma } from '@/lib/tenant/server'
import { FulfillmentOrderStatus, Prisma, PurchaseOrderStatus } from '@targon/prisma-talos'
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

type DimensionRefineShape = {
  unitSide1Cm: z.ZodTypeAny
  unitSide2Cm: z.ZodTypeAny
  unitSide3Cm: z.ZodTypeAny
  cartonSide1Cm: z.ZodTypeAny
  cartonSide2Cm: z.ZodTypeAny
  cartonSide3Cm: z.ZodTypeAny
}

const refineDimensions = <T extends z.ZodRawShape & DimensionRefineShape>(schema: z.ZodObject<T>) =>
  schema.superRefine((value, ctx) => {
    const unitValues = [value.unitSide1Cm, value.unitSide2Cm, value.unitSide3Cm]
    const unitAny = unitValues.some(part => part !== undefined && part !== null)
    const unitAll = unitValues.every(part => part !== undefined && part !== null)
    if (unitAny && !unitAll) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Item package dimensions require all three sides',
      })
    }

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

const updateSchema = refineDimensions(
  z.object({
    batchCode: z.string().trim().min(1).max(64).optional(),
    description: z.string().trim().max(200).optional().nullable(),
    productionDate: z.string().optional().nullable(),
    expiryDate: z.string().optional().nullable(),
    packSize: z.number().int().positive().optional().nullable(),
    unitsPerCarton: z.number().int().positive().optional().nullable(),
    material: z.string().trim().max(120).optional().nullable(),
    packagingType: packagingTypeSchema,
    amazonSizeTier: z.string().trim().max(80).optional().nullable(),
    amazonFbaFulfillmentFee: z.number().min(0).optional().nullable(),
    amazonReferenceWeightKg: z.number().positive().optional().nullable(),
    storageCartonsPerPallet: z.number().int().positive().optional(),
    shippingCartonsPerPallet: z.number().int().positive().optional(),
    unitDimensionsCm: z.string().trim().max(120).optional().nullable(),
    unitSide1Cm: optionalDimensionValueSchema,
    unitSide2Cm: optionalDimensionValueSchema,
    unitSide3Cm: optionalDimensionValueSchema,
    unitWeightKg: z.number().positive().optional(),
    cartonDimensionsCm: z.string().trim().max(120).optional().nullable(),
    cartonSide1Cm: optionalDimensionValueSchema,
    cartonSide2Cm: optionalDimensionValueSchema,
    cartonSide3Cm: optionalDimensionValueSchema,
    cartonWeightKg: z.number().positive().optional().nullable(),
  })
)

async function ensureBatch(skuId: string, batchId: string) {
  const prisma = await getTenantPrisma()
  return prisma.skuBatch.findFirst({
    where: {
      id: batchId,
      skuId,
    },
  })
}

export const PATCH = withAuthAndParams(async (request, params, session) => {
  if (!requireRole(session, ['admin', 'staff'])) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const prisma = await getTenantPrisma()
  const skuId = params.id as string
  const batchId = params.batchId as string
  const body = await request.json().catch(() => null)

  if (!body) {
    return ApiResponses.badRequest('Invalid JSON payload')
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const existing = await ensureBatch(skuId, batchId)
  if (!existing) {
    return ApiResponses.notFound('Batch not found')
  }

  const data: Prisma.SkuBatchUpdateInput = {}
  const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(parsed.data, key)

  if (parsed.data.batchCode) {
    const requestedCode = sanitizeForDisplay(parsed.data.batchCode.toUpperCase())
    const existingCode = existing.batchCode.toUpperCase()

    if (!requestedCode) {
      return ApiResponses.badRequest('Invalid batch code')
    }

    if (requestedCode === 'DEFAULT') {
      return ApiResponses.badRequest('Batch code DEFAULT is not allowed')
    }

    if (requestedCode !== existingCode) {
      data.batchCode = requestedCode
    }
  }

  if (parsed.data.description !== undefined) {
    data.description = parsed.data.description ? sanitizeForDisplay(parsed.data.description) : null
  }

  if (parsed.data.productionDate !== undefined) {
    if (parsed.data.productionDate === null) {
      data.productionDate = null
    } else {
      const production = new Date(parsed.data.productionDate)
      if (Number.isNaN(production.getTime())) {
        return ApiResponses.validationError({ productionDate: 'Invalid production date' })
      }
      data.productionDate = production
    }
  }

  if (parsed.data.expiryDate !== undefined) {
    if (parsed.data.expiryDate === null) {
      data.expiryDate = null
    } else {
      const expiry = new Date(parsed.data.expiryDate)
      if (Number.isNaN(expiry.getTime())) {
        return ApiResponses.validationError({ expiryDate: 'Invalid expiry date' })
      }
      data.expiryDate = expiry
    }
  }

  if (parsed.data.packSize !== undefined) {
    data.packSize = parsed.data.packSize === null ? null : parsed.data.packSize
  }

  if (parsed.data.unitsPerCarton !== undefined) {
    data.unitsPerCarton = parsed.data.unitsPerCarton === null ? null : parsed.data.unitsPerCarton
  }

  if (parsed.data.material !== undefined) {
    data.material = parsed.data.material ? sanitizeForDisplay(parsed.data.material) : null
  }

  if (parsed.data.packagingType !== undefined) {
    data.packagingType = parsed.data.packagingType ?? null
  }

  if (parsed.data.amazonSizeTier !== undefined) {
    data.amazonSizeTier = parsed.data.amazonSizeTier
      ? sanitizeForDisplay(parsed.data.amazonSizeTier)
      : null
  }

  if (parsed.data.amazonFbaFulfillmentFee !== undefined) {
    data.amazonFbaFulfillmentFee = parsed.data.amazonFbaFulfillmentFee ?? null
  }

  if (parsed.data.amazonReferenceWeightKg !== undefined) {
    data.amazonReferenceWeightKg = parsed.data.amazonReferenceWeightKg ?? null
  }

  if (parsed.data.unitWeightKg !== undefined) {
    data.unitWeightKg = parsed.data.unitWeightKg
  }

  if (parsed.data.cartonWeightKg !== undefined) {
    data.cartonWeightKg = parsed.data.cartonWeightKg ?? null
  }

  if (parsed.data.storageCartonsPerPallet !== undefined) {
    data.storageCartonsPerPallet = parsed.data.storageCartonsPerPallet
  }

  if (parsed.data.shippingCartonsPerPallet !== undefined) {
    data.shippingCartonsPerPallet = parsed.data.shippingCartonsPerPallet
  }

  const unitTouched =
    hasOwn('unitDimensionsCm') ||
    hasOwn('unitSide1Cm') ||
    hasOwn('unitSide2Cm') ||
    hasOwn('unitSide3Cm')
  if (unitTouched) {
    const unitTriplet = resolveDimensionTripletCm({
      side1Cm: parsed.data.unitSide1Cm,
      side2Cm: parsed.data.unitSide2Cm,
      side3Cm: parsed.data.unitSide3Cm,
      legacy: parsed.data.unitDimensionsCm,
    })

    const unitInputProvided =
      Boolean(parsed.data.unitDimensionsCm) ||
      [parsed.data.unitSide1Cm, parsed.data.unitSide2Cm, parsed.data.unitSide3Cm].some(
        value => value !== undefined && value !== null
      )

    if (unitInputProvided && !unitTriplet) {
      return ApiResponses.badRequest('Item package dimensions must be a valid LxWxH triple')
    }

    data.unitDimensionsCm = unitTriplet ? formatDimensionTripletCm(unitTriplet) : null
    data.unitSide1Cm = unitTriplet ? unitTriplet.side1Cm : null
    data.unitSide2Cm = unitTriplet ? unitTriplet.side2Cm : null
    data.unitSide3Cm = unitTriplet ? unitTriplet.side3Cm : null
  }

  const cartonTouched =
    hasOwn('cartonDimensionsCm') ||
    hasOwn('cartonSide1Cm') ||
    hasOwn('cartonSide2Cm') ||
    hasOwn('cartonSide3Cm')
  if (cartonTouched) {
    const cartonTriplet = resolveDimensionTripletCm({
      side1Cm: parsed.data.cartonSide1Cm,
      side2Cm: parsed.data.cartonSide2Cm,
      side3Cm: parsed.data.cartonSide3Cm,
      legacy: parsed.data.cartonDimensionsCm,
    })

    const cartonInputProvided =
      Boolean(parsed.data.cartonDimensionsCm) ||
      [parsed.data.cartonSide1Cm, parsed.data.cartonSide2Cm, parsed.data.cartonSide3Cm].some(
        value => value !== undefined && value !== null
      )

    if (cartonInputProvided && !cartonTriplet) {
      return ApiResponses.badRequest('Carton dimensions must be a valid LxWxH triple')
    }

    data.cartonDimensionsCm = cartonTriplet ? formatDimensionTripletCm(cartonTriplet) : null
    data.cartonSide1Cm = cartonTriplet ? cartonTriplet.side1Cm : null
    data.cartonSide2Cm = cartonTriplet ? cartonTriplet.side2Cm : null
    data.cartonSide3Cm = cartonTriplet ? cartonTriplet.side3Cm : null
  }

  try {
    const updated = await prisma.skuBatch.update({
      where: { id: batchId },
      data,
    })

    return ApiResponses.success({ batch: updated })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return ApiResponses.conflict('A batch with this code already exists for the SKU')
    }

    throw error
  }
})

export const DELETE = withAuthAndParams(async (_request, params, session) => {
  if (!requireRole(session, ['admin', 'staff'])) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const prisma = await getTenantPrisma()
  const skuId = params.id as string
  const batchId = params.batchId as string

  const existing = await ensureBatch(skuId, batchId)
  if (!existing) {
    return ApiResponses.notFound('Batch not found')
  }

  const sku = await prisma.sku.findUnique({
    where: { id: skuId },
    select: { skuCode: true },
  })

  if (!sku) {
    return ApiResponses.notFound('SKU not found')
  }

  const remaining = await prisma.skuBatch.count({
    where: { skuId, id: { not: batchId } },
  })

  if (remaining === 0) {
    return ApiResponses.badRequest('Cannot delete the last batch')
  }

  const skuCodeFilter = { equals: sku.skuCode, mode: 'insensitive' as const }
  const batchLotFilter = { equals: existing.batchCode, mode: 'insensitive' as const }

  const [
    inventoryTransactionCount,
    storageLedgerCount,
    purchaseOrderLineCount,
    movementNoteLineCount,
    fulfillmentOrderLineCount,
  ] = await Promise.all([
    prisma.inventoryTransaction.count({
      where: { skuCode: skuCodeFilter, batchLot: batchLotFilter },
    }),
    prisma.storageLedger.count({
      where: { skuCode: skuCodeFilter, batchLot: batchLotFilter },
    }),
    prisma.purchaseOrderLine.count({
      where: {
        skuCode: skuCodeFilter,
        batchLot: batchLotFilter,
        purchaseOrder: {
          status: { not: PurchaseOrderStatus.CANCELLED },
        },
      },
    }),
    prisma.movementNoteLine.count({
      where: { skuCode: skuCodeFilter, batchLot: batchLotFilter },
    }),
    prisma.fulfillmentOrderLine.count({
      where: {
        skuCode: skuCodeFilter,
        batchLot: batchLotFilter,
        fulfillmentOrder: {
          status: { not: FulfillmentOrderStatus.CANCELLED },
        },
      },
    }),
  ])

  const blockers: string[] = []
  if (purchaseOrderLineCount > 0) blockers.push('purchase orders')
  if (movementNoteLineCount > 0) blockers.push('goods receipts')
  if (fulfillmentOrderLineCount > 0) blockers.push('fulfillment orders')
  if (inventoryTransactionCount > 0) blockers.push('inventory transactions')
  if (storageLedgerCount > 0) blockers.push('storage ledger')

  if (blockers.length > 0) {
    return ApiResponses.badRequest(
      `Cannot delete batch because it is referenced by ${blockers.join(', ')}.`
    )
  }

  await prisma.skuBatch.delete({ where: { id: batchId } })

  return ApiResponses.success({ message: 'Batch deleted' })
})
