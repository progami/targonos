import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'
import { checkRateLimit, rateLimitConfigs } from '@/lib/security/rate-limiter'
import { getWarehouseFilter } from '@/lib/auth-utils'
import { Prisma } from '@targon/prisma-talos'

export const dynamic = 'force-dynamic'

export const GET = withAuth(async (request, session) => {
 try {
 // Rate limiting
 const rateLimitResponse = await checkRateLimit(request, rateLimitConfigs.api)
 if (rateLimitResponse) return rateLimitResponse

 // Only staff and admin can access storage ledger
 if (!['staff', 'admin'].includes(session.user.role)) {
 return NextResponse.json({ error: 'Access denied' }, { status: 403 })
 }

 const prisma = await getTenantPrisma()
 const { searchParams } = request.nextUrl
 const warehouseCode = searchParams.get('warehouseCode')
 const startDate = searchParams.get('startDate')
 const endDate = searchParams.get('endDate')
 const includeCosts = searchParams.get('includeCosts') === 'true'
 const page = parseInt(searchParams.get('page') || '1')
 const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
 const search = searchParams.get('search')

 // Apply warehouse filter based on user role
 const warehouseFilter = getWarehouseFilter(session, undefined)
 const where: Prisma.StorageLedgerWhereInput = {}

 if (warehouseFilter?.warehouseId) {
 // Staff user - filter to their warehouse
 const warehouse = await prisma.warehouse.findUnique({
 where: { id: warehouseFilter.warehouseId },
 select: { code: true }
 })
 if (warehouse) {
 where.warehouseCode = warehouse.code
 }
 } else if (warehouseCode) {
 // Admin user with warehouse filter
 where.warehouseCode = warehouseCode
 }

 // Date range filter
 if (startDate && endDate) {
 where.weekEndingDate = {
 gte: new Date(startDate),
 lte: new Date(endDate)
 }
 }

 // Search filter
 if (search) {
 where.OR = [
 { skuCode: { contains: search, mode: 'insensitive' } },
 { skuDescription: { contains: search, mode: 'insensitive' } },
 { lotRef: { contains: search, mode: 'insensitive' } },
 { warehouseName: { contains: search, mode: 'insensitive' } }
 ]
 }

 const totalCount = await prisma.storageLedger.count({ where })

 // Get paginated results
 const entries = await prisma.storageLedger.findMany({
 where,
 select: {
 id: true,
 warehouseCode: true,
 warehouseName: true,
 skuCode: true,
 skuDescription: true,
 lotRef: true,
 weekEndingDate: true,
 closingBalance: true,
 averageBalance: true,
 closingPallets: true,
 palletDays: true,
 createdAt: true,
 ...(includeCosts && {
 storageRatePerPalletDay: true,
 totalStorageCost: true,
 isCostCalculated: true,
 rateEffectiveDate: true,
 costRateId: true
 })
 },
 orderBy: [
 { weekEndingDate: 'desc' },
 { warehouseCode: 'asc' },
 { skuCode: 'asc' }
 ],
 skip: (page - 1) * limit,
 take: limit
 })

 // Build summary from the filtered set
 let summary = null
 if (includeCosts) {
 const aggregated = await prisma.storageLedger.aggregate({
 where,
 _count: { id: true, totalStorageCost: true },
 _sum: { palletDays: true, totalStorageCost: true },
 })

 const totalEntries = aggregated._count.id || 0
 const entriesWithCosts = aggregated._count.totalStorageCost || 0
 const totalPalletDays = Number(aggregated._sum.palletDays || 0)
 const totalStorageCost = Number(aggregated._sum.totalStorageCost || 0)
 const costCalculationRate =
 totalEntries > 0 ? ((entriesWithCosts / totalEntries) * 100).toFixed(1) : '0'

 summary = {
 totalEntries,
 entriesWithCosts,
 totalPalletDays,
 totalStorageCost,
 costCalculationRate,
 }
 }

 const response = {
 entries,
 pagination: {
 page,
 limit,
 totalCount,
 totalPages: Math.ceil(totalCount / limit),
 hasNext: page < Math.ceil(totalCount / limit),
 hasPrev: page > 1
 },
 ...(summary && { summary })
 }

 return NextResponse.json(response)
 } catch (error) {
 console.error('Storage ledger API error:', error)
 return NextResponse.json(
 { error: 'Failed to fetch storage ledger' },
 { status: 500 }
 )
 }
})
