import { prisma } from './prisma'
import { FIELD_PERMISSIONS, getEmployeeFieldOwnership, type AttributePermission } from './employee/field-ownership'

export { FIELD_PERMISSIONS, getEmployeeFieldOwnership }
export type { AttributePermission }

// Permission levels: Super Admin > HR > Manager > Employee
export const PermissionLevel = {
  SUPER_ADMIN: 100,
  HR: 75,
  MANAGER: 50,
  EMPLOYEE: 0,
} as const

export const HR_ROLE_NAMES = ['HR', 'HR_ADMIN', 'HR Admin', 'Human Resources']

export type PermissionCheckResult = {
  canManage: boolean
  reason?: string
}

type UserPermissionInfo = {
  id: string
  isSuperAdmin: boolean
  permissionLevel: number
  hasHRRole: boolean
  isHR: boolean
  isHROrAbove: boolean
}

// Single query helper to get user permission info
async function getUserPermissionInfo(userId: string): Promise<UserPermissionInfo | null> {
  const user = await prisma.employee.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isSuperAdmin: true,
      permissionLevel: true,
      roles: {
        where: { name: { in: HR_ROLE_NAMES } },
        select: { name: true },
      },
    },
  })

  if (!user) return null

  const permissionLevel = user.permissionLevel ?? 0
  const hasHRRole = (user.roles?.length ?? 0) > 0
  const isHRFromPermissionLevel =
    permissionLevel >= PermissionLevel.HR && permissionLevel < PermissionLevel.SUPER_ADMIN
  const isHR = isHRFromPermissionLevel || hasHRRole
  const isHROrAbove = user.isSuperAdmin || isHR

  return {
    id: user.id,
    isSuperAdmin: user.isSuperAdmin,
    permissionLevel,
    hasHRRole,
    isHR,
    isHROrAbove,
  }
}

// Check if user is HR or Super Admin
export async function isHROrAbove(userId: string): Promise<boolean> {
  const info = await getUserPermissionInfo(userId)
  return info?.isHROrAbove ?? false
}

// Check if user is HR (does not include Super Admin)
export async function isHR(userId: string): Promise<boolean> {
  const info = await getUserPermissionInfo(userId)
  return info?.isHR ?? false
}

// Check if user is Super Admin
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await prisma.employee.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  })
  return user?.isSuperAdmin ?? false
}

// Get employee's management chain (managers up to root)
export async function getManagerChain(employeeId: string): Promise<string[]> {
  const chain: string[] = []
  let currentId: string | null = employeeId
  const visited = new Set<string>()

  while (currentId) {
    if (visited.has(currentId)) break
    visited.add(currentId)

    const emp: { reportsToId: string | null } | null = await prisma.employee.findUnique({
      where: { id: currentId },
      select: { reportsToId: true },
    })

    if (emp?.reportsToId) {
      chain.push(emp.reportsToId)
      currentId = emp.reportsToId
    } else {
      currentId = null
    }
  }

  return chain
}

// Get all employee IDs in the subtree under a manager
export async function getSubtreeEmployeeIds(managerId: string): Promise<string[]> {
  const subtree: string[] = []
  const queue: string[] = [managerId]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    const directReports = await prisma.employee.findMany({
      where: { reportsToId: currentId },
      select: { id: true },
    })

    for (const report of directReports) {
      subtree.push(report.id)
      queue.push(report.id)
    }
  }

  return subtree
}

export async function getOrgVisibleEmployeeIds(actorId: string): Promise<string[]> {
  const [managerChain, subtree] = await Promise.all([
    getManagerChain(actorId),
    getSubtreeEmployeeIds(actorId),
  ])

  return Array.from(new Set([actorId, ...managerChain, ...subtree]))
}

export async function canViewEmployeeDirectory(actorId: string, targetEmployeeId: string): Promise<boolean> {
  if (actorId === targetEmployeeId) return true

  const actor = await getUserPermissionInfo(actorId)
  if (!actor) return false

  if (actor.isHROrAbove) return true

  const visibleIds = await getOrgVisibleEmployeeIds(actorId)
  return visibleIds.includes(targetEmployeeId)
}

// Check if actor is in the management chain above target
export async function isManagerOf(actorId: string, targetEmployeeId: string): Promise<boolean> {
  if (actorId === targetEmployeeId) return false
  const managerChain = await getManagerChain(targetEmployeeId)
  return managerChain.includes(actorId)
}

// Check if a user can manage an employee
export async function canManageEmployee(
  currentUserId: string,
  targetEmployeeId: string
): Promise<PermissionCheckResult> {
  if (currentUserId === targetEmployeeId) {
    return { canManage: false, reason: 'Cannot manage yourself' }
  }

  const targetEmployee = await prisma.employee.findUnique({
    where: { id: targetEmployeeId },
    select: { id: true, reportsToId: true, departmentId: true },
  })

  if (!targetEmployee) {
    return { canManage: false, reason: 'Employee not found' }
  }

  const actor = await getUserPermissionInfo(currentUserId)
  if (!actor) {
    return { canManage: false, reason: 'Actor not found' }
  }

  if (actor.isSuperAdmin) return { canManage: true, reason: 'Super Admin' }
  if (actor.isHROrAbove) return { canManage: true, reason: 'HR' }

  // Direct manager check
  if (targetEmployee.reportsToId === currentUserId) {
    return { canManage: true, reason: 'Direct manager' }
  }

  // Check management chain
  if (await isManagerOf(currentUserId, targetEmployeeId)) {
    return { canManage: true, reason: 'In management chain' }
  }

  // Department head check
  if (targetEmployee.departmentId) {
    const department = await prisma.department.findUnique({
      where: { id: targetEmployee.departmentId },
      select: { headId: true },
    })
    if (department?.headId === currentUserId) {
      return { canManage: true, reason: 'Department head' }
    }
  }

  return { canManage: false, reason: 'No management relationship' }
}

// Get all employees that a user can manage
export async function getManageableEmployees(currentUserId: string) {
  const actor = await getUserPermissionInfo(currentUserId)
  const manageableEmployeeSelect = {
    id: true,
    employeeId: true,
    firstName: true,
    lastName: true,
    email: true,
    avatar: true,
    department: true,
    position: true,
  } as const

  // HR/Admin can manage all employees except self
  if (actor?.isHROrAbove) {
    return prisma.employee.findMany({
      where: { id: { not: currentUserId }, status: 'ACTIVE' },
      select: manageableEmployeeSelect,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })
  }

  // Get direct reports
  const directReports = await prisma.employee.findMany({
    where: { reportsToId: currentUserId, status: 'ACTIVE' },
    select: manageableEmployeeSelect,
  })

  const allReports = new Map<string, typeof directReports[0]>()
  for (const report of directReports) {
    allReports.set(report.id, report)
  }

  // BFS to find indirect reports
  const queue = directReports.map((r) => r.id)
  while (queue.length > 0) {
    const managerId = queue.shift()!
    const indirectReports = await prisma.employee.findMany({
      where: { reportsToId: managerId, status: 'ACTIVE' },
      select: manageableEmployeeSelect,
    })
    for (const report of indirectReports) {
      if (!allReports.has(report.id)) {
        allReports.set(report.id, report)
        queue.push(report.id)
      }
    }
  }

  // Add employees from departments led by user
  const ledDepartments = await prisma.department.findMany({
    where: { headId: currentUserId },
    select: { id: true },
  })

  if (ledDepartments.length > 0) {
    const deptEmployees = await prisma.employee.findMany({
      where: {
        departmentId: { in: ledDepartments.map((d) => d.id) },
        id: { not: currentUserId },
        status: 'ACTIVE',
      },
      select: manageableEmployeeSelect,
    })
    for (const emp of deptEmployees) {
      allReports.set(emp.id, emp)
    }
  }

  return Array.from(allReports.values()).sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
  )
}

// Check if user can edit a specific field on target employee
export async function canEditField(
  actorId: string,
  targetEmployeeId: string,
  fieldName: string
): Promise<{ allowed: boolean; reason?: string }> {
  const permission = FIELD_PERMISSIONS[fieldName]

  if (!permission) {
    // SECURITY FIX: Unknown fields default to DENY instead of ALLOW
    // This prevents new sensitive fields from being editable until explicitly configured
    return { allowed: false, reason: 'Unknown field - permission not configured' }
  }

  if (permission === 'GOOGLE_CONTROLLED') {
    const ownership = getEmployeeFieldOwnership(fieldName)
    return {
      allowed: false,
      reason: ownership?.lockedReason ?? 'This field is managed by the system',
    }
  }

  const actor = await getUserPermissionInfo(actorId)
  if (!actor) {
    return { allowed: false, reason: 'Actor not found' }
  }

  // Self-editing disabled unless HR/SuperAdmin
  if (actorId === targetEmployeeId && !actor.isHROrAbove) {
    return { allowed: false, reason: 'Self-editing is disabled. Contact HR for changes.' }
  }

  if (permission === 'USER_EDITABLE') {
    if (actor.isHROrAbove || (await isManagerOf(actorId, targetEmployeeId))) {
      return { allowed: true }
    }
    return { allowed: false, reason: 'Only HR or your manager can edit this field' }
  }

  if (permission === 'MANAGER_EDITABLE') {
    if (actor.isHROrAbove) {
      return { allowed: true }
    }
    return { allowed: false, reason: 'Only HR and Super Admin can edit this field' }
  }

  return { allowed: false, reason: 'Permission denied' }
}

// Check if reassignment would create a cycle
async function checkWouldCreateCycle(targetEmployeeId: string, newManagerId: string): Promise<boolean> {
  const subtree = await getSubtreeEmployeeIds(targetEmployeeId)
  return subtree.includes(newManagerId)
}

// Check if actor can reassign target employee to a new manager
export async function canReassignEmployee(
  actorId: string,
  targetEmployeeId: string,
  newManagerId: string | null
): Promise<{ allowed: boolean; reason?: string }> {
  const actor = await getUserPermissionInfo(actorId)
  if (!actor) {
    return { allowed: false, reason: 'Actor not found' }
  }

  // Super admin can reassign anyone (but still check for cycles)
  if (actor.isSuperAdmin) {
    if (newManagerId) {
      const wouldCreateCycle = await checkWouldCreateCycle(targetEmployeeId, newManagerId)
      if (wouldCreateCycle) {
        return { allowed: false, reason: 'This reassignment would create a cycle in the hierarchy' }
      }
    }
    return { allowed: true }
  }

  // Non-super-admins cannot reassign themselves
  if (actorId === targetEmployeeId) {
    return { allowed: false, reason: 'You cannot reassign yourself' }
  }

  // Check if actor is above target in hierarchy
  const isAboveTarget = await isManagerOf(actorId, targetEmployeeId)
  if (!isAboveTarget) {
    const isTargetAboveActor = await isManagerOf(targetEmployeeId, actorId)
    if (isTargetAboveActor) {
      return { allowed: false, reason: 'You cannot reassign your own manager' }
    }
    return { allowed: false, reason: 'You can only reassign employees who report to you' }
  }

  if (newManagerId && newManagerId !== actorId) {
    const isAboveNewManager = await isManagerOf(actorId, newManagerId)
    if (!isAboveNewManager) {
      return { allowed: false, reason: 'You can only reassign employees to managers within your team' }
    }
  }

  if (newManagerId) {
    const wouldCreateCycle = await checkWouldCreateCycle(targetEmployeeId, newManagerId)
    if (wouldCreateCycle) {
      return { allowed: false, reason: 'This reassignment would create a cycle in the hierarchy' }
    }
  }

  return { allowed: true }
}

// Filter update payload to only include fields the actor can edit
export async function filterAllowedFields(
  actorId: string,
  targetEmployeeId: string,
  updateData: Record<string, unknown>
): Promise<{ allowed: Record<string, unknown>; denied: { field: string; reason: string }[] }> {
  const allowed: Record<string, unknown> = {}
  const denied: { field: string; reason: string }[] = []

  for (const [field, value] of Object.entries(updateData)) {
    const result = await canEditField(actorId, targetEmployeeId, field)
    if (result.allowed) {
      allowed[field] = value
    } else {
      denied.push({ field, reason: result.reason || 'Permission denied' })
    }
  }

  return { allowed, denied }
}

// Check if user can raise a violation for an employee
export async function canRaiseViolation(
  actorId: string,
  targetEmployeeId: string
): Promise<{ allowed: boolean; reason?: string }> {
  if (actorId === targetEmployeeId) {
    return { allowed: false, reason: 'Cannot raise violation against yourself' }
  }

  const actor = await getUserPermissionInfo(actorId)
  if (!actor) {
    return { allowed: false, reason: 'Actor not found' }
  }

  if (actor.isSuperAdmin) return { allowed: true, reason: 'Super Admin' }
  if (actor.isHROrAbove) return { allowed: true, reason: 'HR' }

  if (await isManagerOf(actorId, targetEmployeeId)) {
    return { allowed: true, reason: 'Manager of employee' }
  }

  return { allowed: false, reason: 'You can only raise violations for employees who report to you' }
}

// Check if user can do HR-level review
export async function canHRReview(actorId: string): Promise<{ allowed: boolean; reason?: string }> {
  const actor = await getUserPermissionInfo(actorId)
  if (!actor) {
    return { allowed: false, reason: 'Actor not found' }
  }

  if (actor.isHR) return { allowed: true, reason: 'HR' }

  return { allowed: false, reason: 'Only HR can perform this action' }
}

// Check if user can do final approval (Super Admin only)
export async function canFinalApprove(actorId: string): Promise<{ allowed: boolean; reason?: string }> {
  const actor = await prisma.employee.findUnique({
    where: { id: actorId },
    select: { isSuperAdmin: true },
  })

  if (actor?.isSuperAdmin) {
    return { allowed: true, reason: 'Super Admin' }
  }

  return { allowed: false, reason: 'Only Super Admin can perform final approval' }
}

// Get all HR employees
export async function getHREmployees(): Promise<{ id: string; email: string; firstName: string }[]> {
  return prisma.employee.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { permissionLevel: { gte: PermissionLevel.HR, lt: PermissionLevel.SUPER_ADMIN } },
        { roles: { some: { name: { in: HR_ROLE_NAMES } } } },
      ],
    },
    select: { id: true, email: true, firstName: true },
  })
}

// Get all Super Admin employees
export async function getSuperAdminEmployees(): Promise<{ id: string; email: string; firstName: string }[]> {
  return prisma.employee.findMany({
    where: { status: 'ACTIVE', isSuperAdmin: true },
    select: { id: true, email: true, firstName: true },
  })
}

// Get all employees authorized to report violations for a target employee
export async function getAuthorizedReporters(targetEmployeeId: string): Promise<{
  id: string
  employeeId: string
  firstName: string
  lastName: string
  position: string
}[]> {
  const reporters = new Map<string, {
    id: string
    employeeId: string
    firstName: string
    lastName: string
    position: string
  }>()

  const selectFields = {
    id: true,
    employeeId: true,
    firstName: true,
    lastName: true,
    position: true,
  }

  // Get Super Admins
  const superAdmins = await prisma.employee.findMany({
    where: { status: 'ACTIVE', isSuperAdmin: true, id: { not: targetEmployeeId } },
    select: selectFields,
  })
  for (const emp of superAdmins) reporters.set(emp.id, emp)

  // Get HR employees
  const hrEmployees = await prisma.employee.findMany({
    where: {
      status: 'ACTIVE',
      id: { not: targetEmployeeId },
      OR: [
        { permissionLevel: { gte: PermissionLevel.HR, lt: PermissionLevel.SUPER_ADMIN } },
        { roles: { some: { name: { in: HR_ROLE_NAMES } } } },
      ],
    },
    select: selectFields,
  })
  for (const emp of hrEmployees) reporters.set(emp.id, emp)

  // Get managers in chain
  const managerChain = await getManagerChain(targetEmployeeId)
  if (managerChain.length > 0) {
    const managers = await prisma.employee.findMany({
      where: { id: { in: managerChain }, status: 'ACTIVE' },
      select: selectFields,
    })
    for (const emp of managers) reporters.set(emp.id, emp)
  }

  return Array.from(reporters.values()).sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
  )
}
