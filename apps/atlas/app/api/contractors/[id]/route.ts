import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withRateLimit, validateBody, safeErrorResponse } from '@/lib/api-helpers'
import { getCurrentEmployeeId } from '@/lib/current-user'
import { getAllowedDepartmentStrings, getDepartmentRefsForEmployee, hasExecutiveAccess } from '@/lib/department-access'
import { prisma } from '@/lib/prisma'

const ContractorStatusEnum = z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'TERMINATED'])

const UpdateContractorSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  company: z.string().max(200).trim().optional().nullable(),
  email: z.string().email().max(200).trim().optional().nullable(),
  phone: z.string().max(50).trim().optional().nullable(),
  role: z.string().max(200).trim().optional().nullable(),
  department: z.string().max(200).trim().optional().nullable(),
  hourlyRate: z.number().min(0).optional().nullable(),
  currency: z.string().max(10).trim().optional(),
  contractStart: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid contractStart' })
    .optional()
    .nullable(),
  contractEnd: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid contractEnd' })
    .optional()
    .nullable(),
  status: ContractorStatusEnum.optional(),
  address: z.string().max(500).trim().optional().nullable(),
  city: z.string().max(100).trim().optional().nullable(),
  country: z.string().max(100).trim().optional().nullable(),
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

    const isExecutive = hasExecutiveAccess(deptRefs)
    const allowedDepartments = getAllowedDepartmentStrings(deptRefs)

    const { id } = await params
    const contractor = await prisma.contractor.findUnique({ where: { id } })

    if (!contractor) {
      return NextResponse.json({ error: 'Contractor not found' }, { status: 404 })
    }

    // Executives can access all contractors
    if (
      !isExecutive &&
      contractor.department &&
      contractor.department.length &&
      !allowedDepartments.some((d) => d.toLowerCase() === contractor.department!.toLowerCase())
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(contractor)
  } catch (e) {
    return safeErrorResponse(e, 'Failed to fetch contractor')
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

    const isExecutive = hasExecutiveAccess(deptRefs)
    const allowedDepartments = getAllowedDepartmentStrings(deptRefs)

    const { id } = await params
    const existing = await prisma.contractor.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Contractor not found' }, { status: 404 })
    }

    // Executives can update all contractors
    if (
      !isExecutive &&
      existing.department &&
      existing.department.length &&
      !allowedDepartments.some((d) => d.toLowerCase() === existing.department!.toLowerCase())
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const validation = validateBody(UpdateContractorSchema, body)
    if (!validation.success) return validation.error

    const data = validation.data
    const departmentUpdate =
      data.department === undefined ? undefined : data.department && data.department.length ? data.department : null

    // Executives can update to any department
    if (
      !isExecutive &&
      departmentUpdate &&
      !allowedDepartments.some((d) => d.toLowerCase() === departmentUpdate.toLowerCase())
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const contractor = await prisma.contractor.update({
      where: { id },
      data: {
        name: data.name,
        company: data.company,
        email: data.email,
        phone: data.phone,
        role: data.role,
        department: departmentUpdate,
        hourlyRate: data.hourlyRate,
        currency: data.currency,
        contractStart: data.contractStart !== undefined
          ? (data.contractStart ? new Date(data.contractStart) : null)
          : undefined,
        contractEnd: data.contractEnd !== undefined
          ? (data.contractEnd ? new Date(data.contractEnd) : null)
          : undefined,
        status: data.status,
        address: data.address,
        city: data.city,
        country: data.country,
        notes: data.notes,
      },
    })

    return NextResponse.json(contractor)
  } catch (e) {
    return safeErrorResponse(e, 'Failed to update contractor')
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

    const isExecutive = hasExecutiveAccess(deptRefs)
    const allowedDepartments = getAllowedDepartmentStrings(deptRefs)

    const { id } = await params
    const existing = await prisma.contractor.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Contractor not found' }, { status: 404 })
    }

    // Executives can delete all contractors
    if (
      !isExecutive &&
      existing.department &&
      existing.department.length &&
      !allowedDepartments.some((d) => d.toLowerCase() === existing.department!.toLowerCase())
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.contractor.delete({ where: { id } })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return safeErrorResponse(e, 'Failed to delete contractor')
  }
}
