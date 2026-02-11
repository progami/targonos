import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withRateLimit, safeErrorResponse, validateBody } from '@/lib/api-helpers'
import { getCurrentEmployeeId } from '@/lib/current-user'
import { isHROrAbove } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

const CandidateStatusEnum = z.enum([
  'APPLIED',
  'SCREENING',
  'INTERVIEWING',
  'OFFERED',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
])

const CreateCandidateSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  role: z.string().trim().max(200).optional().nullable(),
  status: CandidateStatusEnum.optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
})

export async function GET(req: Request) {
  const rateLimitError = withRateLimit(req)
  if (rateLimitError) return rateLimitError

  try {
    const actorId = await getCurrentEmployeeId()
    if (!actorId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasPermission = await isHROrAbove(actorId)
    if (!hasPermission) {
      return NextResponse.json({ error: 'Only HR or super admin can access hiring' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const takeRaw = searchParams.get('take')
    const skipRaw = searchParams.get('skip')
    const qRaw = searchParams.get('q')
    const statusRaw = searchParams.get('status')

    const take = Math.min(Number.parseInt(takeRaw ?? '50', 10), 100)
    const skip = Number.parseInt(skipRaw ?? '0', 10)
    const q = qRaw ? qRaw.trim() : ''

    const where: Record<string, unknown> = {}

    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { role: { contains: q, mode: 'insensitive' } },
      ]
    }

    if (statusRaw) {
      const parsed = CandidateStatusEnum.safeParse(statusRaw.toUpperCase())
      if (parsed.success) where.status = parsed.data
    }

    const now = new Date()

    const [items, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        take,
        skip,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          interviews: {
            where: { status: 'SCHEDULED', startAt: { gte: now } },
            orderBy: { startAt: 'asc' },
            take: 1,
            select: {
              id: true,
              title: true,
              interviewType: true,
              status: true,
              startAt: true,
              endAt: true,
              timeZone: true,
              meetingLink: true,
              googleEventId: true,
              googleHtmlLink: true,
            },
          },
        },
      }),
      prisma.candidate.count({ where }),
    ])

    return NextResponse.json({ items, total })
  } catch (e) {
    return safeErrorResponse(e, 'Failed to fetch candidates')
  }
}

export async function POST(req: Request) {
  const rateLimitError = withRateLimit(req)
  if (rateLimitError) return rateLimitError

  try {
    const actorId = await getCurrentEmployeeId()
    if (!actorId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasPermission = await isHROrAbove(actorId)
    if (!hasPermission) {
      return NextResponse.json({ error: 'Only HR or super admin can create candidates' }, { status: 403 })
    }

    const body = await req.json()
    const validation = validateBody(CreateCandidateSchema, body)
    if (!validation.success) return validation.error

    const data = validation.data
    const email = data.email ? data.email.toLowerCase() : null

    const candidate = await prisma.candidate.create({
      data: {
        fullName: data.fullName,
        email,
        phone: data.phone ?? null,
        role: data.role ?? null,
        status: data.status ?? 'APPLIED',
        notes: data.notes ?? null,
      },
    })

    return NextResponse.json(candidate, { status: 201 })
  } catch (e) {
    return safeErrorResponse(e, 'Failed to create candidate')
  }
}

