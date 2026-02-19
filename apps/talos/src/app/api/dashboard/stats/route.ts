import { withAuth, ApiResponses } from '@/lib/api'
import { getTenantPrisma } from '@/lib/tenant/server'
export const dynamic = 'force-dynamic'

interface DashboardStatsResponse {
  totalInventory: number
  inventoryChange: string
  inventoryTrend: 'up' | 'down' | 'neutral'
  storageCost: string
  costChange: string
  costTrend: 'up' | 'down' | 'neutral'
  activeSkus: number
  // New: Cost breakdown by type
  costBreakdown: {
    inbound: number
    outbound: number
    storage: number
    forwarding: number
    other: number
    total: number
  }
  // New: FBA discrepancies
  fbaDiscrepancies: {
    total: number
    mismatch: number
    warnings: number
  }
  // New: Order pipeline
  orderPipeline: {
    issued: number
    manufacturing: number
    inTransit: number
    atWarehouse: number
  }
  pendingFulfillmentOrders: number
  // New: Top warehouses by inventory
  topWarehouses: Array<{
    code: string
    name: string
    cartons: number
  }>
  chartData: {
    inventoryTrend: Array<{ date: string; inventory: number }>
    costTrend: Array<{ date: string; cost: number }>
    warehouseDistribution: Array<{ name: string | null; value: number; percentage: number }>
  }
}

export const GET = withAuth(async (request, session) => {
  const prisma = await getTenantPrisma()

 // Get query parameters
 const searchParams = request.nextUrl.searchParams
 const _timeRange = searchParams.get('timeRange') || 'yearToDate'
 const startDateParam = searchParams.get('startDate')
 const endDateParam = searchParams.get('endDate')
 
 // Get current date info
 const now = new Date()

 // Check if user has warehouse restriction
 let warehouseFilter: { warehouseCode?: string } = {}
 if (session.user.warehouseId) {
 // Get warehouse code for the user's warehouse
 const userWarehouse = await prisma.warehouse.findUnique({
 where: { id: session.user.warehouseId },
 select: { code: true }
 })
 if (userWarehouse) {
 warehouseFilter = { warehouseCode: userWarehouse.code }
 }
 }
 // No exclusions - show all warehouses

  // Pre-calc monthly ranges
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  lastMonthEnd.setHours(23, 59, 59, 999)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  const weeksToGenerate = 12
  const costWindowStart = new Date(now)
  costWindowStart.setDate(costWindowStart.getDate() - (weeksToGenerate * 7))
  const costWindowStartDay = costWindowStart.getDay()
  costWindowStart.setDate(costWindowStart.getDate() - costWindowStartDay)
  costWindowStart.setHours(0, 0, 0, 0)

  const [
    inventoryStats,
    transactionsUpToLastMonth,
    storageCosts,
    lastPeriodCosts,
    activeSkusGroup,
    warehouseInventoryGroups,
    recentCostEntries,
    // New queries for dashboard redesign
    costsByCategory,
    purchaseOrdersByStage,
    pendingFOs,
    skusWithFbaData,
  ] = await Promise.all([
    prisma.inventoryTransaction.aggregate({
      where: warehouseFilter,
      _sum: {
        cartonsIn: true,
        cartonsOut: true,
      },
    }),
    prisma.inventoryTransaction.aggregate({
      where: {
        transactionDate: {
          lte: lastMonthEnd,
        },
        ...warehouseFilter,
      },
      _sum: {
        cartonsIn: true,
        cartonsOut: true,
      },
    }),
    prisma.costLedger.aggregate({
      where: {
        costCategory: 'Storage',
        createdAt: {
          gte: monthStart,
          lte: monthEnd,
        },
        ...warehouseFilter,
      },
      _sum: {
        totalCost: true,
      },
    }),
    prisma.costLedger.aggregate({
      where: {
        costCategory: 'Storage',
        createdAt: {
          gte: prevMonthStart,
          lte: prevMonthEnd,
        },
        ...warehouseFilter,
      },
      _sum: {
        totalCost: true,
      },
    }),
    prisma.inventoryTransaction.groupBy({
      by: ['skuCode'],
      where: warehouseFilter,
      _sum: {
        cartonsIn: true,
        cartonsOut: true,
      },
    }),
    prisma.inventoryTransaction.groupBy({
      by: ['warehouseCode', 'warehouseName'],
      where: warehouseFilter,
      _sum: {
        cartonsIn: true,
        cartonsOut: true,
      },
    }),
    prisma.costLedger.findMany({
      where: {
        costCategory: 'Storage',
        createdAt: {
          gte: costWindowStart,
          lte: now,
        },
        ...warehouseFilter,
      },
      select: {
        createdAt: true,
        totalCost: true,
      },
    }),
    // Cost breakdown by category for selected period
    prisma.costLedger.groupBy({
      by: ['costCategory'],
      where: {
        createdAt: {
          gte: monthStart,
          lte: monthEnd,
        },
        ...warehouseFilter,
      },
      _sum: {
        totalCost: true,
      },
    }),
    // Purchase orders count by status
	    prisma.purchaseOrder.findMany({
	      where: {
	        status: {
	          in: ['RFQ', 'ISSUED', 'MANUFACTURING', 'OCEAN', 'WAREHOUSE'],
	        },
	      },
	      select: {
	        status: true,
	      },
	    }),
    // Pending fulfillment orders (draft status)
    prisma.fulfillmentOrder.count({
      where: {
        status: 'DRAFT',
      },
    }),
    // FBA fee alerts for discrepancy count
    prisma.amazonFbaFeeAlert.groupBy({
      by: ['status'],
      _count: true,
    }),
  ])

  const currentInventory = (inventoryStats._sum.cartonsIn || 0) - (inventoryStats._sum.cartonsOut || 0)
  const lastMonthInventory = (transactionsUpToLastMonth._sum.cartonsIn || 0) -
    (transactionsUpToLastMonth._sum.cartonsOut || 0)
  const inventoryChange = lastMonthInventory > 0
    ? ((currentInventory - lastMonthInventory) / lastMonthInventory) * 100
    : 0

  const currentCost = Number(storageCosts._sum.totalCost || 0)
  const lastCost = Number(lastPeriodCosts._sum.totalCost || 0)
  const costChange = lastCost > 0
    ? ((currentCost - lastCost) / lastCost) * 100
    : 0

  const activeSkusCount = activeSkusGroup
    .filter(sku => (sku._sum.cartonsIn || 0) - (sku._sum.cartonsOut || 0) > 0)
    .length

 // Chart Data: Inventory Trend - use selected date range
 let trendStartDate: Date
 let trendEndDate: Date
 
 if (startDateParam && endDateParam) {
 // Use provided date range
 trendStartDate = new Date(startDateParam)
 trendEndDate = new Date(endDateParam)
 } else {
 // Default to last 30 days
 trendStartDate = new Date()
 trendStartDate.setDate(trendStartDate.getDate() - 30)
 trendEndDate = new Date()
 }
 
 // Ensure we capture full days
 trendStartDate.setHours(0, 0, 0, 0)
 trendEndDate.setHours(23, 59, 59, 999)
 
 // Always extend 14 days into the future for better rendering
 const extendedEndDate = new Date(trendEndDate)
 extendedEndDate.setDate(extendedEndDate.getDate() + 14)
 
 // Get daily inventory snapshots (including any future transactions)
 const inventoryTrendData = await prisma.inventoryTransaction.groupBy({
 by: ['transactionDate'],
 where: {
 transactionDate: {
 gte: trendStartDate,
 lte: extendedEndDate,
 },
 ...warehouseFilter,
 },
 _sum: {
 cartonsIn: true,
 cartonsOut: true,
 },
 orderBy: {
 transactionDate: 'asc',
 },
 })

 // Calculate running balance for each day
 const inventoryTrend: Array<{ date: string; inventory: number }> = []
 let runningBalance = 0
 
 // Get initial balance before the selected period
 const initialBalanceData = await prisma.inventoryTransaction.aggregate({
 where: {
 transactionDate: {
 lt: trendStartDate,
 },
 ...warehouseFilter,
 },
 _sum: {
 cartonsIn: true,
 cartonsOut: true,
 },
 })
 
 runningBalance = (initialBalanceData._sum.cartonsIn || 0) - (initialBalanceData._sum.cartonsOut || 0)
 
 // Create a map of dates with transactions
 const transactionMap = new Map<string, { in: number; out: number }>()
 inventoryTrendData.forEach(item => {
 // Use UTC date parts since transactions are stored in UTC
 const date = new Date(item.transactionDate)
 const dateKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
 
 // Accumulate transactions for the same date
 const existing = transactionMap.get(dateKey)
 if (existing) {
 transactionMap.set(dateKey, {
 in: (existing.in || 0) + (item._sum.cartonsIn || 0),
 out: (existing.out || 0) + (item._sum.cartonsOut || 0),
 })
 } else {
 transactionMap.set(dateKey, {
 in: item._sum.cartonsIn || 0,
 out: item._sum.cartonsOut || 0,
 })
 }
 })
 
 // Log today's transactions for debugging
 const today = new Date()
 const _todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
 
 // Fill in all days including those without transactions (plus 14 days future)
 const currentDate = new Date(trendStartDate)
 
 while (currentDate <= extendedEndDate) {
 const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
 const dayTransactions = transactionMap.get(dateKey)
 
 if (dayTransactions) {
 runningBalance += dayTransactions.in - dayTransactions.out
 }
 
 inventoryTrend.push({
 date: currentDate.toISOString(), // Send full ISO string with timezone
 inventory: Math.max(0, runningBalance),
 })
 
 // Move to next day - create new date to avoid mutation issues
 currentDate.setTime(currentDate.getTime() + 24 * 60 * 60 * 1000)
 }

  // Chart Data: Cost Trend (last 12 weeks aggregated locally)
  const costTrendBuckets = new Map<string, number>()
  for (const entry of recentCostEntries) {
    const entryDate = new Date(entry.createdAt)
    const bucketStart = new Date(Date.UTC(
      entryDate.getUTCFullYear(),
      entryDate.getUTCMonth(),
      entryDate.getUTCDate()
    ))
    // Normalise to week start (Sunday baseline)
    const dayOfWeek = bucketStart.getUTCDay()
    bucketStart.setUTCDate(bucketStart.getUTCDate() - dayOfWeek)
    const key = bucketStart.toISOString().split('T')[0]
    costTrendBuckets.set(key, (costTrendBuckets.get(key) || 0) + Number(entry.totalCost || 0))
  }

  const costTrend: Array<{ date: string; cost: number }> = []
  const baseWeekStart = new Date(Date.UTC(
    costWindowStart.getUTCFullYear(),
    costWindowStart.getUTCMonth(),
    costWindowStart.getUTCDate()
  ))
  for (let i = 0; i < weeksToGenerate; i++) {
    const weekStart = new Date(baseWeekStart)
    weekStart.setUTCDate(baseWeekStart.getUTCDate() + (i * 7))
    const key = weekStart.toISOString().split('T')[0]
    costTrend.push({
      date: key,
      cost: Number(costTrendBuckets.get(key) || 0),
    })
  }

 // Chart Data: Warehouse Distribution
 const totalCartons = warehouseInventoryGroups.reduce((sum, w) =>
  sum + ((w._sum.cartonsIn || 0) - (w._sum.cartonsOut || 0)), 0)
 
 const warehouseDistribution = warehouseInventoryGroups
 .map(w => {
 const balance = (w._sum.cartonsIn || 0) - (w._sum.cartonsOut || 0)
 return {
 name: w.warehouseName,
 value: balance,
 percentage: totalCartons > 0 ? (balance / totalCartons) * 100 : 0,
 }
 })
  .filter(w => w.value > 0)
 .sort((a, b) => b.value - a.value)

  // Calculate cost breakdown by category
  const costBreakdown = {
    inbound: 0,
    outbound: 0,
    storage: 0,
    forwarding: 0,
    other: 0,
    total: 0,
  }
  for (const cat of costsByCategory) {
    const amount = Number(cat._sum.totalCost || 0)
    costBreakdown.total += amount
    switch (cat.costCategory) {
      case 'Inbound':
        costBreakdown.inbound += amount
        break
      case 'Outbound':
        costBreakdown.outbound += amount
        break
      case 'Storage':
        costBreakdown.storage += amount
        break
      case 'Forwarding':
        costBreakdown.forwarding += amount
        break
      default:
        costBreakdown.other += amount
    }
  }

  // Calculate order pipeline counts
  const orderPipeline = {
    issued: 0,
    manufacturing: 0,
    inTransit: 0,
    atWarehouse: 0,
  }
	  for (const po of purchaseOrdersByStage) {
	    switch (po.status) {
	      case 'RFQ':
	        orderPipeline.issued++
	        break
      case 'ISSUED':
        orderPipeline.issued++
        break
      case 'MANUFACTURING':
        orderPipeline.manufacturing++
        break
      case 'OCEAN':
        orderPipeline.inTransit++
        break
      case 'WAREHOUSE':
        orderPipeline.atWarehouse++
        break
    }
  }

  // Calculate FBA discrepancies
  const fbaDiscrepancies = {
    total: 0,
    mismatch: 0,
    warnings: 0,
  }
  for (const alert of skusWithFbaData) {
    fbaDiscrepancies.total += alert._count
    if (alert.status === 'MISMATCH') {
      fbaDiscrepancies.mismatch += alert._count
    } else if (alert.status === 'MISSING_REFERENCE' || alert.status === 'NO_ASIN' || alert.status === 'ERROR') {
      fbaDiscrepancies.warnings += alert._count
    }
  }

  // Top 3 warehouses by inventory
  const topWarehouses = warehouseDistribution.slice(0, 3).map(w => ({
    code: w.name || 'Unknown',
    name: w.name || 'Unknown',
    cartons: w.value,
  }))

 return ApiResponses.success<DashboardStatsResponse>({
 totalInventory: currentInventory,
 inventoryChange: inventoryChange.toFixed(1),
 inventoryTrend: inventoryChange > 0 ? 'up' : inventoryChange < 0 ? 'down' : 'neutral',
 storageCost: currentCost.toFixed(2),
 costChange: costChange.toFixed(1),
 costTrend: costChange > 0 ? 'up' : costChange < 0 ? 'down' : 'neutral',
 activeSkus: activeSkusCount,
 costBreakdown,
 fbaDiscrepancies,
 orderPipeline,
 pendingFulfillmentOrders: pendingFOs,
 topWarehouses,
 chartData: {
  inventoryTrend,
  costTrend,
  warehouseDistribution,
 },
})
})
