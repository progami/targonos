import { withAuth, ApiResponses } from '@/lib/api'
import { getTenantPrisma } from '@/lib/tenant/server'
import { Prisma } from '@targon/prisma-talos'
import { aggregateCostLedger } from '@targon/ledger'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (request, _session) => {
 const prisma = await getTenantPrisma()
 const searchParams = request.nextUrl.searchParams
 const groupBy = (searchParams.get('groupBy') as 'week' | 'month') || 'week'
 const warehouseCode = searchParams.get('warehouseCode')

 const startDateStr =
 searchParams.get('startDate') || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
 const endDateStr = searchParams.get('endDate') || new Date().toISOString().split('T')[0]

 const startDate = new Date(startDateStr)
 startDate.setUTCHours(0, 0, 0, 0)

 const endDate = new Date(endDateStr)
 endDate.setUTCHours(23, 59, 59, 999)

 const where: Prisma.CostLedgerWhereInput = {
 createdAt: {
 gte: startDate,
 lte: endDate
 },
 ...(warehouseCode ? { warehouseCode } : {})
 }

 const costEntries = await prisma.costLedger.findMany({
 where,
 orderBy: { createdAt: 'asc' }
 })

 const transactionIds = Array.from(
 new Set(
 costEntries
 .map((entry) => entry.transactionId)
 .filter((id): id is string => Boolean(id))
 )
 )

 if (transactionIds.length === 0) {
 return ApiResponses.success({
 groups: [],
 totals: {
 inbound: 0,
 outbound: 0,
 forwarding: 0,
 storage: 0,
 other: 0,
 total: 0
 },
 groupBy
 })
 }

 const validTransactions = await prisma.inventoryTransaction.findMany({
 where: {
 id: { in: transactionIds },
 ...(warehouseCode ? { warehouseCode } : {})
 },
 select: {
 id: true,
 transactionType: true,
 warehouseCode: true,
 warehouseName: true,
 skuCode: true,
 skuDescription: true,
 lotRef: true
 }
 })

 const transactionMap = new Map(validTransactions.map((tx) => [tx.id, tx]))

 const filteredEntries = costEntries.filter(
 entry => entry.transactionId && transactionMap.has(entry.transactionId)
 )

 const aggregated = aggregateCostLedger(
 filteredEntries.map(entry => {
 const transaction = transactionMap.get(entry.transactionId!)
 return {
 id: entry.id,
 transactionId: entry.transactionId,
 costCategory: entry.costCategory,
 quantity: entry.quantity as unknown as number | string | null,
 unitRate: entry.unitRate as unknown as number | string | null,
 totalCost: entry.totalCost as unknown as number | string | null,
 createdAt: entry.createdAt,
 warehouseCode: entry.warehouseCode,
 context: transaction
 ? {
 transactionType: transaction.transactionType,
 warehouseCode: transaction.warehouseCode,
 warehouseName: transaction.warehouseName,
 skuCode: transaction.skuCode,
 skuDescription: transaction.skuDescription,
 lotRef: transaction.lotRef
 }
 : undefined
 }
 }),
 { groupBy }
 )

 return ApiResponses.success({
 groups: aggregated.groups,
 totals: aggregated.totals,
 groupBy
 })
})
