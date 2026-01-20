import { NextResponse } from 'next/server'
import { withAuthAndParams } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'
import { formatDimensionTripletCm, resolveDimensionTripletCm } from '@/lib/sku-dimensions'
import { apiLogger } from '@/lib/logger'
export const dynamic = 'force-dynamic'

const normalizePackagingType = (value: unknown): 'BOX' | 'POLYBAG' | null => {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = trimmed.toUpperCase().replace(/[^A-Z]/g, '')
  if (normalized === 'BOX') return 'BOX'
  if (normalized === 'POLYBAG') return 'POLYBAG'
  return null
}

// GET /api/skus/[id] - Get a single SKU by ID
export const GET = withAuthAndParams(async (_request, params, _session) => {
  const { id } = params as { id: string }

  try {
    const prisma = await getTenantPrisma()
    const sku = await prisma.sku.findUnique({
      where: { id },
    })

    if (!sku) {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
    }

    // Manually count transactions since relation no longer exists
    const transactionCount = await prisma.inventoryTransaction.count({
      where: { skuCode: sku.skuCode },
    })

    const storageLedgerCount = await prisma.storageLedger.count({
      where: { skuCode: sku.skuCode },
    })

    return NextResponse.json({
      ...sku,
      _count: {
        inventoryTransactions: transactionCount,
        storageLedgerEntries: storageLedgerCount,
      },
    })
  } catch (error) {
    apiLogger.error('Failed to fetch SKU', {
      skuId: id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'Failed to fetch SKU' }, { status: 500 })
  }
})

// PUT /api/skus/[id] - Update a SKU
export const PUT = withAuthAndParams(async (request, params, _session) => {
  const { id } = params as { id: string }

  try {
    const prisma = await getTenantPrisma()
    const body = await request.json()

    // Validate required fields
    if (!body.skuCode || !body.description) {
      return NextResponse.json({ error: 'SKU code and description are required' }, { status: 400 })
    }

    // Check if SKU code is being changed and if new code already exists
    const existingSku = await prisma.sku.findFirst({
      where: {
        skuCode: body.skuCode,
        NOT: { id },
      },
    })

    if (existingSku) {
      return NextResponse.json({ error: 'SKU code already exists' }, { status: 400 })
    }

    // Update the SKU
    const itemTriplet = resolveDimensionTripletCm({
      side1Cm: body.itemSide1Cm,
      side2Cm: body.itemSide2Cm,
      side3Cm: body.itemSide3Cm,
      legacy: body.itemDimensionsCm,
    })
    const cartonTriplet = resolveDimensionTripletCm({
      side1Cm: body.cartonSide1Cm,
      side2Cm: body.cartonSide2Cm,
      side3Cm: body.cartonSide3Cm,
      legacy: body.cartonDimensionsCm,
    })

    const itemInputProvided =
      Boolean(body.itemDimensionsCm) ||
      [body.itemSide1Cm, body.itemSide2Cm, body.itemSide3Cm].some(
        value => value !== undefined && value !== null
      )
    const cartonInputProvided =
      Boolean(body.cartonDimensionsCm) ||
      [body.cartonSide1Cm, body.cartonSide2Cm, body.cartonSide3Cm].some(
        value => value !== undefined && value !== null
      )

	    if (itemInputProvided && !itemTriplet) {
	      return NextResponse.json(
	        { error: 'Item dimensions must be a valid LxWxH triple' },
	        { status: 400 }
	      )
	    }
    if (cartonInputProvided && !cartonTriplet) {
      return NextResponse.json(
        { error: 'Carton dimensions must be a valid LxWxH triple' },
        { status: 400 }
      )
    }

    let packagingType: 'BOX' | 'POLYBAG' | null | undefined = undefined
    if (Object.prototype.hasOwnProperty.call(body, 'packagingType')) {
      if (body.packagingType === null || body.packagingType === '') {
        packagingType = null
      } else {
        const normalized = normalizePackagingType(body.packagingType)
        if (!normalized) {
          return NextResponse.json(
            { error: 'Invalid packaging type. Must be BOX or POLYBAG.' },
            { status: 400 }
          )
        }
        packagingType = normalized
      }
    }

    const updatedSku = await prisma.sku.update({
      where: { id },
      data: {
        skuCode: body.skuCode,
        asin: body.asin,
        description: body.description,
        packSize: body.packSize,
        material: body.material,
        itemDimensionsCm: itemTriplet ? formatDimensionTripletCm(itemTriplet) : null,
        itemSide1Cm: itemTriplet ? itemTriplet.side1Cm : null,
        itemSide2Cm: itemTriplet ? itemTriplet.side2Cm : null,
        itemSide3Cm: itemTriplet ? itemTriplet.side3Cm : null,
        itemWeightKg: body.itemWeightKg,
        unitsPerCarton: body.unitsPerCarton,
        cartonDimensionsCm: cartonTriplet ? formatDimensionTripletCm(cartonTriplet) : null,
        cartonSide1Cm: cartonTriplet ? cartonTriplet.side1Cm : null,
        cartonSide2Cm: cartonTriplet ? cartonTriplet.side2Cm : null,
        cartonSide3Cm: cartonTriplet ? cartonTriplet.side3Cm : null,
        cartonWeightKg: body.cartonWeightKg,
        packagingType,
      },
    })

    return NextResponse.json(updatedSku)
  } catch (error) {
    apiLogger.error('Failed to update SKU', {
      skuId: id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'Failed to update SKU' }, { status: 500 })
  }
})

// DELETE /api/skus/[id] - Delete a SKU
export const DELETE = withAuthAndParams(async (_request, params, _session) => {
  const { id } = params as { id: string }

  try {
    const prisma = await getTenantPrisma()
    // Check if SKU has related data
    const sku = await prisma.sku.findUnique({
      where: { id },
    })

    if (!sku) {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
    }

    // Manually count related data since relations no longer exist
    const transactionCount = await prisma.inventoryTransaction.count({
      where: { skuCode: sku.skuCode },
    })

    const storageLedgerCount = await prisma.storageLedger.count({
      where: { skuCode: sku.skuCode },
    })

    if (transactionCount > 0 || storageLedgerCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete SKU "${sku.skuCode}". References found: inventory transactions=${transactionCount}, storage ledger=${storageLedgerCount}.`,
        },
        { status: 409 }
      )
    }

    // Otherwise, delete the SKU
    await prisma.sku.delete({
      where: { id: id },
    })

    return NextResponse.json({
      message: 'SKU deleted successfully',
    })
  } catch (error) {
    apiLogger.error('Failed to delete SKU', {
      skuId: id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'Failed to delete SKU' }, { status: 500 })
  }
})
