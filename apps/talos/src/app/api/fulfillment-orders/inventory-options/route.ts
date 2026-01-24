import { withAuth, ApiResponses } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { getTenantPrisma } from '@/lib/tenant/server'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (request, session) => {
  const canCreate = await hasPermission(session.user.id, 'fo.create')
  if (!canCreate) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const searchParams = request.nextUrl.searchParams
  const requestedWarehouseId = searchParams.get('warehouseId')

  const warehouseId =
    session.user.role === 'staff' && session.user.warehouseId
      ? session.user.warehouseId
      : requestedWarehouseId

  if (!warehouseId) {
    return ApiResponses.badRequest('warehouseId is required')
  }

  const prisma = await getTenantPrisma()

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true, code: true, name: true },
  })

  if (!warehouse) {
    return ApiResponses.notFound('Warehouse not found')
  }

  const grouped = await prisma.inventoryTransaction.groupBy({
    by: ['skuCode', 'batchLot'],
    where: { warehouseCode: warehouse.code },
    _sum: { cartonsIn: true, cartonsOut: true },
  })

  const available = grouped
    .map(row => {
      const cartonsIn = row._sum.cartonsIn
      const cartonsOut = row._sum.cartonsOut
      const totalIn = typeof cartonsIn === 'number' ? cartonsIn : 0
      const totalOut = typeof cartonsOut === 'number' ? cartonsOut : 0
      return {
        skuCode: row.skuCode,
        batchLot: row.batchLot,
        availableCartons: totalIn - totalOut,
      }
    })
    .filter(row => row.availableCartons > 0)

  if (available.length === 0) {
    return ApiResponses.success({ warehouse, skus: [] })
  }

  const skuCodes = Array.from(new Set(available.map(row => row.skuCode)))
  const batchCodes = Array.from(new Set(available.map(row => row.batchLot)))

  const skus = await prisma.sku.findMany({
    where: { skuCode: { in: skuCodes } },
    select: { id: true, skuCode: true, description: true, unitsPerCarton: true },
  })

  const skuByCode = new Map(skus.map(sku => [sku.skuCode, sku]))
  const skuIds = skus.map(sku => sku.id)

  const batches = await prisma.skuBatch.findMany({
    where: {
      skuId: { in: skuIds },
      batchCode: { in: batchCodes },
    },
    select: { id: true, skuId: true, batchCode: true, unitsPerCarton: true },
  })

  const batchByKey = new Map(batches.map(batch => [`${batch.skuId}::${batch.batchCode}`, batch]))

  const outputBySkuCode = new Map<
    string,
    {
      id: string
      skuCode: string
      description: string
      unitsPerCarton: number | null
      batches: Array<{
        id: string
        batchCode: string
        unitsPerCarton: number | null
        availableCartons: number
      }>
    }
  >()

  for (const row of available) {
    const sku = skuByCode.get(row.skuCode)
    if (!sku) continue

    const batch = batchByKey.get(`${sku.id}::${row.batchLot}`)
    if (!batch) continue

    if (!outputBySkuCode.has(sku.skuCode)) {
      outputBySkuCode.set(sku.skuCode, {
        id: sku.id,
        skuCode: sku.skuCode,
        description: sku.description,
        unitsPerCarton: sku.unitsPerCarton,
        batches: [],
      })
    }

    const entry = outputBySkuCode.get(sku.skuCode)
    if (!entry) continue
    entry.batches.push({
      id: batch.id,
      batchCode: batch.batchCode,
      unitsPerCarton: batch.unitsPerCarton,
      availableCartons: row.availableCartons,
    })
  }

  const skusWithBatches = Array.from(outputBySkuCode.values())
    .map(sku => ({
      ...sku,
      batches: sku.batches.sort((a, b) => a.batchCode.localeCompare(b.batchCode)),
    }))
    .sort((a, b) => a.skuCode.localeCompare(b.skuCode))

  return ApiResponses.success({
    warehouse,
    skus: skusWithBatches,
  })
})

