import { NextRequest, NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import type { PrismaClient } from '@targon/prisma-talos'
import bcrypt from 'bcryptjs'
import { auth } from '@/lib/auth'
import { getTenantPrisma, getCurrentTenantCode } from '@/lib/tenant/server'
import { UserRole } from '@targon/prisma-talos'
export const dynamic = 'force-dynamic'
const TEMPLATE_EFFECTIVE_DATE = new Date('2000-01-01')

// Lazy-loaded password hash to avoid build-time errors
let _placeholderPasswordHash: string | null = null
function getPlaceholderPasswordHash(): string {
 if (!_placeholderPasswordHash) {
  const password = process.env.TALOS_SSO_PLACEHOLDER_PASSWORD
  if (!password) {
   throw new Error('TALOS_SSO_PLACEHOLDER_PASSWORD environment variable is required')
  }
  _placeholderPasswordHash = bcrypt.hashSync(password, 10)
 }
 return _placeholderPasswordHash
}

const normalizeRole = (role?: unknown): UserRole => {
 const allowed: UserRole[] = ['admin', 'staff']
 if (typeof role === 'string' && allowed.includes(role as UserRole)) {
  return role as UserRole
 }
 return 'staff'
}

const ensureTalosUser = async (session: Session, prisma: PrismaClient) => {
 const rawEmail = session.user?.email

 if (!rawEmail) {
  throw new Error('Missing session user email')
 }

 const email = rawEmail.trim().toLowerCase()

 const fullName = session.user?.name || email
 const role = normalizeRole((session.user as { role?: string })?.role)
 const region = await getCurrentTenantCode()

 const user = await prisma.user.upsert({
  where: { email },
  update: {
   fullName,
   role,
   isActive: true,
  },
  create: {
   email,
   username: email,
   passwordHash: getPlaceholderPasswordHash(),
   fullName,
   role,
   region,
   isActive: true,
  },
  select: { id: true },
 })

 return user
}

export async function GET(_request: NextRequest) {
 try {
 const session = await auth()

 if (!session) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 }

 const prisma = await getTenantPrisma()

 // Staff users can only view rates for their assigned warehouse
 const isStaff = session.user.role === 'staff'
 const warehouseFilter = isStaff && session.user.warehouseId
   ? { warehouseId: session.user.warehouseId }
   : {}

 const rates = await prisma.costRate.findMany({
 where: warehouseFilter,
 include: {
 warehouse: {
 select: {
 id: true,
 name: true,
 code: true
 }
 }
 },
 orderBy: [
 { warehouse: { name: 'asc' } },
 { costCategory: 'asc' },
 { updatedAt: 'desc' }
 ]
 })

 // Return the data in the correct format
 const formattedRates = rates.map(rate => ({
 id: rate.id,
 warehouseId: rate.warehouseId,
 warehouse: rate.warehouse,
 costCategory: rate.costCategory,
 costName: rate.costName,
 costValue: parseFloat(rate.costValue.toString()),
 unitOfMeasure: rate.unitOfMeasure,
 effectiveDate: rate.effectiveDate.toISOString(),
 endDate: rate.endDate?.toISOString() || null
 }))

 return NextResponse.json(formattedRates)
 } catch (_error) {
 // console.error('Error fetching rates:', error)
 return NextResponse.json(
 { error: 'Failed to fetch rates' },
 { status: 500 }
 )
 }
}

export async function POST(request: NextRequest) {
 try {
  const session = await auth()

  if (!session || session.user.role !== 'admin') {
   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const prisma = await getTenantPrisma()
  const body = await request.json()
  const {
   warehouseId,
   costCategory,
   costValue,
   unitOfMeasure,
   effectiveDate,
   endDate,
   costName: rawCostName,
  } = body

  if (
   !warehouseId ||
   !costCategory ||
   costValue === undefined ||
   costValue === null ||
   !unitOfMeasure
  ) {
   return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const costName =
   typeof rawCostName === 'string' && rawCostName.trim().length > 0
    ? rawCostName.trim()
    : String(costCategory)

  const effectiveOn =
   effectiveDate === undefined || effectiveDate === null || String(effectiveDate).trim().length === 0
    ? TEMPLATE_EFFECTIVE_DATE
    : new Date(effectiveDate)

  if (Number.isNaN(effectiveOn.getTime())) {
   return NextResponse.json({ error: 'Invalid effective date' }, { status: 400 })
  }

  const endOn = endDate ? new Date(endDate) : null
  if (endOn && Number.isNaN(endOn.getTime())) {
   return NextResponse.json({ error: 'Invalid end date' }, { status: 400 })
  }

  if (endOn && endOn < effectiveOn) {
   return NextResponse.json({ error: 'End date must be on or after effective date' }, { status: 400 })
  }

  const duplicateRate = await prisma.costRate.findFirst({
   where: {
    warehouseId,
    costName,
    isActive: true,
   },
  })

  if (duplicateRate) {
   return NextResponse.json(
    {
     error: `A rate named "${costName}" already exists for this warehouse.`,
    },
   { status: 400 }
   )
  }

  const talosUser = await ensureTalosUser(session, prisma)

  const newRate = await prisma.costRate.create({
   data: {
    warehouseId,
    costCategory,
    costName,
    costValue,
    unitOfMeasure,
    effectiveDate: effectiveOn,
    endDate: endOn,
    createdById: talosUser.id,
   },
   include: {
    warehouse: {
     select: {
      id: true,
      name: true,
      code: true,
     },
    },
   },
  })

  const formattedRate = {
   id: newRate.id,
   warehouseId: newRate.warehouseId,
   warehouse: newRate.warehouse,
   costCategory: newRate.costCategory,
   costName: newRate.costName,
   costValue: parseFloat(newRate.costValue.toString()),
   unitOfMeasure: newRate.unitOfMeasure,
   effectiveDate: newRate.effectiveDate.toISOString(),
   endDate: newRate.endDate?.toISOString() || null,
  }

  return NextResponse.json(formattedRate)
 } catch (error) {
  console.error('Error creating rate:', error)
  return NextResponse.json(
   { error: error instanceof Error ? error.message : 'Failed to create rate' },
   { status: 500 }
  )
 }
}
