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

const UpdatePasswordSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  username: z.string().max(200).trim().optional().nullable(),
  password: z.string().min(1).max(500).optional(),
  url: z.string().max(500).trim().optional().nullable(),
  department: PasswordDepartmentEnum.optional(),
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
    const password = await prisma.password.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    })

    if (!password) {
      return NextResponse.json({ error: 'Password not found' }, { status: 404 })
    }

    if (!allowedDepartments.includes(password.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(password)
  } catch (e) {
    return safeErrorResponse(e, 'Failed to fetch password')
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
    const existing = await prisma.password.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Password not found' }, { status: 404 })
    }

    if (!allowedDepartments.includes(existing.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const validation = validateBody(UpdatePasswordSchema, body)
    if (!validation.success) return validation.error

    const data = validation.data
    if (data.department && !allowedDepartments.includes(data.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const password = await prisma.password.update({
      where: { id },
      data: {
        title: data.title,
        username: data.username,
        password: data.password,
        url: data.url,
        department: data.department,
        notes: data.notes,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    })

    return NextResponse.json(password)
  } catch (e) {
    return safeErrorResponse(e, 'Failed to update password')
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
    const existing = await prisma.password.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Password not found' }, { status: 404 })
    }

    if (!allowedDepartments.includes(existing.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.password.delete({ where: { id } })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return safeErrorResponse(e, 'Failed to delete password')
  }
}
