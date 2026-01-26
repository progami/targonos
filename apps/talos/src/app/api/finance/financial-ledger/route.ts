import { withAuth, ApiResponses } from '@/lib/api'
import { getTenantPrisma } from '@/lib/tenant/server'
import { FinancialLedgerCategory, Prisma } from '@targon/prisma-talos'

export const dynamic = 'force-dynamic'

function resolveDateRange(params: URLSearchParams): { start: Date; end: Date } {
  const startDateStr = params.get('startDate')
  const endDateStr = params.get('endDate')

  const startFallback = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const endFallback = new Date()

  const start = startDateStr ? new Date(startDateStr) : startFallback
  start.setUTCHours(0, 0, 0, 0)

  const end = endDateStr ? new Date(endDateStr) : endFallback
  end.setUTCHours(23, 59, 59, 999)

  return { start, end }
}

export const GET = withAuth(async (request, _session) => {
  const prisma = await getTenantPrisma()
  const searchParams = request.nextUrl.searchParams

  const { start, end } = resolveDateRange(searchParams)

  const warehouseCodeRaw = searchParams.get('warehouseCode')
  const warehouseCode =
    typeof warehouseCodeRaw === 'string' && warehouseCodeRaw.trim().length > 0
      ? warehouseCodeRaw.trim()
      : null

  const categoryRaw = searchParams.get('category')
  const category = Object.values(FinancialLedgerCategory).includes(
    categoryRaw as FinancialLedgerCategory
  )
    ? (categoryRaw as FinancialLedgerCategory)
    : null

  const limitRaw = searchParams.get('limit')
  const limitParsed = typeof limitRaw === 'string' ? Number(limitRaw) : NaN
  const limit = Number.isFinite(limitParsed) && limitParsed > 0 ? Math.min(Math.floor(limitParsed), 2000) : 500

  const where: Prisma.FinancialLedgerEntryWhereInput = {
    effectiveAt: { gte: start, lte: end },
    ...(warehouseCode ? { warehouseCode } : {}),
    ...(category ? { category } : {}),
  }

  const [entries, grouped] = await Promise.all([
    prisma.financialLedgerEntry.findMany({
      where,
      orderBy: { effectiveAt: 'desc' },
      take: limit,
    }),
    prisma.financialLedgerEntry.groupBy({
      by: ['category'],
      where,
      _sum: { amount: true },
      orderBy: { category: 'asc' },
    }),
  ])

  const totals: Record<string, number> = {}
  let total = 0
  for (const row of grouped) {
    const amount = row._sum.amount ? Number(row._sum.amount) : 0
    totals[row.category] = amount
    total += amount
  }

  return ApiResponses.success({
    data: entries.map(entry => ({
      id: entry.id,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      category: entry.category,
      costName: entry.costName,
      quantity: entry.quantity ? Number(entry.quantity) : null,
      unitRate: entry.unitRate ? Number(entry.unitRate) : null,
      amount: Number(entry.amount),
      currency: entry.currency,
      warehouseCode: entry.warehouseCode,
      warehouseName: entry.warehouseName,
      skuCode: entry.skuCode ?? null,
      skuDescription: entry.skuDescription ?? null,
      batchLot: entry.batchLot ?? null,
      inventoryTransactionId: entry.inventoryTransactionId ?? null,
      storageLedgerId: entry.storageLedgerId ?? null,
      purchaseOrderId: entry.purchaseOrderId ?? null,
      purchaseOrderLineId: entry.purchaseOrderLineId ?? null,
      effectiveAt: entry.effectiveAt.toISOString(),
      createdAt: entry.createdAt.toISOString(),
      createdByName: entry.createdByName,
      notes: entry.notes ?? null,
    })),
    summary: {
      totals,
      total,
    },
  })
})

