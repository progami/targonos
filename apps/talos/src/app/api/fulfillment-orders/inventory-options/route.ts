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
    by: ['skuCode', 'lotRef'],
    where: { warehouseCode: warehouse.code },
    _sum: { cartonsIn: true, cartonsOut: true },
    _max: { unitsPerCarton: true },
  })

  const available = grouped
    .map(row => {
      const cartonsIn = row._sum.cartonsIn
      const cartonsOut = row._sum.cartonsOut
      const totalIn = typeof cartonsIn === 'number' ? cartonsIn : 0
      const totalOut = typeof cartonsOut === 'number' ? cartonsOut : 0
      return {
        skuCode: row.skuCode,
        lotRef: row.lotRef,
        unitsPerCarton: row._max.unitsPerCarton,
        availableCartons: totalIn - totalOut,
      }
    })
    .filter(row => row.availableCartons > 0)

  if (available.length === 0) {
    return ApiResponses.success({ warehouse, skus: [] })
  }

  const skuCodes = Array.from(new Set(available.map(row => row.skuCode)))

  const skus = await prisma.sku.findMany({
    where: { skuCode: { in: skuCodes }, isActive: true },
    select: { id: true, skuCode: true, description: true, unitsPerCarton: true },
  })

  const skuByCode = new Map(skus.map(sku => [sku.skuCode, sku]))

  const outputBySkuCode = new Map<
    string,
    {
      id: string
      skuCode: string
      description: string
      unitsPerCarton: number | null
      lots: Array<{
        lotRef: string
        unitsPerCarton: number | null
        availableCartons: number
      }>
    }
  >()

  for (const row of available) {
    const sku = skuByCode.get(row.skuCode)
    if (!sku) continue

    if (!outputBySkuCode.has(sku.skuCode)) {
      outputBySkuCode.set(sku.skuCode, {
        id: sku.id,
        skuCode: sku.skuCode,
        description: sku.description,
        unitsPerCarton: sku.unitsPerCarton,
        lots: [],
      })
    }

    const entry = outputBySkuCode.get(sku.skuCode)
    if (!entry) continue

    const unitsPerCarton =
      typeof row.unitsPerCarton === 'number' ? row.unitsPerCarton : entry.unitsPerCarton

    entry.lots.push({
      lotRef: row.lotRef,
      unitsPerCarton,
      availableCartons: row.availableCartons,
    })
  }

  const skusWithLots = Array.from(outputBySkuCode.values())
    .map(sku => ({
      ...sku,
      lots: sku.lots.sort((a, b) => a.lotRef.localeCompare(b.lotRef)),
    }))
    .sort((a, b) => a.skuCode.localeCompare(b.skuCode))

  return ApiResponses.success({
    warehouse,
    skus: skusWithLots,
  })
})
