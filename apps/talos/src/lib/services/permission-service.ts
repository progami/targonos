import { getTenantPrisma } from '@/lib/tenant/server'
import { Permission, UserPermission, User, UserRole } from '@targon/prisma-talos'
import { NotFoundError, ValidationError } from '@/lib/api'

// Super admin emails - these users have all permissions automatically
const SUPER_ADMIN_EMAILS = ['jarrar@targonglobal.com']

// Baseline permissions by role (in addition to explicit user grants)
const STAFF_BASELINE_PERMISSIONS = new Set<string>([
  'po.create',
  'po.edit',
  'po.cancel',
  'fo.create',
  'fo.edit',
  'fo.stage',
])

function roleHasBaselinePermission(role: UserRole, permissionCode: string): boolean {
  if (role === UserRole.admin) {
    return permissionCode.startsWith('po.') || permissionCode.startsWith('fo.')
  }

  if (role === UserRole.staff) {
    return STAFF_BASELINE_PERMISSIONS.has(permissionCode)
  }

  return false
}

/**
 * Check if an email belongs to a super admin
 */
export function isSuperAdmin(email: string): boolean {
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase())
}

/**
 * Check if a user (by ID or email) is a super admin
 */
export async function checkSuperAdmin(userIdOrEmail: string): Promise<boolean> {
  // If it's an email format, check directly
  if (userIdOrEmail.includes('@')) {
    return isSuperAdmin(userIdOrEmail)
  }

  // Otherwise, look up the user by ID
  const prisma = await getTenantPrisma()
  const user = await prisma.user.findUnique({
    where: { id: userIdOrEmail },
    select: { email: true },
  })

  if (!user) {
    return false
  }

  return isSuperAdmin(user.email)
}

/**
 * Get all available permissions
 */
export async function getAllPermissions(): Promise<Permission[]> {
  const prisma = await getTenantPrisma()
  return prisma.permission.findMany({
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })
}

/**
 * Get permissions by category
 */
export async function getPermissionsByCategory(
  category: string
): Promise<Permission[]> {
  const prisma = await getTenantPrisma()
  return prisma.permission.findMany({
    where: { category },
    orderBy: { name: 'asc' },
  })
}

/**
 * Get a specific permission by code
 */
export async function getPermissionByCode(
  code: string
): Promise<Permission | null> {
  const prisma = await getTenantPrisma()
  return prisma.permission.findUnique({
    where: { code },
  })
}

/**
 * Get all permissions granted to a user
 */
export async function getUserPermissions(userId: string): Promise<Permission[]> {
  const prisma = await getTenantPrisma()

  // First check if user is super admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })

  if (user && isSuperAdmin(user.email)) {
    // Super admins have all permissions
    return prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    })
  }

  // Get user's granted permissions
  const userPermissions = await prisma.userPermission.findMany({
    where: { userId },
    include: { permission: true },
  })

  return userPermissions.map((up) => up.permission)
}

/**
 * Get user permission records with metadata
 */
export async function getUserPermissionRecords(
  userId: string
): Promise<(UserPermission & { permission: Permission })[]> {
  const prisma = await getTenantPrisma()
  return prisma.userPermission.findMany({
    where: { userId },
    include: { permission: true },
    orderBy: { grantedAt: 'desc' },
  })
}

/**
 * Check if a user has a specific permission
 */
export async function hasPermission(
  userId: string,
  permissionCode: string
): Promise<boolean> {
  if (!userId) {
    return false
  }

  const prisma = await getTenantPrisma()

  // First check if user is super admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  })

  if (!user) {
    return false
  }

  if (isSuperAdmin(user.email)) {
    return true
  }

  if (roleHasBaselinePermission(user.role, permissionCode)) {
    return true
  }

  // Check if user has the specific permission
  const userPermission = await prisma.userPermission.findFirst({
    where: {
      userId,
      permission: { code: permissionCode },
    },
  })

  return !!userPermission
}

/**
 * Check if user has any of the specified permissions
 */
export async function hasAnyPermission(
  userId: string,
  permissionCodes: string[]
): Promise<boolean> {
  if (!userId) {
    return false
  }

  const prisma = await getTenantPrisma()

  // First check if user is super admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  })

  if (!user) {
    return false
  }

  if (isSuperAdmin(user.email)) {
    return true
  }

  if (permissionCodes.some((code) => roleHasBaselinePermission(user.role, code))) {
    return true
  }

  // Check if user has any of the permissions
  const userPermission = await prisma.userPermission.findFirst({
    where: {
      userId,
      permission: { code: { in: permissionCodes } },
    },
  })

  return !!userPermission
}

/**
 * Check if user has all of the specified permissions
 */
export async function hasAllPermissions(
  userId: string,
  permissionCodes: string[]
): Promise<boolean> {
  if (!userId) {
    return false
  }

  const prisma = await getTenantPrisma()

  // First check if user is super admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  })

  if (!user) {
    return false
  }

  if (isSuperAdmin(user.email)) {
    return true
  }

  const remaining = permissionCodes.filter((code) => !roleHasBaselinePermission(user.role, code))
  if (remaining.length === 0) {
    return true
  }

  // Count how many of the required permissions the user has
  const count = await prisma.userPermission.count({
    where: {
      userId,
      permission: { code: { in: remaining } },
    },
  })

  return count === remaining.length
}

/**
 * Grant a permission to a user (super admin only)
 */
export async function grantPermission(
  userId: string,
  permissionCode: string,
  grantedById: string
): Promise<UserPermission> {
  const prisma = await getTenantPrisma()

  // Verify the granter is a super admin
  const granter = await prisma.user.findUnique({
    where: { id: grantedById },
    select: { email: true },
  })

  if (!granter || !isSuperAdmin(granter.email)) {
    throw new ValidationError('Only super admins can grant permissions')
  }

  // Find the permission
  const permission = await prisma.permission.findUnique({
    where: { code: permissionCode },
  })

  if (!permission) {
    throw new NotFoundError(`Permission not found: ${permissionCode}`)
  }

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  })

  if (!user) {
    throw new NotFoundError(`User not found: ${userId}`)
  }

  // Grant the permission (upsert to handle duplicates)
  return prisma.userPermission.upsert({
    where: {
      userId_permissionId: {
        userId,
        permissionId: permission.id,
      },
    },
    update: {
      grantedById,
      grantedAt: new Date(),
    },
    create: {
      userId,
      permissionId: permission.id,
      grantedById,
    },
  })
}

/**
 * Revoke a permission from a user (super admin only)
 */
export async function revokePermission(
  userId: string,
  permissionCode: string,
  revokedById: string
): Promise<void> {
  const prisma = await getTenantPrisma()

  // Verify the revoker is a super admin
  const revoker = await prisma.user.findUnique({
    where: { id: revokedById },
    select: { email: true },
  })

  if (!revoker || !isSuperAdmin(revoker.email)) {
    throw new ValidationError('Only super admins can revoke permissions')
  }

  // Find the permission
  const permission = await prisma.permission.findUnique({
    where: { code: permissionCode },
  })

  if (!permission) {
    throw new NotFoundError(`Permission not found: ${permissionCode}`)
  }

  // Delete the user permission
  await prisma.userPermission.deleteMany({
    where: {
      userId,
      permissionId: permission.id,
    },
  })
}

/**
 * Get all users with a specific permission
 */
export async function getUsersWithPermission(
  permissionCode: string
): Promise<User[]> {
  const prisma = await getTenantPrisma()

  const permission = await prisma.permission.findUnique({
    where: { code: permissionCode },
    include: {
      users: {
        include: { user: true },
      },
    },
  })

  if (!permission) {
    return []
  }

  return permission.users.map((up) => up.user)
}

/**
 * Get all users grouped by their permissions
 */
export async function getAllUsersWithPermissions(): Promise<
  (User & { permissions: Permission[] })[]
> {
  const prisma = await getTenantPrisma()

  const users = await prisma.user.findMany({
    where: { isActive: true },
    include: {
      permissions: {
        include: { permission: true },
      },
    },
    orderBy: { fullName: 'asc' },
  })

  return users.map((user) => ({
    ...user,
    permissions: user.permissions.map((up) => up.permission),
  }))
}

// Stage transition permission codes
export const STAGE_TRANSITION_PERMISSIONS = {
  RFQ_TO_ISSUED: 'po.approve.draft_to_manufacturing',
  RFQ_TO_REJECTED: 'po.approve.draft_to_manufacturing',
  RFQ_TO_MANUFACTURING: 'po.approve.draft_to_manufacturing',
  ISSUED_TO_MANUFACTURING: 'po.approve.draft_to_manufacturing',
  REJECTED_TO_RFQ: 'po.approve.draft_to_manufacturing',
  // Legacy keys using DRAFT (pre-RFQ rename)
  DRAFT_TO_ISSUED: 'po.approve.draft_to_manufacturing',
  DRAFT_TO_REJECTED: 'po.approve.draft_to_manufacturing',
  DRAFT_TO_MANUFACTURING: 'po.approve.draft_to_manufacturing',
  REJECTED_TO_DRAFT: 'po.approve.draft_to_manufacturing',
  MANUFACTURING_TO_OCEAN: 'po.approve.manufacturing_to_ocean',
  OCEAN_TO_WAREHOUSE: 'po.approve.ocean_to_warehouse',
  WAREHOUSE_TO_SHIPPED: 'po.approve.warehouse_to_shipped',
} as const

/**
 * Check if user can approve a specific stage transition
 */
export async function canApproveStageTransition(
  userId: string,
  fromStatus: string,
  toStatus: string
): Promise<boolean> {
  const transitionKey = `${fromStatus}_TO_${toStatus}` as keyof typeof STAGE_TRANSITION_PERMISSIONS
  const permissionCode = STAGE_TRANSITION_PERMISSIONS[transitionKey]

  if (!permissionCode) {
    // Unknown transition - deny by default
    return false
  }

  return hasPermission(userId, permissionCode)
}
