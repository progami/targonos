import { NextRequest } from 'next/server'
import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import { getTenantPrisma, getCurrentTenant } from '@/lib/tenant/server'
import { NotFoundError } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { auditLog } from '@/lib/security/audit-logger'
import { Prisma } from '@targon/prisma-talos'

const CreateLineSchema = z.object({
  skuCode: z.string().trim().min(1),
  skuDescription: z.string().optional(),
  batchLot: z.string().trim().min(1),
  unitsOrdered: z.number().int().positive(),
  unitsPerCarton: z.number().int().positive(),
  totalCost: z.number().min(0).optional(),
  currency: z.string().optional(),
  notes: z.string().optional(),
})

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof value === 'object') {
    const maybe = value as { toNumber?: () => number; toString?: () => string }
    if (typeof maybe.toNumber === 'function') {
      const parsed = maybe.toNumber()
      return Number.isFinite(parsed) ? parsed : null
    }
    if (typeof maybe.toString === 'function') {
      const parsed = Number(maybe.toString())
      return Number.isFinite(parsed) ? parsed : null
    }
  }
  return null
}

function computeCartonsOrdered(input: {
  skuCode: string
  unitsOrdered: number
  unitsPerCarton: number
}): number {
  const unitsOrdered = Number(input.unitsOrdered)
  const unitsPerCarton = Number(input.unitsPerCarton)

  if (!Number.isInteger(unitsOrdered) || unitsOrdered <= 0) {
    throw new Error(`Units ordered must be a positive integer for SKU ${input.skuCode}`)
  }

  if (!Number.isInteger(unitsPerCarton) || unitsPerCarton <= 0) {
    throw new Error(`Units per carton must be a positive integer for SKU ${input.skuCode}`)
  }

  return Math.ceil(unitsOrdered / unitsPerCarton)
}

/**
 * GET /api/purchase-orders/[id]/lines
 * Get all line items for a purchase order
 */
export const GET = withAuthAndParams(async (request: NextRequest, params, _session) => {
  const id = params.id as string
  const tenant = await getCurrentTenant()
  const prisma = await getTenantPrisma()

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { lines: true },
  })

  if (!order) {
    throw new NotFoundError(`Purchase Order not found: ${id}`)
  }

  return ApiResponses.success({
	    data: order.lines.map(line => ({
	      id: line.id,
	      skuCode: line.skuCode,
	      skuDescription: line.skuDescription,
	      batchLot: line.batchLot,
        cartonDimensionsCm: line.cartonDimensionsCm ?? null,
        cartonSide1Cm: toNumberOrNull(line.cartonSide1Cm),
        cartonSide2Cm: toNumberOrNull(line.cartonSide2Cm),
        cartonSide3Cm: toNumberOrNull(line.cartonSide3Cm),
        cartonWeightKg: toNumberOrNull(line.cartonWeightKg),
        packagingType: line.packagingType ? line.packagingType.trim().toUpperCase() : null,
        storageCartonsPerPallet: line.storageCartonsPerPallet ?? null,
        shippingCartonsPerPallet: line.shippingCartonsPerPallet ?? null,
	      unitsOrdered: line.unitsOrdered,
	      unitsPerCarton: line.unitsPerCarton,
	      quantity: line.quantity,
	      unitCost: line.unitCost ? Number(line.unitCost) : null,
	      totalCost: line.totalCost ? Number(line.totalCost) : null,
	      currency: line.currency || tenant.currency,
	      status: line.status,
	      postedQuantity: line.postedQuantity,
      quantityReceived: line.quantityReceived,
      lineNotes: line.lineNotes,
      createdAt: line.createdAt.toISOString(),
      updatedAt: line.updatedAt.toISOString(),
    })),
  })
})

/**
 * POST /api/purchase-orders/[id]/lines
 * Add a new line item to a DRAFT purchase order
 */
export const POST = withAuthAndParams(async (request: NextRequest, params, session) => {
  const id = params.id as string
  const prisma = await getTenantPrisma()
  const tenant = await getCurrentTenant()

  const canEdit = await hasPermission(session.user.id, 'po.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { id: true, status: true },
  })

  if (!order) {
    throw new NotFoundError(`Purchase Order not found: ${id}`)
  }

  if (order.status !== 'DRAFT') {
    return ApiResponses.badRequest('Can only add line items to orders in DRAFT status')
  }

  const payload = await request.json().catch(() => null)
  const result = CreateLineSchema.safeParse(payload)

  if (!result.success) {
    return ApiResponses.badRequest(
      `Invalid payload: ${result.error.errors.map(e => e.message).join(', ')}`
    )
  }

  const skuCode = result.data.skuCode.trim()
  const batchLot = result.data.batchLot.trim().toUpperCase()
  if (batchLot === 'DEFAULT') {
    return ApiResponses.badRequest('Batch is required')
  }

  const sku = await prisma.sku.findFirst({
    where: { skuCode },
    select: {
      id: true,
      skuCode: true,
      description: true,
      packSize: true,
      unitsPerCarton: true,
      material: true,
      unitDimensionsCm: true,
      unitSide1Cm: true,
      unitSide2Cm: true,
      unitSide3Cm: true,
      unitWeightKg: true,
      cartonDimensionsCm: true,
      cartonSide1Cm: true,
      cartonSide2Cm: true,
      cartonSide3Cm: true,
      cartonWeightKg: true,
      packagingType: true,
    },
  })

  if (!sku) {
    return ApiResponses.badRequest(`SKU ${skuCode} not found. Create the SKU first.`)
  }

  const existingBatch = await prisma.skuBatch.findFirst({
    where: {
      skuId: sku.id,
      batchCode: { equals: batchLot, mode: 'insensitive' },
    },
    select: {
      id: true,
      batchCode: true,
      cartonDimensionsCm: true,
      cartonSide1Cm: true,
      cartonSide2Cm: true,
      cartonSide3Cm: true,
      cartonWeightKg: true,
      packagingType: true,
      storageCartonsPerPallet: true,
      shippingCartonsPerPallet: true,
    },
  })

  if (!existingBatch) {
    return ApiResponses.badRequest(
      `Batch ${batchLot} not found for SKU ${sku.skuCode}. Create it in Products → Batches first.`
    )
  }

  let cartonsOrdered: number
  try {
    cartonsOrdered = computeCartonsOrdered({
      skuCode: sku.skuCode,
      unitsOrdered: result.data.unitsOrdered,
      unitsPerCarton: result.data.unitsPerCarton,
    })
  } catch (error) {
    return ApiResponses.badRequest(
      error instanceof Error ? error.message : 'Invalid units/carton inputs'
    )
  }

  let line
  try {
    line = await prisma.purchaseOrderLine.create({
      data: {
        purchaseOrder: { connect: { id: order.id } },
        skuCode: sku.skuCode,
        skuDescription: result.data.skuDescription ?? sku.description ?? '',
        batchLot: existingBatch.batchCode,
        cartonDimensionsCm: existingBatch.cartonDimensionsCm ?? sku.cartonDimensionsCm ?? null,
        cartonSide1Cm: existingBatch.cartonSide1Cm ?? sku.cartonSide1Cm ?? null,
        cartonSide2Cm: existingBatch.cartonSide2Cm ?? sku.cartonSide2Cm ?? null,
        cartonSide3Cm: existingBatch.cartonSide3Cm ?? sku.cartonSide3Cm ?? null,
        cartonWeightKg: existingBatch.cartonWeightKg ?? sku.cartonWeightKg ?? null,
        packagingType: existingBatch.packagingType ?? sku.packagingType ?? null,
        storageCartonsPerPallet: existingBatch.storageCartonsPerPallet ?? null,
        shippingCartonsPerPallet: existingBatch.shippingCartonsPerPallet ?? null,
        unitsOrdered: result.data.unitsOrdered,
        unitsPerCarton: result.data.unitsPerCarton,
        quantity: cartonsOrdered,
        totalCost:
          typeof result.data.totalCost === 'number' && Number.isFinite(result.data.totalCost)
            ? result.data.totalCost.toFixed(2)
            : undefined,
        unitCost:
          typeof result.data.totalCost === 'number' &&
          Number.isFinite(result.data.totalCost) &&
          result.data.unitsOrdered > 0
            ? (result.data.totalCost / result.data.unitsOrdered).toFixed(4)
            : undefined,
        currency: result.data.currency || tenant.currency,
        lineNotes: result.data.notes,
        status: 'PENDING',
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return ApiResponses.conflict(
        'A line with this SKU and batch already exists for the purchase order'
      )
    }
    throw error
  }

  await auditLog({
    entityType: 'PurchaseOrder',
    entityId: id,
    action: 'LINE_ADD',
    userId: session.user.id,
    oldValue: null,
    newValue: {
      lineId: line.id,
      skuCode: line.skuCode,
      skuDescription: line.skuDescription ?? null,
      batchLot: line.batchLot ?? null,
      cartonDimensionsCm: line.cartonDimensionsCm ?? null,
      cartonSide1Cm: toNumberOrNull(line.cartonSide1Cm),
      cartonSide2Cm: toNumberOrNull(line.cartonSide2Cm),
      cartonSide3Cm: toNumberOrNull(line.cartonSide3Cm),
      cartonWeightKg: toNumberOrNull(line.cartonWeightKg),
      packagingType: line.packagingType ?? null,
      storageCartonsPerPallet: line.storageCartonsPerPallet ?? null,
      shippingCartonsPerPallet: line.shippingCartonsPerPallet ?? null,
      unitsOrdered: line.unitsOrdered,
      unitsPerCarton: line.unitsPerCarton,
      quantity: line.quantity,
      unitCost: line.unitCost ? Number(line.unitCost) : null,
      currency: line.currency ?? null,
      totalCost: line.totalCost ? Number(line.totalCost) : null,
      notes: line.lineNotes ?? null,
    },
  })

  return ApiResponses.success({
    id: line.id,
    skuCode: line.skuCode,
    skuDescription: line.skuDescription,
    batchLot: line.batchLot,
    cartonDimensionsCm: line.cartonDimensionsCm ?? null,
    cartonSide1Cm: toNumberOrNull(line.cartonSide1Cm),
    cartonSide2Cm: toNumberOrNull(line.cartonSide2Cm),
    cartonSide3Cm: toNumberOrNull(line.cartonSide3Cm),
    cartonWeightKg: toNumberOrNull(line.cartonWeightKg),
    packagingType: line.packagingType ? line.packagingType.trim().toUpperCase() : null,
    storageCartonsPerPallet: line.storageCartonsPerPallet ?? null,
    shippingCartonsPerPallet: line.shippingCartonsPerPallet ?? null,
    unitsOrdered: line.unitsOrdered,
    unitsPerCarton: line.unitsPerCarton,
    quantity: line.quantity,
    unitCost: line.unitCost ? Number(line.unitCost) : null,
    totalCost: line.totalCost ? Number(line.totalCost) : null,
    currency: line.currency || tenant.currency,
    status: line.status,
    postedQuantity: line.postedQuantity,
    quantityReceived: line.quantityReceived,
    lineNotes: line.lineNotes,
    createdAt: line.createdAt.toISOString(),
    updatedAt: line.updatedAt.toISOString(),
  })
})
