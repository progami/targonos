import { NextRequest } from 'next/server'
import { withAuth, ApiResponses } from '@/lib/api'
import { getAllPermissions } from '@/lib/services/permission-service'
import { isPortalPlatformAdmin } from '@/lib/tenant/session'

/**
 * GET /api/permissions
 * List all available permissions (super admin only)
 */
export const GET = withAuth(async (_request: NextRequest, session) => {
  if (!isPortalPlatformAdmin(session)) {
    return ApiResponses.forbidden('Only super admins can view permissions')
  }

  try {
    const permissions = await getAllPermissions()

    // Group permissions by category
    const grouped = permissions.reduce(
      (acc, perm) => {
        if (!acc[perm.category]) {
          acc[perm.category] = []
        }
        acc[perm.category].push({
          id: perm.id,
          code: perm.code,
          name: perm.name,
          description: perm.description,
        })
        return acc
      },
      {} as Record<string, { id: string; code: string; name: string; description: string | null }[]>
    )

    return ApiResponses.success({
      permissions: permissions.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        category: p.category,
      })),
      grouped,
    })
  } catch (error) {
    return ApiResponses.handleError(error)
  }
})
