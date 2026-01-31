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

const UpdateCreditCardSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  cardholderName: z.string().max(200).trim().optional().nullable(),
  brand: CreditCardBrandEnum.optional(),
  last4: z.string().regex(/^[0-9]{4}$/).optional(),
  expMonth: z.number().int().min(1).max(12).optional(),
  expYear: z.number().int().min(2000).max(2100).optional(),
  department: PasswordDepartmentEnum.optional(),
  url: z.string().max(500).trim().optional().nullable(),
  notes: z.string().max(2000).trim().optional().nullable(),
})

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params
    const card = await prisma.creditCard.findUnique({ where: { id } })

    if (!card) {
      return NextResponse.json({ error: 'Credit card not found' }, { status: 404 })
    }

    if (!allowedDepartments.includes(card.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(card)
  } catch (e) {
    return safeErrorResponse(e, 'Failed to fetch credit card')
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params
    const existing = await prisma.creditCard.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Credit card not found' }, { status: 404 })
    }

    if (!allowedDepartments.includes(existing.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const validation = validateBody(UpdateCreditCardSchema, body)
    if (!validation.success) return validation.error

    const data = validation.data
    if (data.department && !allowedDepartments.includes(data.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const card = await prisma.creditCard.update({
      where: { id },
      data: {
        title: data.title,
        cardholderName: data.cardholderName,
        brand: data.brand,
        last4: data.last4,
        expMonth: data.expMonth,
        expYear: data.expYear,
        department: data.department,
        url: data.url,
        notes: data.notes,
      },
    })

    return NextResponse.json(card)
  } catch (e) {
    return safeErrorResponse(e, 'Failed to update credit card')
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params
    const existing = await prisma.creditCard.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Credit card not found' }, { status: 404 })
    }

    if (!allowedDepartments.includes(existing.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.creditCard.delete({ where: { id } })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return safeErrorResponse(e, 'Failed to delete credit card')
  }
}

