import { NextResponse } from 'next/server'
import prisma from '../../../../lib/prisma'
import { UpdateEmployeeSchema } from '@/lib/validations'
import { withRateLimit, validateBody, safeErrorResponse } from '@/lib/api-helpers'
import { EmploymentType, EmployeeStatus } from '@/lib/atlas-prisma-types'
import { checkAndNotifyMissingFields } from '@/lib/notification-service'
import { getCurrentEmployeeId } from '@/lib/current-user'
import { canReassignEmployee, canViewEmployeeDirectory, filterAllowedFields, isHROrAbove, isSuperAdmin } from '@/lib/permissions'

type EmployeeRouteContext = { params: Promise<{ id: string }> }

const UNASSIGNED_DEPARTMENT_NAME = 'Unassigned'

export async function GET(req: Request, context: EmployeeRouteContext) {
  // Rate limiting
  const rateLimitError = withRateLimit(req)
  if (rateLimitError) return rateLimitError

  try {
    const { id } = await context.params

    if (!id || id.length > 100) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const actorId = await getCurrentEmployeeId()
    if (!actorId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isHR = await isHROrAbove(actorId)

    // First resolve the canonical employee ID (route param can be cuid or employeeId)
    const base = await prisma.employee.findFirst({
      where: { OR: [{ id }, { employeeId: id }] },
      select: {
        id: true,
        status: true,
      },
    })

    if (!base) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isSelf = actorId === base.id

    // Non-HR users can only view ACTIVE employees (except themselves).
    if (!isHR && !isSelf && base.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const canView = await canViewEmployeeDirectory(actorId, base.id)
    if (!canView) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const canViewPersonal = isSelf || isHR
    const canViewComp = isHR

    const e = await prisma.employee.findUnique({
      where: { id: base.id },
      select: {
        // Always-safe directory fields
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        avatar: true,
        department: true,
        departmentId: true,
        dept: { select: { id: true, name: true } },
        position: true,
        employmentType: true,
        joinDate: true,
        status: true,
        region: true,
        reportsToId: true,
        manager: { select: { id: true, firstName: true, lastName: true, position: true } },
        departments: { include: { department: { select: { id: true, name: true } } } },

        // Personal info (self/HR only)
        ...(canViewPersonal ? {
          dateOfBirth: true,
          gender: true,
          maritalStatus: true,
          nationality: true,
          address: true,
          city: true,
          country: true,
          postalCode: true,
          emergencyContact: true,
          emergencyPhone: true,
        } : {}),

        // Compensation/admin fields (HR only)
        // SECURITY FIX: Removed googleId from response - it should only be used internally for sync
        ...(canViewComp ? {
          salary: true,
          currency: true,
          permissionLevel: true,
          isSuperAdmin: true,
        } : {}),
      },
    })

    if (!e) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(e)
  } catch (e) {
    return safeErrorResponse(e, 'Failed to fetch employee')
  }
}

export async function PATCH(req: Request, context: EmployeeRouteContext) {
  // Rate limiting
  const rateLimitError = withRateLimit(req)
  if (rateLimitError) return rateLimitError

  try {
    const { id } = await context.params

    if (!id || id.length > 100) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    // Get current user for permission checks
    const actorId = await getCurrentEmployeeId()
    if (!actorId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (actorId === id) {
      const canEditSelf = await isHROrAbove(actorId)
      if (!canEditSelf) {
        return NextResponse.json({ error: 'Self-editing is disabled. Contact HR for changes.' }, { status: 403 })
      }
    }

    const body = await req.json()

    // Validate input with whitelist schema
    const validation = validateBody(UpdateEmployeeSchema, body)
    if (!validation.success) {
      return validation.error
    }

    const rawData = validation.data

    // Filter fields based on permissions
    const { allowed: data, denied } = await filterAllowedFields(actorId, id, rawData)

    // If all fields were denied, return error
    if (Object.keys(data).length === 0 && denied.length > 0) {
      return NextResponse.json({
        error: 'Permission denied',
        deniedFields: denied,
      }, { status: 403 })
    }

    // Special check for hierarchy changes
    if (rawData.reportsToId !== undefined) {
      const reassignCheck = await canReassignEmployee(actorId, id, rawData.reportsToId)
      if (!reassignCheck.allowed) {
        return NextResponse.json({
          error: reassignCheck.reason,
        }, { status: 403 })
      }
      // If allowed, include reportsToId in data
      data.reportsToId = rawData.reportsToId
    }

    const departmentName = (data.department ?? data.departmentName) as string | undefined
    const roles = data.roles as string[] | undefined

    // Get current employee data to detect hierarchy changes
    const currentEmployee = await prisma.employee.findUnique({
      where: { id },
      select: { reportsToId: true }
    })
    const oldManagerId = currentEmployee?.reportsToId ?? null

    // Build update object with explicit field whitelist
    const updates: Record<string, unknown> = {}

    if (data.firstName !== undefined) {
      updates.firstName = data.firstName
      // Auto-set local override flag when name is manually updated
      updates.nameLocalOverride = true
    }
    if (data.lastName !== undefined) {
      updates.lastName = data.lastName
      // Auto-set local override flag when name is manually updated
      updates.nameLocalOverride = true
    }
    if (data.email !== undefined) updates.email = data.email
    if (data.phone !== undefined) updates.phone = data.phone
    if (data.position !== undefined) {
      updates.position = data.position
      // Auto-set local override flag when position is manually updated
      updates.positionLocalOverride = true
    }
    if (data.employmentType !== undefined) updates.employmentType = data.employmentType as EmploymentType
    if (data.status !== undefined) updates.status = data.status as EmployeeStatus
    if (data.region !== undefined) updates.region = data.region
    if (data.joinDate !== undefined) updates.joinDate = new Date(data.joinDate as string)

    // Hierarchy - use manager relation instead of reportsToId directly
    if (data.reportsToId !== undefined) {
      if (data.reportsToId) {
        updates.manager = { connect: { id: data.reportsToId } }
      } else {
        updates.manager = { disconnect: true }
      }
    }

    // Personal info
    if (data.dateOfBirth !== undefined) updates.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth as string) : null
    if (data.gender !== undefined) updates.gender = data.gender
    if (data.maritalStatus !== undefined) updates.maritalStatus = data.maritalStatus
    if (data.nationality !== undefined) updates.nationality = data.nationality
    if (data.address !== undefined) updates.address = data.address
    if (data.city !== undefined) updates.city = data.city
    if (data.country !== undefined) updates.country = data.country
    if (data.postalCode !== undefined) updates.postalCode = data.postalCode
    if (data.emergencyContact !== undefined) updates.emergencyContact = data.emergencyContact
    if (data.emergencyPhone !== undefined) updates.emergencyPhone = data.emergencyPhone

    // Salary
    if (data.salary !== undefined) updates.salary = data.salary
    if (data.currency !== undefined) updates.currency = data.currency

    // Handle department relationship
    if (departmentName) {
      updates.department = departmentName
      // Auto-set local override flag when department is manually updated
      updates.departmentLocalOverride = true
      if (departmentName === UNASSIGNED_DEPARTMENT_NAME) {
        updates.dept = { disconnect: true }
      } else {
        updates.dept = {
          connectOrCreate: {
            where: { name: departmentName },
            create: { name: departmentName },
          },
        }
      }
    }

    // Handle roles relationship
    if (roles !== undefined && Array.isArray(roles)) {
      updates.roles = {
        set: [],
        connectOrCreate: roles.map((name) => ({
          where: { name },
          create: { name },
        })),
      }
    }

    const e = await prisma.employee.update({
      where: { id },
      data: updates,
      include: { roles: true, dept: true, manager: { select: { id: true, firstName: true, lastName: true, position: true } } },
    })

    // Re-check profile completion after update
    await checkAndNotifyMissingFields(id)

    // Check if hierarchy changed and publish event
    const newManagerId = e.reportsToId ?? null
    if (data.reportsToId !== undefined && oldManagerId !== newManagerId) {
      await prisma.notification.create({
        data: {
          type: 'HIERARCHY_CHANGED',
          title: 'Reporting Structure Changed',
          message: e.manager
            ? `You now report to ${e.manager.firstName} ${e.manager.lastName}.`
            : 'Your reporting structure has been updated.',
          link: `/employees/${e.id}`,
          employeeId: e.id,
          relatedId: e.id,
          relatedType: 'EMPLOYEE',
        },
      })

      if (e.manager) {
        await prisma.notification.create({
          data: {
            type: 'HIERARCHY_CHANGED',
            title: 'New Team Member',
            message: `${e.firstName} ${e.lastName} now reports to you.`,
            link: `/employees/${e.id}`,
            employeeId: e.manager.id,
            relatedId: e.id,
            relatedType: 'EMPLOYEE',
          },
        })
      }
    }

    return NextResponse.json(e)
  } catch (e) {
    return safeErrorResponse(e, 'Failed to update employee')
  }
}

export async function DELETE(req: Request, context: EmployeeRouteContext) {
  // Rate limiting
  const rateLimitError = withRateLimit(req)
  if (rateLimitError) return rateLimitError

  try {
    const { id } = await context.params

    if (!id || id.length > 100) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    // Security: Only super-admin can remove employees
    const actorId = await getCurrentEmployeeId()
    if (!actorId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const isAdmin = await isSuperAdmin(actorId)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Only super admin can remove employees' }, { status: 403 })
    }

    // Resolve canonical employee ID (route param can be cuid or employeeId).
    const base = await prisma.employee.findFirst({
      where: { OR: [{ id }, { employeeId: id }] },
      select: { id: true, reportsToId: true },
    })

    if (!base) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Prevent self-removal
    if (actorId === base.id) {
      return NextResponse.json({ error: 'Cannot remove your own account' }, { status: 400 })
    }

    // "Remove" means offboard: keep history, hide from all ACTIVE-only views.
    // Also repair reporting lines + department ownership so org structures don't end up orphaned.
    await prisma.$transaction(async (tx) => {
      await tx.department.updateMany({
        where: { headId: base.id },
        data: { headId: null },
      })

      await tx.employee.updateMany({
        where: { reportsToId: base.id, status: 'ACTIVE' },
        data: { reportsToId: base.reportsToId },
      })

      await tx.employee.update({
        where: { id: base.id },
        data: { status: 'RESIGNED' as EmployeeStatus, reportsToId: null },
      })
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return safeErrorResponse(e, 'Failed to delete employee')
  }
}
