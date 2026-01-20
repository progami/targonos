import { withAuth, withRole, ApiResponses, z } from '@/lib/api'
import { getTenantPrisma } from '@/lib/tenant/server'
import { Prisma, type Sku, type SkuBatch } from '@targon/prisma-talos'
import {
  sanitizeForDisplay,
  sanitizeSearchQuery,
  escapeRegex,
} from '@/lib/security/input-sanitization'
import { formatDimensionTripletCm, resolveDimensionTripletCm } from '@/lib/sku-dimensions'
import { SHIPMENT_PLANNING_CONFIG } from '@/lib/config/shipment-planning'
import { SKU_FIELD_LIMITS } from '@/lib/sku-constants'
export const dynamic = 'force-dynamic'

type SkuWithCounts = Sku & { batches: SkuBatch[]; _count: { inventoryTransactions: number } }

const DEFAULT_CARTONS_PER_PALLET = SHIPMENT_PLANNING_CONFIG.DEFAULT_CARTONS_PER_PALLET

// Validation schemas with sanitization
const supplierIdSchema = z.preprocess(value => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  return value
}, z.string().uuid().nullable().optional())

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

const skuSchemaBase = z.object({
  skuCode: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform(val => sanitizeForDisplay(val)),
  asin: z
    .string()
    .trim()
    .max(64)
    .optional()
    .nullable()
    .transform(val => {
      if (val === undefined) return undefined
      if (val === null) return null
      const sanitized = sanitizeForDisplay(val)
      return sanitized ? sanitized : null
    }),
  description: z
    .string()
    .trim()
    .min(1)
    .max(SKU_FIELD_LIMITS.DESCRIPTION_MAX)
    .transform(val => sanitizeForDisplay(val)),
  category: z
    .string()
    .trim()
    .max(255)
    .optional()
    .nullable()
    .transform(val => {
      if (val === undefined) return undefined
      if (val === null) return null
      const sanitized = sanitizeForDisplay(val)
      return sanitized ? sanitized : null
    }),
  subcategory: z
    .string()
    .trim()
    .max(255)
    .optional()
    .nullable()
    .transform(val => {
      if (val === undefined) return undefined
      if (val === null) return null
      const sanitized = sanitizeForDisplay(val)
      return sanitized ? sanitized : null
    }),
  sizeTier: z
    .string()
    .trim()
    .max(100)
    .optional()
    .nullable()
    .transform(val => {
      if (val === undefined) return undefined
      if (val === null) return null
      const sanitized = sanitizeForDisplay(val)
      return sanitized ? sanitized : null
    }),
  referralFeePercent: z.number().min(0).max(100).optional().nullable(),
  fbaFulfillmentFee: z.number().min(0).optional().nullable(),
  amazonCategory: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform(val => {
      if (val === undefined) return undefined
      if (val === null) return null
      const sanitized = sanitizeForDisplay(val)
      return sanitized ? sanitized : null
    }),
  amazonSizeTier: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform(val => {
      if (val === undefined) return undefined
      if (val === null) return null
      const sanitized = sanitizeForDisplay(val)
      return sanitized ? sanitized : null
    }),
  amazonReferralFeePercent: z.number().min(0).max(100).optional().nullable(),
  amazonFbaFulfillmentFee: z.number().min(0).optional().nullable(),
  amazonReferenceWeightKg: z.number().positive().optional().nullable(),
  packSize: z.number().int().positive().optional().nullable(),
  defaultSupplierId: supplierIdSchema,
  secondarySupplierId: supplierIdSchema,
  material: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform(val => {
      if (val === undefined) return undefined
      if (val === null) return null
      const sanitized = sanitizeForDisplay(val)
      return sanitized ? sanitized : null
    }),
  unitDimensionsCm: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform(val => {
      if (val === undefined) return undefined
      if (val === null) return null
      const sanitized = sanitizeForDisplay(val)
      return sanitized ? sanitized : null
    }),
  unitSide1Cm: optionalDimensionValueSchema,
  unitSide2Cm: optionalDimensionValueSchema,
  unitSide3Cm: optionalDimensionValueSchema,
  unitWeightKg: z.number().positive().optional().nullable(),
  itemDimensionsCm: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform(val => {
      if (val === undefined) return undefined
      if (val === null) return null
      const sanitized = sanitizeForDisplay(val)
      return sanitized ? sanitized : null
    }),
  itemSide1Cm: optionalDimensionValueSchema,
  itemSide2Cm: optionalDimensionValueSchema,
  itemSide3Cm: optionalDimensionValueSchema,
  itemWeightKg: z.number().positive().optional().nullable(),
  unitsPerCarton: z.number().int().positive().optional(),
  cartonDimensionsCm: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform(val => {
      if (val === undefined) return undefined
      if (val === null) return null
      const sanitized = sanitizeForDisplay(val)
      return sanitized ? sanitized : null
    }),
  cartonSide1Cm: optionalDimensionValueSchema,
  cartonSide2Cm: optionalDimensionValueSchema,
  cartonSide3Cm: optionalDimensionValueSchema,
  cartonWeightKg: z.number().positive().optional().nullable(),
  packagingType: packagingTypeSchema,
})

type DimensionRefineShape = {
  unitSide1Cm: z.ZodTypeAny
  unitSide2Cm: z.ZodTypeAny
  unitSide3Cm: z.ZodTypeAny
  itemSide1Cm: z.ZodTypeAny
  itemSide2Cm: z.ZodTypeAny
  itemSide3Cm: z.ZodTypeAny
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

    const itemValues = [value.itemSide1Cm, value.itemSide2Cm, value.itemSide3Cm]
    const itemAny = itemValues.some(part => part !== undefined && part !== null)
    const itemAll = itemValues.every(part => part !== undefined && part !== null)
    if (itemAny && !itemAll) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Item dimensions require all three sides',
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

const createSkuSchema = refineDimensions(
  skuSchemaBase.extend({
    initialBatch: z.object({
      batchCode: z.string().trim().min(1).max(64),
      description: z
        .string()
        .trim()
        .max(200)
        .optional()
        .nullable()
        .transform(val => {
          if (val === undefined) return undefined
          if (val === null) return null
          const sanitized = sanitizeForDisplay(val)
          return sanitized ? sanitized : null
        }),
      packSize: z.number().int().positive().default(1),
      unitsPerCarton: z.number().int().positive().default(1),
      material: z
        .string()
        .trim()
        .max(120)
        .optional()
        .nullable()
        .transform(val => {
          if (val === undefined) return undefined
          if (val === null) return null
          const sanitized = sanitizeForDisplay(val)
          return sanitized ? sanitized : null
        }),
      unitWeightKg: z.number().positive(),
      packagingType: packagingTypeSchema,
      storageCartonsPerPallet: z.number().int().positive().default(DEFAULT_CARTONS_PER_PALLET),
      shippingCartonsPerPallet: z.number().int().positive().default(DEFAULT_CARTONS_PER_PALLET),
    }),
  })
)

const updateSkuSchema = refineDimensions(skuSchemaBase.partial())

// GET /api/skus - List SKUs
export const GET = withAuth(async (request, _session) => {
  const prisma = await getTenantPrisma()
  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('search')
    ? sanitizeSearchQuery(searchParams.get('search')!)
    : null

  const where: Prisma.SkuWhereInput = {}

  if (search) {
    const escapedSearch = escapeRegex(search)
    where.OR = [
      { skuCode: { contains: escapedSearch, mode: 'insensitive' } },
      { description: { contains: escapedSearch, mode: 'insensitive' } },
      { asin: { contains: escapedSearch, mode: 'insensitive' } },
    ]
  }

  const skus = await prisma.sku.findMany({
    where,
    orderBy: { skuCode: 'asc' },
    include: {
      batches: {
        orderBy: [{ createdAt: 'desc' }],
        take: 1,
      },
    },
  })

  // Get transaction counts for all SKUs in a single query
  const transactionCounts = await prisma.inventoryTransaction.groupBy({
    by: ['skuCode'],
    _count: {
      id: true,
    },
    where: {
      skuCode: {
        in: skus.map(sku => sku.skuCode),
      },
    },
  })

  const countMap = new Map(transactionCounts.map(tc => [tc.skuCode, tc._count.id]))

  const skusWithCounts: SkuWithCounts[] = skus.map(sku => ({
    ...sku,
    _count: {
      inventoryTransactions: countMap.get(sku.skuCode) || 0,
    },
  }))

  return ApiResponses.success(skusWithCounts)
})

// POST /api/skus - Create new SKU
export const POST = withRole(['admin', 'staff'], async (request, _session) => {
  const prisma = await getTenantPrisma()
  const body = await request.json()
  const validatedData = createSkuSchema.parse(body)

  if (
    validatedData.defaultSupplierId &&
    validatedData.secondarySupplierId &&
    validatedData.defaultSupplierId === validatedData.secondarySupplierId
  ) {
    return ApiResponses.badRequest('Default and secondary supplier must be different')
  }

  const supplierIds = [
    validatedData.defaultSupplierId ?? undefined,
    validatedData.secondarySupplierId ?? undefined,
  ].filter((id): id is string => Boolean(id))

  if (supplierIds.length > 0) {
    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true },
    })

    const foundIds = new Set(suppliers.map(s => s.id))
    const missing = supplierIds.filter(id => !foundIds.has(id))
    if (missing.length > 0) {
      return ApiResponses.badRequest('Supplier not found')
    }
  }

  // Check if SKU code already exists
  const existingSku = await prisma.sku.findUnique({
    where: { skuCode: validatedData.skuCode },
  })

  if (existingSku) {
    return ApiResponses.badRequest('SKU code already exists')
  }

  const initialBatchCode = sanitizeForDisplay(validatedData.initialBatch.batchCode.toUpperCase())
  if (!initialBatchCode) {
    return ApiResponses.badRequest('Invalid batch code')
  }
  if (initialBatchCode === 'DEFAULT') {
    return ApiResponses.badRequest('Batch code DEFAULT is not allowed')
  }

  const itemTriplet = resolveDimensionTripletCm({
    side1Cm: validatedData.itemSide1Cm,
    side2Cm: validatedData.itemSide2Cm,
    side3Cm: validatedData.itemSide3Cm,
    legacy: validatedData.itemDimensionsCm,
  })
  const itemInputProvided =
    Boolean(validatedData.itemDimensionsCm) ||
    [validatedData.itemSide1Cm, validatedData.itemSide2Cm, validatedData.itemSide3Cm].some(
      value => value !== undefined && value !== null
    )
  if (itemInputProvided && !itemTriplet) {
    return ApiResponses.badRequest('Item dimensions must be a valid LxWxH triple')
  }

  const sku = await prisma.$transaction(async tx => {
    const created = await tx.sku.create({
      data: {
        skuCode: validatedData.skuCode,
        asin: validatedData.asin ?? null,
        category: validatedData.category ?? null,
        subcategory: validatedData.subcategory ?? null,
        sizeTier: validatedData.sizeTier ?? null,
        referralFeePercent: validatedData.referralFeePercent ?? null,
        fbaFulfillmentFee: validatedData.fbaFulfillmentFee ?? null,
        amazonCategory: validatedData.amazonCategory ?? null,
        amazonSizeTier: validatedData.amazonSizeTier ?? null,
        amazonReferralFeePercent: validatedData.amazonReferralFeePercent ?? null,
        amazonFbaFulfillmentFee: validatedData.amazonFbaFulfillmentFee ?? null,
        amazonReferenceWeightKg:
          validatedData.amazonReferenceWeightKg === undefined
            ? validatedData.initialBatch.unitWeightKg
            : validatedData.amazonReferenceWeightKg,
        description: validatedData.description,
        packSize: validatedData.initialBatch.packSize,
        defaultSupplierId: validatedData.defaultSupplierId ?? null,
        secondarySupplierId: validatedData.secondarySupplierId ?? null,
        material: validatedData.initialBatch.material ?? null,
        unitDimensionsCm: null,
        unitSide1Cm: null,
        unitSide2Cm: null,
        unitSide3Cm: null,
        unitWeightKg: validatedData.initialBatch.unitWeightKg,
        itemDimensionsCm: itemTriplet ? formatDimensionTripletCm(itemTriplet) : null,
        itemSide1Cm: itemTriplet ? itemTriplet.side1Cm : null,
        itemSide2Cm: itemTriplet ? itemTriplet.side2Cm : null,
        itemSide3Cm: itemTriplet ? itemTriplet.side3Cm : null,
        itemWeightKg: validatedData.itemWeightKg ?? null,
        unitsPerCarton: validatedData.initialBatch.unitsPerCarton,
        cartonDimensionsCm: null,
        cartonSide1Cm: null,
        cartonSide2Cm: null,
        cartonSide3Cm: null,
        cartonWeightKg: null,
        packagingType: validatedData.initialBatch.packagingType ?? null,
        isActive: true,
      },
    })

    await tx.skuBatch.create({
      data: {
        sku: { connect: { id: created.id } },
        batchCode: initialBatchCode,
        description: validatedData.initialBatch.description ?? null,
        packSize: validatedData.initialBatch.packSize,
        unitsPerCarton: validatedData.initialBatch.unitsPerCarton,
        material: validatedData.initialBatch.material ?? null,
        unitDimensionsCm: null,
        unitSide1Cm: null,
        unitSide2Cm: null,
        unitSide3Cm: null,
        unitWeightKg: validatedData.initialBatch.unitWeightKg,
        cartonDimensionsCm: null,
        cartonSide1Cm: null,
        cartonSide2Cm: null,
        cartonSide3Cm: null,
        cartonWeightKg: null,
        packagingType: validatedData.initialBatch.packagingType ?? null,
        amazonSizeTier: null,
        amazonFbaFulfillmentFee: null,
        amazonReferenceWeightKg: validatedData.initialBatch.unitWeightKg,
        storageCartonsPerPallet: validatedData.initialBatch.storageCartonsPerPallet,
        shippingCartonsPerPallet: validatedData.initialBatch.shippingCartonsPerPallet,
        isActive: true,
      },
    })

    return created
  })

  return ApiResponses.created<Sku>(sku)
})

// PATCH /api/skus - Update SKU
export const PATCH = withRole(['admin', 'staff'], async (request, _session) => {
  const prisma = await getTenantPrisma()
  const searchParams = request.nextUrl.searchParams
  const skuId = searchParams.get('id')

  if (!skuId) {
    return ApiResponses.badRequest('SKU ID is required')
  }

  const body = await request.json()
  const validatedData = updateSkuSchema.parse(body)

  if (
    validatedData.defaultSupplierId &&
    validatedData.secondarySupplierId &&
    validatedData.defaultSupplierId === validatedData.secondarySupplierId
  ) {
    return ApiResponses.badRequest('Default and secondary supplier must be different')
  }

  const supplierIds = [
    validatedData.defaultSupplierId ?? undefined,
    validatedData.secondarySupplierId ?? undefined,
  ].filter((id): id is string => Boolean(id))

  if (supplierIds.length > 0) {
    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true },
    })

    const foundIds = new Set(suppliers.map(s => s.id))
    const missing = supplierIds.filter(id => !foundIds.has(id))
    if (missing.length > 0) {
      return ApiResponses.badRequest('Supplier not found')
    }
  }

  // If updating code, check if it's already in use
  if (validatedData.skuCode) {
    const existingSku = await prisma.sku.findFirst({
      where: {
        skuCode: validatedData.skuCode,
        id: { not: skuId },
      },
    })

    if (existingSku) {
      return ApiResponses.badRequest('SKU code already in use')
    }
  }

  const existing = await prisma.sku.findUnique({
    where: { id: skuId },
    select: { id: true },
  })

  if (!existing) {
    return ApiResponses.notFound('SKU not found')
  }

  const {
    unitDimensionsCm,
    unitSide1Cm,
    unitSide2Cm,
    unitSide3Cm,
    itemDimensionsCm,
    itemSide1Cm,
    itemSide2Cm,
    itemSide3Cm,
    cartonDimensionsCm,
    cartonSide1Cm,
    cartonSide2Cm,
    cartonSide3Cm,
    ...rest
  } = validatedData

  const updateData: Prisma.SkuUpdateInput = rest

  const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(validatedData, key)

  const unitTouched =
    hasOwn('unitDimensionsCm') ||
    hasOwn('unitSide1Cm') ||
    hasOwn('unitSide2Cm') ||
    hasOwn('unitSide3Cm')
  if (unitTouched) {
    const unitTriplet = resolveDimensionTripletCm({
      side1Cm: unitSide1Cm,
      side2Cm: unitSide2Cm,
      side3Cm: unitSide3Cm,
      legacy: unitDimensionsCm,
    })
    const unitInputProvided =
      Boolean(unitDimensionsCm) ||
      [unitSide1Cm, unitSide2Cm, unitSide3Cm].some(value => value !== undefined && value !== null)
    if (unitInputProvided && !unitTriplet) {
      return ApiResponses.badRequest('Item package dimensions must be a valid LxWxH triple')
    }

    updateData.unitDimensionsCm = unitTriplet ? formatDimensionTripletCm(unitTriplet) : null
    updateData.unitSide1Cm = unitTriplet ? unitTriplet.side1Cm : null
    updateData.unitSide2Cm = unitTriplet ? unitTriplet.side2Cm : null
    updateData.unitSide3Cm = unitTriplet ? unitTriplet.side3Cm : null
  }

  const itemTouched =
    hasOwn('itemDimensionsCm') ||
    hasOwn('itemSide1Cm') ||
    hasOwn('itemSide2Cm') ||
    hasOwn('itemSide3Cm')
  if (itemTouched) {
    const itemTriplet = resolveDimensionTripletCm({
      side1Cm: itemSide1Cm,
      side2Cm: itemSide2Cm,
      side3Cm: itemSide3Cm,
      legacy: itemDimensionsCm,
    })
    const itemInputProvided =
      Boolean(itemDimensionsCm) ||
      [itemSide1Cm, itemSide2Cm, itemSide3Cm].some(value => value !== undefined && value !== null)
    if (itemInputProvided && !itemTriplet) {
      return ApiResponses.badRequest('Item dimensions must be a valid LxWxH triple')
    }

    updateData.itemDimensionsCm = itemTriplet ? formatDimensionTripletCm(itemTriplet) : null
    updateData.itemSide1Cm = itemTriplet ? itemTriplet.side1Cm : null
    updateData.itemSide2Cm = itemTriplet ? itemTriplet.side2Cm : null
    updateData.itemSide3Cm = itemTriplet ? itemTriplet.side3Cm : null
  }

  const cartonTouched =
    hasOwn('cartonDimensionsCm') ||
    hasOwn('cartonSide1Cm') ||
    hasOwn('cartonSide2Cm') ||
    hasOwn('cartonSide3Cm')
  if (cartonTouched) {
    const cartonTriplet = resolveDimensionTripletCm({
      side1Cm: cartonSide1Cm,
      side2Cm: cartonSide2Cm,
      side3Cm: cartonSide3Cm,
      legacy: cartonDimensionsCm,
    })
    const cartonInputProvided =
      Boolean(cartonDimensionsCm) ||
      [cartonSide1Cm, cartonSide2Cm, cartonSide3Cm].some(
        value => value !== undefined && value !== null
      )
    if (cartonInputProvided && !cartonTriplet) {
      return ApiResponses.badRequest('Carton dimensions must be a valid LxWxH triple')
    }

    updateData.cartonDimensionsCm = cartonTriplet ? formatDimensionTripletCm(cartonTriplet) : null
    updateData.cartonSide1Cm = cartonTriplet ? cartonTriplet.side1Cm : null
    updateData.cartonSide2Cm = cartonTriplet ? cartonTriplet.side2Cm : null
    updateData.cartonSide3Cm = cartonTriplet ? cartonTriplet.side3Cm : null
  }

  const updatedSku = await prisma.sku.update({
    where: { id: skuId },
    data: updateData,
  })

  return ApiResponses.success<Sku>(updatedSku)
})

// DELETE /api/skus - Delete SKU
export const DELETE = withRole(['admin'], async (request, _session) => {
  const prisma = await getTenantPrisma()
  const searchParams = request.nextUrl.searchParams
  const skuId = searchParams.get('id')

  if (!skuId) {
    return ApiResponses.badRequest('SKU ID is required')
  }

  // Check if SKU exists
  const sku = await prisma.sku.findUnique({
    where: { id: skuId },
  })

  if (!sku) {
    return ApiResponses.notFound('SKU not found')
  }

  // Check if SKU is used in any transactions
  const [transactionCount, storageLedgerCount] = await Promise.all([
    prisma.inventoryTransaction.count({
      where: { skuCode: sku.skuCode },
    }),
    prisma.storageLedger.count({
      where: { skuCode: sku.skuCode },
    }),
  ])

  if (transactionCount > 0 || storageLedgerCount > 0) {
    return ApiResponses.conflict(
      `Cannot delete SKU "${sku.skuCode}". References found: inventory transactions=${transactionCount}, storage ledger=${storageLedgerCount}.`
    )
  }

  await prisma.sku.delete({
    where: { id: skuId },
  })

  return ApiResponses.success<{ message: string }>({
    message: 'SKU deleted successfully',
  })
})
