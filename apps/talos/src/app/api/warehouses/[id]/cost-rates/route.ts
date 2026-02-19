import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTenantPrisma } from '@/lib/tenant/server'

export const dynamic = 'force-dynamic'

export async function GET(
 request: NextRequest,
 context: { params: Promise<{ id: string }> }
) {
 try {
 const { id } = await context.params
 const session = await auth()
 if (!session) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 }

 const prisma = await getTenantPrisma()
 const warehouseId = id

 // Fetch cost rates for this warehouse from the CostRate table
 const costRates = await prisma.costRate.findMany({
 where: { 
 warehouseId: warehouseId,
 isActive: true
 },
 orderBy: [{ costName: 'asc' }, { updatedAt: 'desc' }]
 })

 // Transform to match frontend expectations
 const transformedRates = costRates.map(rate => {
  return {
 id: rate.id,
 warehouseId: rate.warehouseId,
 costCategory: rate.costCategory,
 costName: rate.costName,
 costValue: Number(rate.costValue),
 unitOfMeasure: rate.unitOfMeasure,
 effectiveDate: rate.effectiveDate.toISOString(),
 endDate: rate.endDate ? rate.endDate.toISOString() : null,
 isActive: rate.isActive,
  }
 })

 return NextResponse.json({
 warehouseId,
 costRates: transformedRates
 })
 } catch (_error) {
 // console.error('Error fetching cost rates:', _error)
 return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
 }
}

export async function PUT(
 request: NextRequest,
 context: { params: Promise<{ id: string }> }
) {
 void request
 void context
 return NextResponse.json(
 { error: 'Method not allowed' },
 { status: 405, headers: { Allow: 'GET' } }
 )
}
