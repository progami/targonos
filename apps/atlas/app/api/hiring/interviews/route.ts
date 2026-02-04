import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withRateLimit, safeErrorResponse, validateBody } from '@/lib/api-helpers'
import { getCurrentEmployeeId } from '@/lib/current-user'
import { isHROrAbove } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { createGoogleCalendarEvent, deleteGoogleCalendarEvent } from '@/lib/google-calendar'

const InterviewTypeEnum = z.enum(['PHONE_SCREEN', 'TECHNICAL', 'CULTURE', 'FINAL', 'OTHER'])
const InterviewStatusEnum = z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])

const ScheduleInterviewSchema = z.object({
  candidateFullName: z.string().trim().min(1).max(200),
  candidateEmail: z.string().trim().email(),
  candidatePhone: z.string().trim().max(50).optional().nullable(),
  candidateRole: z.string().trim().max(200).optional().nullable(),

  title: z.string().trim().min(1).max(200),
  interviewType: InterviewTypeEnum.default('OTHER'),
  startAt: z.string().trim().min(1),
  durationMinutes: z.coerce.number().int().min(15).max(480),
  timeZone: z.string().trim().min(1).max(100),
  location: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),

  interviewerEmployeeIds: z.array(z.string().trim().min(1)).min(1),
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
    const upcomingRaw = searchParams.get('upcoming')

    const take = Math.min(Number.parseInt(takeRaw ?? '50', 10), 100)
    const skip = Number.parseInt(skipRaw ?? '0', 10)
    const q = qRaw ? qRaw.trim() : ''
    const upcoming = upcomingRaw === 'true' ? true : upcomingRaw === '1'

    const where: Record<string, unknown> = {}

    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { candidate: { fullName: { contains: q, mode: 'insensitive' } } },
        { candidate: { email: { contains: q, mode: 'insensitive' } } },
      ]
    }

    if (statusRaw) {
      const parsed = InterviewStatusEnum.safeParse(statusRaw.toUpperCase())
      if (parsed.success) where.status = parsed.data
    }

    if (upcoming) {
      const now = new Date()
      where.startAt = { gte: now }
      where.status = 'SCHEDULED'
    }

    const [items, total] = await Promise.all([
      prisma.candidateInterview.findMany({
        where,
        take,
        skip,
        orderBy: { startAt: upcoming ? 'asc' : 'desc' },
        include: {
          candidate: true,
          interviewers: {
            include: {
              employee: {
                select: { id: true, employeeId: true, firstName: true, lastName: true, email: true, avatar: true },
              },
            },
          },
        },
      }),
      prisma.candidateInterview.count({ where }),
    ])

    return NextResponse.json({ items, total })
  } catch (e) {
    return safeErrorResponse(e, 'Failed to fetch interviews')
  }
}

export async function POST(req: Request) {
  const rateLimitError = withRateLimit(req)
  if (rateLimitError) return rateLimitError

  let googleEventId: string | null = null

  try {
    const actorId = await getCurrentEmployeeId()
    if (!actorId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const hasPermission = await isHROrAbove(actorId)
    if (!hasPermission) {
      return NextResponse.json({ error: 'Only HR or super admin can schedule interviews' }, { status: 403 })
    }

    const body = await req.json()
    const validation = validateBody(ScheduleInterviewSchema, body)
    if (!validation.success) return validation.error

    const data = validation.data

    const startAt = new Date(data.startAt)
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: 'Invalid start time' }, { status: 400 })
    }

    const endAt = new Date(startAt.getTime() + data.durationMinutes * 60_000)
    if (endAt.getTime() <= startAt.getTime()) {
      return NextResponse.json({ error: 'Invalid duration' }, { status: 400 })
    }

    const uniqueInterviewerIds = Array.from(new Set(data.interviewerEmployeeIds))

    const interviewerEmployees = await prisma.employee.findMany({
      where: { id: { in: uniqueInterviewerIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    })

    if (interviewerEmployees.length !== uniqueInterviewerIds.length) {
      return NextResponse.json({ error: 'One or more interviewers were not found' }, { status: 400 })
    }

    const candidateEmail = data.candidateEmail.toLowerCase()

    const attendees = [
      { email: candidateEmail, displayName: data.candidateFullName },
      ...interviewerEmployees.map((e) => ({
        email: e.email,
        displayName: `${e.firstName} ${e.lastName}`.trim(),
      })),
    ]

    const calendarEvent = await createGoogleCalendarEvent({
      summary: `${data.title} — ${data.candidateFullName}`,
      description: data.notes ?? null,
      startAt,
      endAt,
      timeZone: data.timeZone,
      attendees,
      location: data.location ?? null,
    })

    googleEventId = calendarEvent.googleEventId

    const created = await prisma.$transaction(async (tx) => {
      const candidate = await tx.candidate.upsert({
        where: { email: candidateEmail },
        update: {
          fullName: data.candidateFullName,
          phone: data.candidatePhone ?? null,
          role: data.candidateRole ?? null,
        },
        create: {
          fullName: data.candidateFullName,
          email: candidateEmail,
          phone: data.candidatePhone ?? null,
          role: data.candidateRole ?? null,
          status: 'INTERVIEWING',
        },
      })

      const interview = await tx.candidateInterview.create({
        data: {
          candidateId: candidate.id,
          title: data.title,
          interviewType: data.interviewType,
          status: 'SCHEDULED',
          startAt,
          endAt,
          timeZone: data.timeZone,
          location: data.location ?? null,
          meetingLink: calendarEvent.meetingLink,
          googleEventId: calendarEvent.googleEventId,
          googleHtmlLink: calendarEvent.htmlLink,
          notes: data.notes ?? null,
          createdById: actorId,
        },
      })

      await tx.candidateInterviewInterviewer.createMany({
        data: interviewerEmployees.map((e) => ({ interviewId: interview.id, employeeId: e.id })),
        skipDuplicates: true,
      })

      const hydrated = await tx.candidateInterview.findUnique({
        where: { id: interview.id },
        include: {
          candidate: true,
          interviewers: {
            include: {
              employee: {
                select: { id: true, employeeId: true, firstName: true, lastName: true, email: true, avatar: true },
              },
            },
          },
        },
      })

      if (!hydrated) throw new Error('Failed to load created interview')
      return hydrated
    })

    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    if (googleEventId) {
      try {
        await deleteGoogleCalendarEvent({ googleEventId })
      } catch {
        // best-effort cleanup only
      }
    }
    return safeErrorResponse(e, 'Failed to schedule interview')
  }
}

