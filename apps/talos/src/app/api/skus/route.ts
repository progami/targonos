import { withAuth, withRole, ApiResponses, z } from '@/lib/api'
import { getTenantPrisma } from '@/lib/tenant/server'
import { Prisma, type Sku } from '@targon/prisma-talos'
import {
  sanitizeForDisplay,
  sanitizeSearchQuery,
  escapeRegex,
} from '@/lib/security/input-sanitization'
import { formatDimensionTripletCm, resolveDimensionTripletCm } from '@/lib/sku-dimensions'
import { SKU_FIELD_LIMITS } from '@/lib/sku-constants'
export const dynamic = 'force-dynamic'

type SkuWithCounts = Sku & { _count: { inventoryTransactions: number } }

// Validation schemas with sanitization
const supplierIdSchema = z.preprocess(value => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  return value
}, z.string().uuid().nullable().optional())

const optionalDimensionValueSchema = z.number().positive().nullable().optional()

const skuSchemaBase = z.object({
  skuCode: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform(val => sanitizeForDisplay(val)),
  skuGroup: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable()
    .transform(val => {
      if (val === undefined) return undefined
      if (val === null) return null
      const sanitized = sanitizeForDisplay(val)
      if (!sanitized) return null
      const normalized = sanitized.toUpperCase().replace(/[^A-Z0-9]/g, '')
      return normalized.length > 0 ? normalized : null
    }),
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
  defaultSupplierId: supplierIdSchema,
  secondarySupplierId: supplierIdSchema,
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
  isActive: z.boolean().optional(),
})

type DimensionRefineShape = {
  unitSide1Cm: z.ZodTypeAny
  unitSide2Cm: z.ZodTypeAny
  unitSide3Cm: z.ZodTypeAny
  itemSide1Cm: z.ZodTypeAny
  itemSide2Cm: z.ZodTypeAny
  itemSide3Cm: z.ZodTypeAny
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
  })

const createSkuSchema = refineDimensions(
  skuSchemaBase.extend({
    unitWeightKg: z.number().positive(),
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

  const includeInactive = searchParams.get('includeInactive') === '1'

  const where: Prisma.SkuWhereInput = includeInactive ? {} : { isActive: true }

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
      inventoryTransactions: (() => {
        const count = countMap.get(sku.skuCode)
        return typeof count === 'number' ? count : 0
      })(),
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

  const unitTriplet = resolveDimensionTripletCm({
    side1Cm: validatedData.unitSide1Cm,
    side2Cm: validatedData.unitSide2Cm,
    side3Cm: validatedData.unitSide3Cm,
    legacy: validatedData.unitDimensionsCm,
  })
  const unitInputProvided =
    Boolean(validatedData.unitDimensionsCm) ||
    [validatedData.unitSide1Cm, validatedData.unitSide2Cm, validatedData.unitSide3Cm].some(
      value => value !== undefined && value !== null
    )
  if (unitInputProvided && !unitTriplet) {
    return ApiResponses.badRequest('Item package dimensions must be a valid LxWxH triple')
  }

  const sku = await prisma.$transaction(async tx => {
    const created = await tx.sku.create({
      data: {
        skuCode: validatedData.skuCode,
        skuGroup: validatedData.skuGroup ?? null,
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
        amazonReferenceWeightKg: validatedData.amazonReferenceWeightKg ?? null,
        description: validatedData.description,
        defaultSupplierId: validatedData.defaultSupplierId ?? null,
        secondarySupplierId: validatedData.secondarySupplierId ?? null,
        unitDimensionsCm: unitTriplet ? formatDimensionTripletCm(unitTriplet) : null,
        unitSide1Cm: unitTriplet ? unitTriplet.side1Cm : null,
        unitSide2Cm: unitTriplet ? unitTriplet.side2Cm : null,
        unitSide3Cm: unitTriplet ? unitTriplet.side3Cm : null,
        unitWeightKg: validatedData.unitWeightKg,
        itemDimensionsCm: itemTriplet ? formatDimensionTripletCm(itemTriplet) : null,
        itemSide1Cm: itemTriplet ? itemTriplet.side1Cm : null,
        itemSide2Cm: itemTriplet ? itemTriplet.side2Cm : null,
        itemSide3Cm: itemTriplet ? itemTriplet.side3Cm : null,
        itemWeightKg: validatedData.itemWeightKg ?? null,
        isActive: validatedData.isActive !== undefined ? validatedData.isActive : true,
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
