import { NextRequest } from 'next/server'
import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import { getTenantPrisma, getCurrentTenant } from '@/lib/tenant/server'
import { NotFoundError } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { enforceCrossTenantManufacturingOnlyForPurchaseOrder } from '@/lib/services/purchase-order-cross-tenant-access'
import { auditLog } from '@/lib/security/audit-logger'
import { Prisma } from '@targon/prisma-talos'
import {
  buildLotReference,
  normalizeSkuGroup,
  resolveOrderReferenceSeed,
} from '@/lib/services/supply-chain-reference-service'

const CreateLineSchema = z.object({
  skuCode: z.string().trim().min(1),
  skuDescription: z.string().optional(),
  piNumber: z.string().trim().optional(),
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

function toMoneyNumberOrNull(value: unknown): number | null {
  const parsed = toNumberOrNull(value)
  if (parsed === null) return null
  return Number(Math.abs(parsed).toFixed(2))
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

  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForPurchaseOrder({
    prisma,
    purchaseOrderId: id,
    purchaseOrderStatus: order.status,
  })
  if (crossTenantGuard) {
    return crossTenantGuard
  }

  return ApiResponses.success({
    data: order.lines.map(line => ({
      id: line.id,
      skuCode: line.skuCode,
      skuDescription: line.skuDescription,
      lotRef: line.lotRef,
      piNumber: line.piNumber ?? null,
      commodityCode: line.commodityCode ?? null,
      countryOfOrigin: line.countryOfOrigin ?? null,
      netWeightKg: toNumberOrNull(line.netWeightKg),
      material: line.material ?? null,
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
      unitCost: toMoneyNumberOrNull(line.unitCost),
      totalCost: toMoneyNumberOrNull(line.totalCost),
      currency: line.currency ?? tenant.currency,
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
 * Add a new line item to an ISSUED purchase order
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
    select: {
      id: true,
      status: true,
      orderNumber: true,
      poNumber: true,
      skuGroup: true,
    },
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

  if (order.status === 'CANCELLED' || order.status === 'REJECTED') {
    return ApiResponses.badRequest('Cannot add line items to terminal orders')
  }

  const payload = await request.json().catch(() => null)
  const result = CreateLineSchema.safeParse(payload)

  if (!result.success) {
    return ApiResponses.badRequest(
      `Invalid payload: ${result.error.errors.map(e => e.message).join(', ')}`
    )
  }

  const skuCode = result.data.skuCode.trim()

  const sku = await prisma.sku.findFirst({
    where: { skuCode },
    select: {
      id: true,
      skuCode: true,
      skuGroup: true,
      description: true,
      isActive: true,
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

  if (!sku.isActive) {
    return ApiResponses.badRequest(
      `SKU ${sku.skuCode} is inactive. Reactivate it in Config → Products first.`
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
  const piNumber =
    typeof result.data.piNumber === 'string' && result.data.piNumber.trim().length > 0
      ? result.data.piNumber.trim().toUpperCase()
      : null

  const netWeightKg = (() => {
    const unitWeightKg = toNumberOrNull(sku.unitWeightKg)
    if (unitWeightKg === null) return null
    const computed = unitWeightKg * result.data.unitsPerCarton
    return Number.isFinite(computed) && computed > 0
      ? new Prisma.Decimal(computed.toFixed(3))
      : null
  })()

  const currency =
    typeof result.data.currency === 'string' && result.data.currency.trim().length > 0
      ? result.data.currency.trim().toUpperCase()
      : tenant.currency
  const normalizedTotalCost =
    typeof result.data.totalCost === 'number' && Number.isFinite(result.data.totalCost)
      ? Number(Math.abs(result.data.totalCost).toFixed(2))
      : null

  const effectiveSkuGroup =
    typeof order.skuGroup === 'string' && order.skuGroup.trim().length > 0
      ? normalizeSkuGroup(order.skuGroup)
      : typeof sku.skuGroup === 'string' && sku.skuGroup.trim().length > 0
        ? normalizeSkuGroup(sku.skuGroup)
        : null

  if (!effectiveSkuGroup) {
    return ApiResponses.badRequest(
      `SKU group is required for SKU ${sku.skuCode}. Set it in Config → Products before adding this line.`
    )
  }

  if (order.skuGroup !== effectiveSkuGroup) {
    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: { skuGroup: effectiveSkuGroup },
    })
  }

  const orderReferenceSeed = resolveOrderReferenceSeed({
    orderNumber: order.orderNumber,
    poNumber: order.poNumber,
    skuGroup: effectiveSkuGroup,
  })
  const lotRef = buildLotReference(orderReferenceSeed.sequence, orderReferenceSeed.skuGroup, sku.skuCode)

  try {
    line = await prisma.purchaseOrderLine.create({
      data: {
        purchaseOrder: { connect: { id: order.id } },
        skuCode: sku.skuCode,
        skuDescription: result.data.skuDescription ?? sku.description ?? '',
        lotRef,
        piNumber,
        netWeightKg,
        material: sku.material ?? null,
        cartonDimensionsCm: sku.cartonDimensionsCm ?? null,
        cartonSide1Cm: sku.cartonSide1Cm ?? null,
        cartonSide2Cm: sku.cartonSide2Cm ?? null,
        cartonSide3Cm: sku.cartonSide3Cm ?? null,
        cartonWeightKg: sku.cartonWeightKg ?? null,
        packagingType: sku.packagingType ?? null,
        unitsOrdered: result.data.unitsOrdered,
        unitsPerCarton: result.data.unitsPerCarton,
        quantity: cartonsOrdered,
        totalCost: normalizedTotalCost !== null ? normalizedTotalCost.toFixed(2) : undefined,
        unitCost:
          normalizedTotalCost !== null && result.data.unitsOrdered > 0
            ? (normalizedTotalCost / result.data.unitsOrdered).toFixed(2)
            : undefined,
        currency,
        lineNotes: result.data.notes,
        status: 'PENDING',
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return ApiResponses.conflict(
        'A line with this SKU already exists for the purchase order'
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
      lotRef: line.lotRef,
      piNumber: line.piNumber ?? null,
      commodityCode: line.commodityCode ?? null,
      countryOfOrigin: line.countryOfOrigin ?? null,
      netWeightKg: toNumberOrNull(line.netWeightKg),
      material: line.material ?? null,
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
      unitCost: toMoneyNumberOrNull(line.unitCost),
      currency: line.currency ?? null,
      totalCost: toMoneyNumberOrNull(line.totalCost),
      notes: line.lineNotes ?? null,
    },
  })

  return ApiResponses.success({
    id: line.id,
    skuCode: line.skuCode,
    skuDescription: line.skuDescription,
    lotRef: line.lotRef,
    piNumber: line.piNumber ?? null,
    commodityCode: line.commodityCode ?? null,
    countryOfOrigin: line.countryOfOrigin ?? null,
    netWeightKg: toNumberOrNull(line.netWeightKg),
    material: line.material ?? null,
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
    unitCost: toMoneyNumberOrNull(line.unitCost),
    totalCost: toMoneyNumberOrNull(line.totalCost),
    currency: line.currency ?? tenant.currency,
    status: line.status,
    postedQuantity: line.postedQuantity,
    quantityReceived: line.quantityReceived,
    lineNotes: line.lineNotes,
    createdAt: line.createdAt.toISOString(),
    updatedAt: line.updatedAt.toISOString(),
  })
})
