import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withRateLimit, safeErrorResponse } from '@/lib/api-helpers'
import { getCurrentEmployeeId } from '@/lib/current-user'
import { isHROrAbove } from '@/lib/permissions'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: Request, context: RouteContext) {
  const rateLimitError = withRateLimit(req)
  if (rateLimitError) return rateLimitError

  try {
    const { id } = await context.params

    if (!id || id.length > 100) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const actorId = await getCurrentEmployeeId()
    if (!actorId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const hasPermission = await isHROrAbove(actorId)
    if (!hasPermission) {
      return NextResponse.json({ error: 'Only HR or super admin can offboard employees' }, { status: 403 })
    }

    // Resolve canonical employee ID
    const employee = await prisma.employee.findFirst({
      where: { OR: [{ id }, { employeeId: id }] },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        department: true,
        position: true,
        status: true,
      },
    })

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    if (employee.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Employee is not active' }, { status: 400 })
    }

    const eid = employee.id

    // Run all dependency checks in parallel
    const [
      openTasks,
      openCases,
      directReports,
      departmentsLed,
      projectsLed,
      pendingLeaveRequests,
      activeReviews,
      upcomingEvents,
    ] = await Promise.all([
      prisma.task.findMany({
        where: { assignedToId: eid, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        select: { id: true, title: true, status: true },
      }),
      prisma.case.findMany({
        where: {
          status: { in: ['OPEN', 'IN_REVIEW', 'ON_HOLD'] },
          OR: [{ subjectEmployeeId: eid }, { assignedToId: eid }],
        },
        select: { id: true, caseNumber: true, title: true, status: true },
      }),
      prisma.employee.findMany({
        where: { reportsToId: eid, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true, position: true },
      }),
      prisma.department.findMany({
        where: { headId: eid },
        select: { id: true, name: true },
      }),
      prisma.project.findMany({
        where: { leadId: eid, status: { in: ['PLANNING', 'ACTIVE', 'ON_HOLD'] } },
        select: { id: true, name: true, status: true },
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId: eid,
          status: { in: ['PENDING_MANAGER', 'PENDING_HR', 'PENDING_SUPER_ADMIN', 'PENDING'] },
        },
        select: { id: true, leaveType: true, startDate: true, endDate: true, status: true },
      }),
      prisma.performanceReview.findMany({
        where: {
          employeeId: eid,
          status: {
            in: [
              'NOT_STARTED',
              'IN_PROGRESS',
              'DRAFT',
              'PENDING_REVIEW',
              'PENDING_HR_REVIEW',
              'PENDING_SUPER_ADMIN',
              'PENDING_ACKNOWLEDGMENT',
            ],
          },
        },
        select: { id: true, reviewPeriod: true, reviewType: true, status: true },
      }),
      prisma.hRCalendarEvent.findMany({
        where: {
          employeeId: eid,
          startDate: { gte: new Date() },
        },
        select: { id: true, title: true, eventType: true, startDate: true },
      }),
    ])

    const warnings = {
      openTasks,
      openCases,
      directReports,
      departmentsLed,
      projectsLed,
      pendingLeaveRequests,
      activeReviews,
      upcomingEvents,
    }

    const hasWarnings = Object.values(warnings).some((arr) => arr.length > 0)

    return NextResponse.json({
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        department: employee.department,
        position: employee.position,
      },
      warnings,
      hasWarnings,
    })
  } catch (e) {
    return safeErrorResponse(e, 'Failed to run offboarding pre-flight checks')
  }
}
