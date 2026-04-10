import { hasRoleBaselinePermission, type TalosPermissionRole } from '@/lib/permissions/baseline'

export type PermissionFilter = 'all' | 'admins' | 'staff' | 'overrides'
export type PermissionSource = 'direct' | 'baseline' | 'off' | 'all'
export type PermissionAction = 'grant' | 'revoke' | 'locked' | 'readonly'

export interface PermissionCatalogItem {
  id: string
  code: string
  name: string
  description: string | null
  category: string
}

export interface PermissionUser {
  id: string
  email: string
  fullName: string | null
  role: TalosPermissionRole
  isActive: boolean
  isSuperAdmin: boolean
  permissions: readonly PermissionCatalogItem[]
}

export interface PermissionRowModel extends PermissionCatalogItem {
  source: PermissionSource
  action: PermissionAction
}

export interface PermissionRowGroup {
  category: string
  rows: PermissionRowModel[]
}

export function filterPermissionUsers(
  users: readonly PermissionUser[],
  searchTerm: string,
  filter: PermissionFilter
): PermissionUser[] {
  const normalizedSearch = searchTerm.trim().toLowerCase()

  return users.filter((user) => {
    if (filter === 'admins' && user.role !== 'admin') return false
    if (filter === 'staff' && user.role !== 'staff') return false
    if (filter === 'overrides' && user.permissions.length === 0 && !user.isSuperAdmin) return false

    if (normalizedSearch.length === 0) return true

    return (
      user.email.toLowerCase().includes(normalizedSearch) ||
      (user.fullName?.toLowerCase().includes(normalizedSearch) ?? false)
    )
  })
}

export function getSelectedUserId(
  users: readonly PermissionUser[],
  selectedUserId: string | null
): string | null {
  if (users.length === 0) return null
  if (selectedUserId && users.some((user) => user.id === selectedUserId)) return selectedUserId
  return users[0].id
}

export function buildPermissionRows(
  user: PermissionUser,
  catalog: readonly PermissionCatalogItem[]
): PermissionRowModel[] {
  const directPermissionCodes = new Set(user.permissions.map((permission) => permission.code))

  return catalog.map((permission) => {
    if (user.isSuperAdmin) {
      return { ...permission, source: 'all', action: 'readonly' }
    }

    if (directPermissionCodes.has(permission.code)) {
      return { ...permission, source: 'direct', action: 'revoke' }
    }

    if (hasRoleBaselinePermission(user.role, permission.code)) {
      return { ...permission, source: 'baseline', action: 'locked' }
    }

    return { ...permission, source: 'off', action: 'grant' }
  })
}

export function groupPermissionRows(rows: readonly PermissionRowModel[]): PermissionRowGroup[] {
  const groups = new Map<string, PermissionRowModel[]>()

  for (const row of rows) {
    const categoryRows = groups.get(row.category)
    if (categoryRows) {
      categoryRows.push(row)
      continue
    }

    groups.set(row.category, [row])
  }

  return Array.from(groups.entries()).map(([category, categoryRows]) => ({
    category,
    rows: categoryRows,
  }))
}

export function summarizePermissionUsers(users: readonly PermissionUser[]) {
  return {
    userCount: users.length,
    overrideCount: users.reduce((count, user) => count + user.permissions.length, 0),
    superAdminCount: users.filter((user) => user.isSuperAdmin).length,
  }
}
