import { NextRequest } from 'next/server'
import { withAuth, ApiResponses } from '@/lib/api'
import {
  getAllUsersWithPermissions,
  isSuperAdmin,
} from '@/lib/services/permission-service'
import { isPortalPlatformAdmin } from '@/lib/tenant/session'

/**
 * GET /api/users
 * List all users with their permissions (super admin only)
 */
export const GET = withAuth(async (_request: NextRequest, session) => {
  if (!isPortalPlatformAdmin(session)) {
    return ApiResponses.forbidden('Only super admins can view all users')
  }

  try {
    const users = await getAllUsersWithPermissions()

    return ApiResponses.success({
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
        isSuperAdmin: isSuperAdmin(user.email),
        permissions: user.permissions.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          category: p.category,
        })),
      })),
    })
  } catch (error) {
    return ApiResponses.handleError(error)
  }
})
