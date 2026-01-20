import { NextRequest } from 'next/server'
import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import { getTenantPrisma, getCurrentTenant } from '@/lib/tenant/server'
import { NotFoundError } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { auditLog } from '@/lib/security/audit-logger'
import { Prisma } from '@targon/prisma-talos'

const UpdateLineSchema = z.object({
  skuCode: z.string().trim().min(1).optional(),
  skuDescription: z.string().optional(),
  batchLot: z.string().trim().min(1).optional(),
  unitsOrdered: z.number().int().positive().optional(),
  unitsPerCarton: z.number().int().positive().optional(),
  totalCost: z.number().min(0).nullable().optional(),
  currency: z.string().optional(),
  notes: z.string().nullable().optional(),
  quantityReceived: z.number().int().min(0).optional(),
})

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

/**
 * GET /api/purchase-orders/[id]/lines/[lineId]
 * Get a specific line item
 */
export const GET = withAuthAndParams(async (request: NextRequest, params, _session) => {
  const id = params.id as string
  const lineId = params.lineId as string
  const tenant = await getCurrentTenant()
  const prisma = await getTenantPrisma()

  const line = await prisma.purchaseOrderLine.findFirst({
    where: {
      id: lineId,
      purchaseOrderId: id,
    },
  })

  if (!line) {
    throw new NotFoundError(`Line item not found: ${lineId}`)
  }

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

/**
 * PATCH /api/purchase-orders/[id]/lines/[lineId]
 * Update a line item
 */
export const PATCH = withAuthAndParams(async (request: NextRequest, params, _session) => {
  const id = params.id as string
  const lineId = params.lineId as string
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

  const line = await prisma.purchaseOrderLine.findFirst({
    where: {
      id: lineId,
      purchaseOrderId: id,
    },
  })

  if (!line) {
    throw new NotFoundError(`Line item not found: ${lineId}`)
  }

  // Only allow editing most fields in DRAFT status
  // quantityReceived can be edited in WAREHOUSE status
  const payload = await request.json().catch(() => null)
  const result = UpdateLineSchema.safeParse(payload)

  if (!result.success) {
    return ApiResponses.badRequest(
      `Invalid payload: ${result.error.errors.map(e => e.message).join(', ')}`
    )
  }

  const updateData: Prisma.PurchaseOrderLineUpdateInput = {}

  // Core fields - only editable in DRAFT
  if (order.status === 'DRAFT') {
    if (result.data.skuCode !== undefined) updateData.skuCode = result.data.skuCode
    if (result.data.skuDescription !== undefined)
      updateData.skuDescription = result.data.skuDescription
    if (result.data.currency !== undefined) updateData.currency = result.data.currency
    if (result.data.notes !== undefined) updateData.lineNotes = result.data.notes

    const unitsChanged =
      result.data.unitsOrdered !== undefined || result.data.unitsPerCarton !== undefined
    const totalCostChanged = result.data.totalCost !== undefined

    if (unitsChanged) {
      const nextUnitsOrdered = result.data.unitsOrdered ?? line.unitsOrdered
      const nextUnitsPerCarton = result.data.unitsPerCarton ?? line.unitsPerCarton

      let cartonsOrdered: number
      try {
        cartonsOrdered = computeCartonsOrdered({
          skuCode: line.skuCode,
          unitsOrdered: nextUnitsOrdered,
          unitsPerCarton: nextUnitsPerCarton,
        })
      } catch (error) {
        return ApiResponses.badRequest(
          error instanceof Error ? error.message : 'Invalid units/carton inputs'
        )
      }

      updateData.unitsOrdered = nextUnitsOrdered
      updateData.unitsPerCarton = nextUnitsPerCarton
      updateData.quantity = cartonsOrdered
    }

    const existingTotalCost = line.totalCost ? Number(line.totalCost) : null
    const nextTotalCost =
      result.data.totalCost !== undefined ? result.data.totalCost : existingTotalCost

    if (totalCostChanged) {
      if (nextTotalCost === null) {
        updateData.totalCost = null
        updateData.unitCost = null
      } else {
        updateData.totalCost =
          typeof nextTotalCost === 'number' && Number.isFinite(nextTotalCost)
            ? nextTotalCost.toFixed(2)
            : undefined
      }
    }

    if (
      (totalCostChanged || unitsChanged) &&
      typeof nextTotalCost === 'number' &&
      Number.isFinite(nextTotalCost)
    ) {
      const nextUnitsOrdered = result.data.unitsOrdered ?? line.unitsOrdered
      if (nextUnitsOrdered > 0) {
        updateData.unitCost = (nextTotalCost / nextUnitsOrdered).toFixed(4)
      }
    }
  }

  // quantityReceived - editable in WAREHOUSE status
  if (order.status === 'WAREHOUSE' && result.data.quantityReceived !== undefined) {
    if (result.data.quantityReceived > line.quantity) {
      return ApiResponses.badRequest('quantityReceived cannot exceed ordered quantity')
    }
    updateData.quantityReceived = result.data.quantityReceived
  }

  if (Object.keys(updateData).length === 0 && order.status !== 'DRAFT') {
    return ApiResponses.badRequest('No valid fields to update for current order status')
  }

  if (order.status === 'DRAFT') {
    const skuCodeChanged =
      result.data.skuCode !== undefined &&
      result.data.skuCode.trim().toLowerCase() !== line.skuCode.trim().toLowerCase()

    const currentBatchLot = line.batchLot?.trim().toUpperCase() ?? null
    const requestedBatchLot = result.data.batchLot?.trim()
    const normalizedRequestedBatchLot =
      requestedBatchLot && requestedBatchLot.length > 0 ? requestedBatchLot.toUpperCase() : null

    if (skuCodeChanged && !normalizedRequestedBatchLot) {
      return ApiResponses.badRequest('Batch is required when changing SKU')
    }

    if (normalizedRequestedBatchLot === 'DEFAULT') {
      return ApiResponses.badRequest('Batch is required')
    }

    const batchLotChanged =
      normalizedRequestedBatchLot !== null && normalizedRequestedBatchLot !== currentBatchLot

    const needsSkuBatchSnapshot = skuCodeChanged || batchLotChanged

    if (needsSkuBatchSnapshot) {
      const nextSkuCode = (result.data.skuCode ?? line.skuCode).trim()
      const nextBatchLot = (normalizedRequestedBatchLot ?? currentBatchLot ?? '').trim().toUpperCase()

      if (!nextBatchLot || nextBatchLot === 'DEFAULT') {
        return ApiResponses.badRequest('Batch is required')
      }

      const sku = await prisma.sku.findFirst({
        where: { skuCode: nextSkuCode },
        select: {
          id: true,
          skuCode: true,
          description: true,
          cartonDimensionsCm: true,
          cartonSide1Cm: true,
          cartonSide2Cm: true,
          cartonSide3Cm: true,
          cartonWeightKg: true,
          packagingType: true,
        },
      })

      if (!sku) {
        return ApiResponses.badRequest(`SKU ${nextSkuCode} not found. Create the SKU first.`)
      }

      const existingBatch = await prisma.skuBatch.findFirst({
        where: {
          skuId: sku.id,
          batchCode: { equals: nextBatchLot, mode: 'insensitive' },
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
          `Batch ${nextBatchLot} not found for SKU ${sku.skuCode}. Create it in Products → Batches first.`
        )
      }

      updateData.batchLot = existingBatch.batchCode
      updateData.cartonDimensionsCm = existingBatch.cartonDimensionsCm ?? sku.cartonDimensionsCm ?? null
      updateData.cartonSide1Cm = existingBatch.cartonSide1Cm ?? sku.cartonSide1Cm ?? null
      updateData.cartonSide2Cm = existingBatch.cartonSide2Cm ?? sku.cartonSide2Cm ?? null
      updateData.cartonSide3Cm = existingBatch.cartonSide3Cm ?? sku.cartonSide3Cm ?? null
      updateData.cartonWeightKg = existingBatch.cartonWeightKg ?? sku.cartonWeightKg ?? null
      updateData.packagingType = existingBatch.packagingType ?? sku.packagingType ?? null
      updateData.storageCartonsPerPallet = existingBatch.storageCartonsPerPallet ?? null
      updateData.shippingCartonsPerPallet = existingBatch.shippingCartonsPerPallet ?? null

      if (skuCodeChanged && result.data.skuDescription === undefined) {
        updateData.skuDescription = sku.description
      }
    }
  }

  if (Object.keys(updateData).length === 0) {
    return ApiResponses.badRequest('No valid fields to update for current order status')
  }

  let updated
  try {
    updated = await prisma.purchaseOrderLine.update({
      where: { id: lineId },
      data: updateData,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return ApiResponses.conflict('A line with this SKU already exists for the purchase order')
    }
    throw error
  }

  const before = {
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
    totalCost: line.totalCost ? Number(line.totalCost) : null,
    currency: line.currency ?? null,
    notes: line.lineNotes ?? null,
    quantityReceived: line.quantityReceived ?? null,
  }
  const after = {
    lineId: updated.id,
    skuCode: updated.skuCode,
    skuDescription: updated.skuDescription ?? null,
    batchLot: updated.batchLot ?? null,
    cartonDimensionsCm: updated.cartonDimensionsCm ?? null,
    cartonSide1Cm: toNumberOrNull(updated.cartonSide1Cm),
    cartonSide2Cm: toNumberOrNull(updated.cartonSide2Cm),
    cartonSide3Cm: toNumberOrNull(updated.cartonSide3Cm),
    cartonWeightKg: toNumberOrNull(updated.cartonWeightKg),
    packagingType: updated.packagingType ?? null,
    storageCartonsPerPallet: updated.storageCartonsPerPallet ?? null,
    shippingCartonsPerPallet: updated.shippingCartonsPerPallet ?? null,
    unitsOrdered: updated.unitsOrdered,
    unitsPerCarton: updated.unitsPerCarton,
    quantity: updated.quantity,
    unitCost: updated.unitCost ? Number(updated.unitCost) : null,
    totalCost: updated.totalCost ? Number(updated.totalCost) : null,
    currency: updated.currency ?? null,
    notes: updated.lineNotes ?? null,
    quantityReceived: updated.quantityReceived ?? null,
  }

  const auditOldValue: Record<string, unknown> = { lineId: line.id }
  const auditNewValue: Record<string, unknown> = { lineId: line.id }

  for (const key of Object.keys(after) as Array<keyof typeof after>) {
    if (key === 'lineId') continue
    if (before[key] === after[key]) continue
    auditOldValue[key] = before[key]
    auditNewValue[key] = after[key]
  }

  if (Object.keys(auditNewValue).length > 1) {
    await auditLog({
      entityType: 'PurchaseOrder',
      entityId: id,
      action: 'LINE_UPDATE',
      userId: _session.user.id,
      oldValue: auditOldValue,
      newValue: auditNewValue,
    })
  }

  return ApiResponses.success({
    id: updated.id,
    skuCode: updated.skuCode,
    skuDescription: updated.skuDescription,
    batchLot: updated.batchLot,
    cartonDimensionsCm: updated.cartonDimensionsCm ?? null,
    cartonSide1Cm: toNumberOrNull(updated.cartonSide1Cm),
    cartonSide2Cm: toNumberOrNull(updated.cartonSide2Cm),
    cartonSide3Cm: toNumberOrNull(updated.cartonSide3Cm),
    cartonWeightKg: toNumberOrNull(updated.cartonWeightKg),
    packagingType: updated.packagingType ? updated.packagingType.trim().toUpperCase() : null,
    storageCartonsPerPallet: updated.storageCartonsPerPallet ?? null,
    shippingCartonsPerPallet: updated.shippingCartonsPerPallet ?? null,
    unitsOrdered: updated.unitsOrdered,
    unitsPerCarton: updated.unitsPerCarton,
    quantity: updated.quantity,
    unitCost: updated.unitCost ? Number(updated.unitCost) : null,
    totalCost: updated.totalCost ? Number(updated.totalCost) : null,
    currency: updated.currency,
    status: updated.status,
    postedQuantity: updated.postedQuantity,
    quantityReceived: updated.quantityReceived,
    lineNotes: updated.lineNotes,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
})

/**
 * DELETE /api/purchase-orders/[id]/lines/[lineId]
 * Delete a line item
 */
export const DELETE = withAuthAndParams(async (request: NextRequest, params, _session) => {
  const id = params.id as string
  const lineId = params.lineId as string
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

  // Only allow deleting lines in DRAFT status
  if (order.status !== 'DRAFT') {
    return ApiResponses.badRequest('Can only delete line items from orders in DRAFT status')
  }

  const line = await prisma.purchaseOrderLine.findFirst({
    where: {
      id: lineId,
      purchaseOrderId: id,
    },
  })

  if (!line) {
    throw new NotFoundError(`Line item not found: ${lineId}`)
  }

  await prisma.purchaseOrderLine.delete({
    where: { id: lineId },
  })

  await auditLog({
    entityType: 'PurchaseOrder',
    entityId: id,
    action: 'LINE_DELETE',
    userId: _session.user.id,
    oldValue: {
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
      totalCost: line.totalCost ? Number(line.totalCost) : null,
      currency: line.currency ?? null,
      notes: line.lineNotes ?? null,
    },
    newValue: { lineId: line.id, deleted: true },
  })

  return ApiResponses.success({ deleted: true })
})
