import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withRateLimit, validateBody, safeErrorResponse } from '@/lib/api-helpers'
import { getCurrentEmployeeId } from '@/lib/current-user'
import { getAllowedDepartmentStrings, getDepartmentRefsForEmployee } from '@/lib/department-access'
import { prisma } from '@/lib/prisma'

const ContractorStatusEnum = z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'TERMINATED'])

const CreateContractorSchema = z.object({
  name: z.string().min(1).max(200).trim(),
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

    const allowedDepartments = getAllowedDepartmentStrings(deptRefs)

    const { searchParams } = new URL(req.url)
    const takeRaw = searchParams.get('take')
    const skipRaw = searchParams.get('skip')
    const statusRaw = searchParams.get('status')
    const q = searchParams.get('q')

    const take = Math.min(parseInt(takeRaw ?? '50', 10), 100)
    const skip = parseInt(skipRaw ?? '0', 10)

    const accessOr = [
      { department: null },
      { department: '' },
      ...allowedDepartments.map((d) => ({ department: { equals: d, mode: 'insensitive' as const } })),
    ]

    const where: any = { AND: [{ OR: accessOr }] }

    if (statusRaw) {
      const parsed = ContractorStatusEnum.safeParse(statusRaw.toUpperCase())
      if (parsed.success) where.AND.push({ status: parsed.data })
    }

    if (q) {
      where.AND.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { company: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { role: { contains: q, mode: 'insensitive' } },
        ],
      })
    }

    const [items, total] = await Promise.all([
      prisma.contractor.findMany({
        where,
        take,
        skip,
        orderBy: [{ name: 'asc' }],
      }),
      prisma.contractor.count({ where }),
    ])

    return NextResponse.json({ items, total })
  } catch (e) {
    return safeErrorResponse(e, 'Failed to fetch contractors')
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

    const allowedDepartments = getAllowedDepartmentStrings(deptRefs)

    const body = await req.json()
    const validation = validateBody(CreateContractorSchema, body)
    if (!validation.success) return validation.error

    const data = validation.data
    const department = data.department?.trim()

    // Require department to prevent orphan contractors visible to everyone
    if (!department) {
      return NextResponse.json({ error: 'Department is required' }, { status: 400 })
    }

    if (!allowedDepartments.some((d) => d.toLowerCase() === department.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const departmentValue = department

    const contractor = await prisma.contractor.create({
      data: {
        name: data.name,
        company: data.company ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        role: data.role ?? null,
        department: departmentValue,
        hourlyRate: data.hourlyRate ?? null,
        currency: data.currency ?? 'USD',
        contractStart: data.contractStart ? new Date(data.contractStart) : null,
        contractEnd: data.contractEnd ? new Date(data.contractEnd) : null,
        status: data.status ?? 'ACTIVE',
        address: data.address ?? null,
        city: data.city ?? null,
        country: data.country ?? null,
        notes: data.notes ?? null,
      },
    })

    return NextResponse.json(contractor, { status: 201 })
  } catch (e) {
    return safeErrorResponse(e, 'Failed to create contractor')
  }
}
