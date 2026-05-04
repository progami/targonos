'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import { usePageState } from '@/lib/store/page-state'
import { UserPermissionDetail } from './user-permission-detail'
import { UserRoster } from './user-roster'
import {
  buildPermissionRows,
  filterPermissionUsers,
  getSelectedUserId,
  groupPermissionRows,
  summarizePermissionUsers,
  type PermissionCatalogItem,
  type PermissionFilter,
  type PermissionUser,
} from './view-model'

const PAGE_KEY = '/config/permissions'

interface PermissionsPayload {
  permissions: PermissionCatalogItem[]
}

interface UsersPayload {
  users: PermissionUser[]
}

function parseRole(value: unknown): PermissionUser['role'] {
  if (value === 'admin' || value === 'staff') return value
  throw new Error('Invalid user role')
}

function parsePermissionCatalogItem(value: unknown): PermissionCatalogItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid permission record')
  }

  const record = value as Record<string, unknown>

  if (
    typeof record.id !== 'string' ||
    typeof record.code !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.category !== 'string'
  ) {
    throw new Error('Invalid permission record')
  }

  let description: string | null
  if (record.description === null) {
    description = null
  } else if (typeof record.description === 'string') {
    description = record.description
  } else {
    throw new Error('Invalid permission description')
  }

  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description,
    category: record.category,
  }
}

function parsePermissionsPayload(value: unknown): PermissionsPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid permissions payload')
  }

  const record = value as Record<string, unknown>
  if (!Array.isArray(record.permissions)) {
    throw new Error('Invalid permissions payload')
  }

  return {
    permissions: record.permissions.map(parsePermissionCatalogItem),
  }
}

function parsePermissionUser(value: unknown): PermissionUser {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid user record')
  }

  const record = value as Record<string, unknown>

  if (
    typeof record.id !== 'string' ||
    typeof record.email !== 'string' ||
    typeof record.isActive !== 'boolean' ||
    typeof record.isSuperAdmin !== 'boolean' ||
    !Array.isArray(record.permissions)
  ) {
    throw new Error('Invalid user record')
  }

  let fullName: string | null
  if (record.fullName === null) {
    fullName = null
  } else if (typeof record.fullName === 'string') {
    fullName = record.fullName
  } else {
    throw new Error('Invalid user fullName')
  }

  return {
    id: record.id,
    email: record.email,
    fullName,
    role: parseRole(record.role),
    isActive: record.isActive,
    isSuperAdmin: record.isSuperAdmin,
    permissions: record.permissions.map(parsePermissionCatalogItem),
  }
}

function parseUsersPayload(value: unknown): UsersPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid users payload')
  }

  const record = value as Record<string, unknown>
  if (!Array.isArray(record.users)) {
    throw new Error('Invalid users payload')
  }

  return {
    users: record.users.map(parsePermissionUser),
  }
}

export default function PermissionsPanel() {
  const pageState = usePageState(PAGE_KEY)
  const [users, setUsers] = useState<PermissionUser[]>([])
  const [permissions, setPermissions] = useState<PermissionCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savingPermission, setSavingPermission] = useState<string | null>(null)
  const [filter, setFilter] = useState<PermissionFilter>('all')
  const [selectedUserIdState, setSelectedUserIdState] = useState<string | null>(null)
  const searchTerm = pageState.search ?? ''
  const setSearchTerm = pageState.setSearch

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    try {
      const [usersResponse, permissionsResponse] = await Promise.all([
        fetchWithCSRF('/api/users'),
        fetchWithCSRF('/api/permissions'),
      ])

      if (!usersResponse.ok) throw new Error('Failed to load users')
      if (!permissionsResponse.ok) throw new Error('Failed to load permissions')

      const usersPayload = parseUsersPayload(await usersResponse.json())
      const permissionsPayload = parsePermissionsPayload(await permissionsResponse.json())

      setUsers(usersPayload.users)
      setPermissions(permissionsPayload.permissions)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load permissions'
      setLoadError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredUsers = useMemo(
    () => filterPermissionUsers(users, searchTerm, filter),
    [filter, searchTerm, users]
  )

  const selectedUserId = useMemo(
    () => getSelectedUserId(filteredUsers, selectedUserIdState),
    [filteredUsers, selectedUserIdState]
  )

  const selectedUser = useMemo(
    () => filteredUsers.find((user) => user.id === selectedUserId) ?? null,
    [filteredUsers, selectedUserId]
  )

  const selectedRows = useMemo(
    () => (selectedUser ? buildPermissionRows(selectedUser, permissions) : []),
    [permissions, selectedUser]
  )

  const groups = useMemo(() => groupPermissionRows(selectedRows), [selectedRows])
  const summary = useMemo(() => summarizePermissionUsers(users), [users])
  const baselineCount = selectedRows.filter((row) => row.source === 'baseline').length
  const directCount = selectedRows.filter((row) => row.source === 'direct').length

  const handleTogglePermission = useCallback(
    async (userId: string, permissionCode: string, hasPermission: boolean) => {
      setSavingPermission(`${userId}:${permissionCode}`)

      try {
        if (hasPermission) {
          const response = await fetchWithCSRF(
            `/api/users/${userId}/permissions/${encodeURIComponent(permissionCode)}`,
            { method: 'DELETE' }
          )
          if (!response.ok) throw new Error('Failed to revoke permission')
          toast.success('Permission revoked')
        } else {
          const response = await fetchWithCSRF(`/api/users/${userId}/permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissionCode }),
          })
          if (!response.ok) throw new Error('Failed to grant permission')
          toast.success('Permission granted')
        }

        await loadData()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to update permission')
      } finally {
        setSavingPermission(null)
      }
    },
    [loadData]
  )

  if (loading) {
    return <div className="py-8 text-sm text-slate-500 dark:text-slate-400">Loading permissions</div>
  }

  if (loadError) {
    return (
      <div className="flex min-h-[320px] flex-col items-start justify-center gap-4">
        <div className="text-sm text-rose-600 dark:text-rose-400">{loadError}</div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 dark:border-slate-700 dark:text-slate-100 dark:hover:border-slate-600"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[640px] flex-col gap-4">
      <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-4 dark:border-slate-700/70 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Manage baseline access and direct overrides without leaving the user roster.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
          <span>{summary.userCount} users</span>
          <span>{summary.overrideCount} overrides</span>
          <span>{summary.superAdminCount} super admin</span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <UserRoster
          users={filteredUsers}
          searchTerm={searchTerm}
          filter={filter}
          selectedUserId={selectedUserId}
          onSearchTermChange={setSearchTerm}
          onFilterChange={setFilter}
          onSelectUser={setSelectedUserIdState}
        />

        <UserPermissionDetail
          user={selectedUser}
          groups={groups}
          baselineCount={baselineCount}
          directCount={directCount}
          savingPermission={savingPermission}
          onGrant={(permissionCode) => {
            if (!selectedUser) return
            void handleTogglePermission(selectedUser.id, permissionCode, false)
          }}
          onRevoke={(permissionCode) => {
            if (!selectedUser) return
            void handleTogglePermission(selectedUser.id, permissionCode, true)
          }}
        />
      </div>
    </div>
  )
}
