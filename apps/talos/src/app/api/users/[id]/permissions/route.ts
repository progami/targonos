import { NextRequest } from 'next/server'
import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import {
  getUserPermissions,
  getUserPermissionRecords,
  grantPermission,
} from '@/lib/services/permission-service'
import { isPortalPlatformAdmin } from '@/lib/tenant/session'

/**
 * GET /api/users/[id]/permissions
 * Get permissions for a specific user
 */
export const GET = withAuthAndParams(
  async (_request: NextRequest, params, session) => {
    const userId =
      typeof params?.id === 'string'
        ? params.id
        : Array.isArray(params?.id)
          ? params?.id?.[0]
          : undefined

    if (!userId) {
      return ApiResponses.badRequest('User ID is required')
    }

    // Users can view their own permissions, super admins can view anyone's
    const isSelf = userId === session.user.id
    const isAdmin = isPortalPlatformAdmin(session)

    if (!isSelf && !isAdmin) {
      return ApiResponses.forbidden('You can only view your own permissions')
    }

    try {
      const permissions = await getUserPermissions(userId)
      const records = isAdmin ? await getUserPermissionRecords(userId) : []

      return ApiResponses.success({
        userId,
        permissions: permissions.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description,
          category: p.category,
        })),
        // Include grant metadata for admins
        records: isAdmin
          ? records.map((r) => ({
              permissionId: r.permissionId,
              permissionCode: r.permission.code,
              permissionName: r.permission.name,
              grantedAt: r.grantedAt.toISOString(),
              grantedById: r.grantedById,
            }))
          : undefined,
      })
    } catch (error) {
      return ApiResponses.handleError(error)
    }
  }
)

const GrantPermissionSchema = z.object({
  permissionCode: z.string().min(1),
})

/**
 * POST /api/users/[id]/permissions
 * Grant a permission to a user (super admin only)
 */
export const POST = withAuthAndParams(
  async (request: NextRequest, params, session) => {
    const userId =
      typeof params?.id === 'string'
        ? params.id
        : Array.isArray(params?.id)
          ? params?.id?.[0]
          : undefined

    if (!userId) {
      return ApiResponses.badRequest('User ID is required')
    }

    // Only super admins can grant permissions
    if (!isPortalPlatformAdmin(session)) {
      return ApiResponses.forbidden('Only super admins can grant permissions')
    }

    const payload = await request.json().catch(() => null)
    const result = GrantPermissionSchema.safeParse(payload)

    if (!result.success) {
      return ApiResponses.badRequest('Permission code is required')
    }

    try {
      const userPermission = await grantPermission(
        userId,
        result.data.permissionCode,
        session.user.id
      )

      return ApiResponses.success({
        message: 'Permission granted successfully',
        userPermission: {
          id: userPermission.id,
          userId: userPermission.userId,
          permissionId: userPermission.permissionId,
          grantedAt: userPermission.grantedAt.toISOString(),
        },
      })
    } catch (error) {
      return ApiResponses.handleError(error)
    }
  }
)
