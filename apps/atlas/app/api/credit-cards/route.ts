import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withRateLimit, validateBody, safeErrorResponse } from '@/lib/api-helpers'
import { getCurrentEmployeeId } from '@/lib/current-user'
import { getAllowedPasswordDepartments, getDepartmentRefsForEmployee } from '@/lib/department-access'
import { prisma } from '@/lib/prisma'

const PasswordDepartmentEnum = z.enum([
  'OPS',
  'SALES_MARKETING',
  'LEGAL',
  'HR',
  'FINANCE',
])

const CreditCardBrandEnum = z.enum([
  'VISA',
  'MASTERCARD',
  'AMEX',
  'DISCOVER',
  'OTHER',
])

const CreateCreditCardSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  cardholderName: z.string().max(200).trim().optional().nullable(),
  brand: CreditCardBrandEnum,
  cardNumber: z.string().max(30).trim().optional().nullable(),
  last4: z.string().regex(/^[0-9]{4}$/).optional(),
  cvv: z.string().max(10).trim().optional().nullable(),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(2000).max(2100),
  department: PasswordDepartmentEnum.optional(),
  url: z.string().max(500).trim().optional().nullable(),
  notes: z.string().max(2000).trim().optional().nullable(),
})

export async function GET(req: Request) {
  const rateLimitError = withRateLimit(req)
  if (rateLimitError) return rateLimitError

  try {
    const currentEmployeeId = await getCurrentEmployeeId()
    if (!currentEmployeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const deptRefs = await getDepartmentRefsForEmployee(currentEmployeeId)
    if (!deptRefs) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const allowedDepartments = getAllowedPasswordDepartments(deptRefs)

    const { searchParams } = new URL(req.url)
    const takeRaw = searchParams.get('take')
    const skipRaw = searchParams.get('skip')
    const departmentRaw = searchParams.get('department')
    const q = searchParams.get('q')

    const take = Math.min(parseInt(takeRaw ?? '50', 10), 100)
    const skip = parseInt(skipRaw ?? '0', 10)

    const where: any = {}

    let departmentFilter = allowedDepartments
    if (departmentRaw) {
      const parsed = PasswordDepartmentEnum.safeParse(departmentRaw.toUpperCase())
      if (parsed.success) {
        if (!allowedDepartments.includes(parsed.data)) {
          return NextResponse.json({ items: [], total: 0, allowedDepartments })
        }
        departmentFilter = [parsed.data]
      }
    }

    where.department = { in: departmentFilter }

    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { cardholderName: { contains: q, mode: 'insensitive' } },
        { last4: { contains: q } },
        { url: { contains: q, mode: 'insensitive' } },
      ]
    }

    const [items, total] = await Promise.all([
      prisma.creditCard.findMany({
        where,
        take,
        skip,
        orderBy: [{ title: 'asc' }],
      }),
      prisma.creditCard.count({ where }),
    ])

    return NextResponse.json({ items, total, allowedDepartments })
  } catch (e) {
    return safeErrorResponse(e, 'Failed to fetch credit cards')
  }
}

export async function POST(req: Request) {
  const rateLimitError = withRateLimit(req)
  if (rateLimitError) return rateLimitError

  try {
    const currentEmployeeId = await getCurrentEmployeeId()
    if (!currentEmployeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const deptRefs = await getDepartmentRefsForEmployee(currentEmployeeId)
    if (!deptRefs) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const allowedDepartments = getAllowedPasswordDepartments(deptRefs)

    const body = await req.json()
    const validation = validateBody(CreateCreditCardSchema, body)
    if (!validation.success) return validation.error

    const data = validation.data
    if (!data.department) {
      return NextResponse.json({ error: 'Department is required' }, { status: 400 })
    }

    if (!allowedDepartments.includes(data.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Derive last4 from cardNumber if provided
    const cardNumber = data.cardNumber?.replace(/\s+/g, '') ?? null
    let last4 = data.last4
    if (cardNumber && cardNumber.length >= 4) {
      last4 = cardNumber.slice(-4)
    }
    if (!last4) {
      return NextResponse.json({ error: 'Card number or last 4 digits is required' }, { status: 400 })
    }

    const card = await prisma.creditCard.create({
      data: {
        title: data.title,
        cardholderName: data.cardholderName ?? null,
        brand: data.brand,
        cardNumber,
        last4,
        cvv: data.cvv ?? null,
        expMonth: data.expMonth,
        expYear: data.expYear,
        department: data.department,
        url: data.url ?? null,
        notes: data.notes ?? null,
      },
    })

    return NextResponse.json(card, { status: 201 })
  } catch (e) {
    return safeErrorResponse(e, 'Failed to create credit card')
  }
}

