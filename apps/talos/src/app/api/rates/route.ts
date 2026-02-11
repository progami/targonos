import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'
import { Prisma } from '@targon/prisma-talos'
export const dynamic = 'force-dynamic'

// GET /api/rates - List cost rates
export const GET = withAuth(async (req, _session) => {
 try {

 const prisma = await getTenantPrisma()
 const searchParams = req.nextUrl.searchParams
 const warehouseId = searchParams.get('warehouseId')
 const costCategory = searchParams.get('costCategory')
 const activeOnly = searchParams.get('activeOnly') === 'true'

 const where: Prisma.CostRateWhereInput = {}
 
 if (warehouseId) {
 where.warehouseId = warehouseId
 }
 
 if (costCategory && COST_CATEGORY_OPTIONS.includes(costCategory as typeof COST_CATEGORY_OPTIONS[number])) {
 const normalizedCategory = costCategory as typeof COST_CATEGORY_OPTIONS[number]
 where.costCategory = normalizedCategory
 }
 
 if (activeOnly) {
 where.isActive = true
 }

 const rates = await prisma.costRate.findMany({
 where,
 include: {
 warehouse: {
 select: {
 id: true,
 code: true,
 name: true
 }
 },
 createdBy: {
 select: {
 id: true,
 fullName: true,
 email: true
 }
 }
 },
 orderBy: [
 { warehouse: { name: 'asc' } },
 { costCategory: 'asc' },
 { updatedAt: 'desc' }
 ]
 })

 return NextResponse.json(rates)
 } catch (_error) {
 // console.error('Error fetching rates:', error)
 return NextResponse.json(
 { error: 'Failed to fetch rates' },
 { status: 500 }
 )
 }
})

const COST_CATEGORY_OPTIONS = ['Inbound', 'Storage', 'Outbound', 'Forwarding'] as const

function methodNotAllowed() {
 return NextResponse.json(
  { error: 'Rate changes are disabled. Rates are managed via the Tactical rate card process.' },
  { status: 405, headers: { Allow: 'GET' } }
 )
}

export async function POST(_req: NextRequest) {
 return methodNotAllowed()
}

export async function PATCH(_req: NextRequest) {
 return methodNotAllowed()
}

export async function DELETE(_req: NextRequest) {
 return methodNotAllowed()
}
