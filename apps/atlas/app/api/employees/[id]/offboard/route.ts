import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withRateLimit, safeErrorResponse } from '@/lib/api-helpers'
import { EmployeeStatus, ExitReason } from '@/lib/atlas-prisma-types'
import { getCurrentEmployeeId } from '@/lib/current-user'
import { isHROrAbove } from '@/lib/permissions'

type RouteContext = { params: Promise<{ id: string }> }

function buildOffboardingTasks(employee: {
  id: string
  firstName: string
  lastName: string
  email: string
}) {
  const encodedEmail = encodeURIComponent(employee.email)
  const name = `${employee.firstName} ${employee.lastName}`

  return [
    {
      title: `Offboarding: Confirm last day & handover — ${name}`,
      description: `Manager sign-off on ${name}'s last working day and handover plan. Ensure all responsibilities are documented and transitioned.`,
    },
    {
      title: `Offboarding: Reassign open work — ${name}`,
      description: `Transfer ${name}'s tasks, projects, and responsibilities to remaining team members.`,
    },
    {
      title: `Offboarding: Suspend Google Workspace account — ${name}`,
      description: `Suspend ${name}'s Google account (${employee.email}) in Google Admin Console. Do NOT delete — suspend first to preserve data.`,
      actionUrl: `https://admin.google.com/ac/users/${encodedEmail}`,
    },
    {
      title: `Offboarding: Revoke Portal & Atlas access — ${name}`,
      description: `Remove ${name}'s SSO entitlements in the Portal admin. Ensure they can no longer authenticate to Atlas or other internal apps.`,
      actionUrl: `/sso/admin`,
    },
    {
      title: `Offboarding: Recover assets — ${name}`,
      description: `Collect all company property from ${name}: laptop, badge, keys, parking pass, and any other equipment.`,
    },
    {
      title: `Offboarding: Archive & close — ${name}`,
      description: `Upload final documents (separation agreement, NDA, clearance form) to ${name}'s profile and confirm all offboarding steps are complete.`,
      actionUrl: `/atlas/employees/${employee.id}`,
    },
  ]
}

export async function POST(req: Request, context: RouteContext) {
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

    // Resolve canonical employee
    const employee = await prisma.employee.findFirst({
      where: { OR: [{ id }, { employeeId: id }] },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        reportsToId: true,
      },
    })

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    if (employee.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Employee is not active — cannot offboard' }, { status: 400 })
    }

    // Prevent self-offboarding
    if (actorId === employee.id) {
      return NextResponse.json({ error: 'Cannot offboard your own account' }, { status: 400 })
    }

    // Parse request body
    let exitReason: ExitReason | undefined
    let lastWorkingDay: Date | undefined
    let exitNotes: string | undefined
    let taskOwnerId: string | undefined
    let taskDueDate: Date | undefined

    try {
      const body = await req.json()
      if (body.exitReason) exitReason = body.exitReason as ExitReason
      if (body.lastWorkingDay) lastWorkingDay = new Date(body.lastWorkingDay)
      if (body.exitNotes) exitNotes = body.exitNotes
      if (body.taskOwnerId) taskOwnerId = body.taskOwnerId
      if (body.taskDueDate) taskDueDate = new Date(body.taskDueDate)
    } catch {
      // Body is optional
    }

    const targetId = employee.id
    const tasks = buildOffboardingTasks(employee)

    // Execute the full offboarding in a single transaction
    await prisma.$transaction(async (tx) => {
      // 1. Clear department head assignments
      await tx.department.updateMany({
        where: { headId: targetId },
        data: { headId: null },
      })

      // 2. Reassign direct reports to the employee's manager
      await tx.employee.updateMany({
        where: { reportsToId: targetId, status: 'ACTIVE' },
        data: { reportsToId: employee.reportsToId },
      })

      // 3. Update employee status to RESIGNED
      await tx.employee.update({
        where: { id: targetId },
        data: {
          status: 'RESIGNED' as EmployeeStatus,
          reportsToId: null,
          ...(exitReason ? { exitReason } : {}),
          ...(lastWorkingDay ? { lastWorkingDay } : {}),
          ...(exitNotes ? { exitNotes } : {}),
        },
      })

      // 4. Create offboarding tasks (single batch insert)
      await tx.task.createMany({
        data: tasks.map((t) => ({
          title: t.title,
          description: t.description,
          actionUrl: (t as { actionUrl?: string }).actionUrl ?? null,
          category: 'GENERAL' as const,
          status: 'OPEN' as const,
          createdById: actorId,
          assignedToId: taskOwnerId ?? actorId,
          subjectEmployeeId: targetId,
          dueDate: taskDueDate ?? null,
        })),
      })
    })

    // 5. SSO access revocation (non-blocking — after transaction)
    let ssoRevoked = false
    let ssoWarning: string | undefined

    try {
      const { getUserByEmail, removeManualUserAppGrant } = await import('@targon/auth/server')
      const portalUser = await getUserByEmail(employee.email)

      if (portalUser) {
        const appSlugs = Object.keys(portalUser.entitlements)
        if (appSlugs.length > 0) {
          const results = await Promise.allSettled(
            appSlugs.map((slug) => removeManualUserAppGrant(portalUser.id, slug))
          )
          const failures = results.filter((r) => r.status === 'rejected')
          if (failures.length === 0) {
            ssoRevoked = true
          } else {
            ssoWarning = `Revoked ${appSlugs.length - failures.length}/${appSlugs.length} app grants. ${failures.length} failed — manual revocation needed at /sso/admin.`
          }
        } else {
          ssoRevoked = true // No grants to revoke
        }
      } else {
        ssoWarning = 'No SSO account found for this email — no access to revoke.'
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      ssoWarning = `SSO revocation failed: ${msg}. Please revoke access manually at /sso/admin.`
      console.error('[offboard] SSO revocation error:', msg)
    }

    return NextResponse.json({
      ok: true,
      tasksCreated: tasks.length,
      ssoRevoked,
      ssoWarning,
    })
  } catch (e) {
    return safeErrorResponse(e, 'Failed to offboard employee')
  }
}
