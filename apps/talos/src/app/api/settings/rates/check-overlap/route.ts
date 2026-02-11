import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTenantPrisma } from '@/lib/tenant/server'
import { sanitizeForDisplay } from '@/lib/security/input-sanitization'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
 try {
 const session = await auth()

 if (!session) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 }

 const prisma = await getTenantPrisma()
 const body = await request.json()
  const { rateId, warehouseId, costName } = body

  if (!warehouseId || !costName) {
  return NextResponse.json(
  { error: 'Missing warehouse or rate name' },
  { status: 400 }
  )
  }

 const sanitizedCostName = sanitizeForDisplay(String(costName).trim())
  if (!sanitizedCostName) {
  return NextResponse.json(
   { error: 'Rate name must be provided' },
   { status: 400 }
  )
  }

  const duplicateRate = await prisma.costRate.findFirst({
  where: {
  warehouseId,
  costName: sanitizedCostName,
  isActive: true,
  ...(rateId ? { NOT: { id: rateId } } : {})
  }
  })

  if (duplicateRate) {
  return NextResponse.json({
  hasOverlap: true,
  message: `A rate named "${sanitizedCostName}" already exists for this warehouse.`
  })
  }

  return NextResponse.json({ hasOverlap: false })
 } catch (_error) {
 // console.error('Error checking rate overlap:', error)
 return NextResponse.json(
 { error: 'Failed to check overlap' },
 { status: 500 }
 )
 }
}
