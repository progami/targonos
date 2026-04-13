import { NextRequest } from 'next/server'
import { withAuthAndParams, ApiResponses } from '@/lib/api'
import { revokePermission } from '@/lib/services/permission-service'
import { isPortalPlatformAdmin } from '@/lib/tenant/session'

/**
 * DELETE /api/users/[id]/permissions/[code]
 * Revoke a permission from a user (super admin only)
 */
export const DELETE = withAuthAndParams(
  async (_request: NextRequest, params, session) => {
    const userId =
      typeof params?.id === 'string'
        ? params.id
        : Array.isArray(params?.id)
          ? params?.id?.[0]
          : undefined

    const permissionCode =
      typeof params?.code === 'string'
        ? params.code
        : Array.isArray(params?.code)
          ? params?.code?.[0]
          : undefined

    if (!userId) {
      return ApiResponses.badRequest('User ID is required')
    }

    if (!permissionCode) {
      return ApiResponses.badRequest('Permission code is required')
    }

    // Only super admins can revoke permissions
    if (!isPortalPlatformAdmin(session)) {
      return ApiResponses.forbidden('Only super admins can revoke permissions')
    }

    try {
      // Decode the permission code (URL encoded)
      const decodedCode = decodeURIComponent(permissionCode)

      await revokePermission(userId, decodedCode, session.user.id)

      return ApiResponses.success({
        message: 'Permission revoked successfully',
        userId,
        permissionCode: decodedCode,
      })
    } catch (error) {
      return ApiResponses.handleError(error)
    }
  }
)
