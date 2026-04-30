export type TalosPermissionRole = 'admin' | 'staff'

const STAFF_BASELINE_PERMISSION_CODES = new Set<string>([
  'inbound.create',
  'inbound.edit',
  'inbound.cancel',
  'outbound.create',
  'outbound.edit',
  'outbound.stage',
])

export function hasRoleBaselinePermission(
  role: TalosPermissionRole,
  permissionCode: string
): boolean {
  switch (role) {
    case 'admin':
      return ['inbound.', 'outbound.'].some((prefix) => permissionCode.startsWith(prefix))
    case 'staff':
      return STAFF_BASELINE_PERMISSION_CODES.has(permissionCode)
  }
}
