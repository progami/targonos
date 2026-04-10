export type TalosPermissionRole = 'admin' | 'staff'

const STAFF_BASELINE_PERMISSION_CODES = new Set<string>([
  'po.create',
  'po.edit',
  'po.cancel',
  'fo.create',
  'fo.edit',
  'fo.stage',
])

export function hasRoleBaselinePermission(
  role: TalosPermissionRole,
  permissionCode: string
): boolean {
  switch (role) {
    case 'admin':
      return permissionCode.startsWith('po.') || permissionCode.startsWith('fo.')
    case 'staff':
      return STAFF_BASELINE_PERMISSION_CODES.has(permissionCode)
  }
}
