import { withAuth, ApiResponses } from '@/lib/api'
import { getTenantPrisma } from '@/lib/tenant/server'
import { sanitizeSearchQuery } from '@/lib/security/input-sanitization'

export const dynamic = 'force-dynamic'

interface SearchResult {
  type: 'SKU' | 'PURCHASE_ORDER' | 'SUPPLIER' | 'WAREHOUSE'
  id: string
  title: string
  subtitle?: string
  href: string
}

export const GET = withAuth(async (request) => {
  const { searchParams } = new URL(request.url)
  const rawQuery = searchParams.get('q') ?? ''
  const query = sanitizeSearchQuery(rawQuery).trim()

  if (query.length < 2) {
    return ApiResponses.success({ results: [] })
  }

  const prisma = await getTenantPrisma()
  const results: SearchResult[] = []
  const limit = 5 // Max results per type

  try {
    // Search SKUs
    const skus = await prisma.sku.findMany({
      where: {
        OR: [
          { skuCode: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { asin: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    })

    for (const sku of skus) {
      results.push({
        type: 'SKU',
        id: sku.id,
        title: sku.skuCode,
        subtitle: sku.description ?? undefined,
        href: `/config/products?sku=${encodeURIComponent(sku.skuCode)}`,
      })
    }

    // Search Purchase Orders
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        OR: [
          { orderNumber: { contains: query, mode: 'insensitive' } },
          { poNumber: { contains: query, mode: 'insensitive' } },
          { notes: { contains: query, mode: 'insensitive' } },
          { counterpartyName: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    })

    for (const po of purchaseOrders) {
      results.push({
        type: 'PURCHASE_ORDER',
        id: po.id,
        title: po.poNumber ?? po.orderNumber,
        subtitle: po.counterpartyName ?? undefined,
        href: `/operations/purchase-orders/${po.id}`,
      })
    }

    // Search Suppliers
    const suppliers = await prisma.supplier.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { contactName: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    })

    for (const supplier of suppliers) {
      results.push({
        type: 'SUPPLIER',
        id: supplier.id,
        title: supplier.name,
        subtitle: supplier.contactName ?? supplier.email ?? undefined,
        href: `/config/suppliers?id=${supplier.id}`,
      })
    }

    // Search Warehouses
    const warehouses = await prisma.warehouse.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { address: { contains: query, mode: 'insensitive' } },
          { code: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    })

    for (const warehouse of warehouses) {
      results.push({
        type: 'WAREHOUSE',
        id: warehouse.id,
        title: warehouse.name,
        subtitle: warehouse.address ?? warehouse.code ?? undefined,
        href: `/config/warehouses?id=${warehouse.id}`,
      })
    }

    return ApiResponses.success({ results })
  } catch (error) {
    console.error('[Search API] Error:', error)
    return ApiResponses.serverError('Search failed')
  }
})
