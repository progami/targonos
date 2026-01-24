'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Check,
  ChevronDown,
  Search,
  Shield,
  ShieldCheck,
  User,
  X,
} from '@/lib/lucide-icons'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import { usePageState } from '@/lib/store/page-state'
import { toast } from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const PAGE_KEY = '/config/permissions'

interface Permission {
  id: string
  code: string
  name: string
  description: string | null
  category: string
}

interface UserWithPermissions {
  id: string
  email: string
  fullName: string | null
  role: string
  isActive: boolean
  isSuperAdmin: boolean
  permissions: Permission[]
}

export default function PermissionsPanel() {
  const pageState = usePageState(PAGE_KEY)
  const [users, setUsers] = useState<UserWithPermissions[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const searchTerm = pageState.search ?? ''
  const setSearchTerm = pageState.setSearch
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [savingPermission, setSavingPermission] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [usersResponse, permissionsResponse] = await Promise.all([
        fetchWithCSRF('/api/users'),
        fetchWithCSRF('/api/permissions'),
      ])

      if (!usersResponse.ok) throw new Error('Failed to load users')
      if (!permissionsResponse.ok) throw new Error('Failed to load permissions')

      const usersData = await usersResponse.json()
      const permissionsData = await permissionsResponse.json()

      setUsers(usersData.users || [])
      setPermissions(permissionsData.permissions || [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleTogglePermission = async (
    userId: string,
    permissionCode: string,
    hasPermission: boolean
  ) => {
    setSavingPermission(`${userId}-${permissionCode}`)
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
  }

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return users.filter((user) => {
      if (!user.isActive) return false
      if (!term) return true
      return (
        user.email.toLowerCase().includes(term) ||
        (user.fullName?.toLowerCase().includes(term) ?? false)
      )
    })
  }, [users, searchTerm])

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, Permission[]> = {}
    for (const perm of permissions) {
      if (!groups[perm.category]) {
        groups[perm.category] = []
      }
      groups[perm.category].push(perm)
    }
    return groups
  }, [permissions])

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      purchase_order: 'Purchase Order Approvals',
      user_management: 'User Management',
    }
    return labels[category] || category
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 px-6 py-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              <h2 className="text-xl font-semibold text-foreground">User Permissions</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Grant or revoke permissions for each user. Super admins have all permissions automatically.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-medium">
              {filteredUsers.length} users
            </Badge>
            <Badge className="bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800 font-medium">
              {permissions.length} permissions
            </Badge>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 md:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search users..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:focus:ring-cyan-900 transition-shadow"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-slate-200" />
                    <div className="flex-1">
                      <div className="h-4 w-32 rounded bg-slate-200" />
                      <div className="mt-2 h-3 w-48 rounded bg-slate-200" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <User className="h-10 w-10 text-slate-300 dark:text-slate-600" />
            <div>
              <p className="text-base font-semibold text-foreground">No users found</p>
              <p className="text-sm text-muted-foreground">
                Try adjusting your search term
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {filteredUsers.map((user) => {
              const isExpanded = expandedUserId === user.id
              const userPermissionCodes = new Set(user.permissions.map((p) => p.code))

              return (
                <div key={user.id} className="px-6 py-4">
                  <button
                    onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                    className="w-full flex items-center justify-between gap-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-semibold">
                        {(user.fullName || user.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">
                            {user.fullName || user.email}
                          </span>
                          {user.isSuperAdmin && (
                            <Badge className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 text-xs">
                              <ShieldCheck className="h-3 w-3 mr-1" />
                              Super Admin
                            </Badge>
                          )}
                          <Badge
                            className={
                              user.role === 'admin'
                                ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 text-xs'
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 text-xs'
                            }
                          >
                            {user.role}
                          </Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">{user.email}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {user.isSuperAdmin ? 'All permissions' : `${user.permissions.length} permissions`}
                      </span>
                      <ChevronDown
                        className={`h-5 w-5 text-muted-foreground transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-4 ml-13 pl-10 space-y-4">
                      {user.isSuperAdmin ? (
                        <p className="text-sm text-muted-foreground italic">
                          Super admins automatically have all permissions.
                        </p>
                      ) : (
                        Object.entries(groupedPermissions).map(([category, perms]) => (
                          <div key={category}>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                              {getCategoryLabel(category)}
                            </h4>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {perms.map((perm) => {
                                const hasPermission = userPermissionCodes.has(perm.code)
                                const isSaving = savingPermission === `${user.id}-${perm.code}`

                                return (
                                  <div
                                    key={perm.id}
                                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors ${
                                      hasPermission
                                        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20'
                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
                                    }`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-foreground truncate">
                                        {perm.name}
                                      </p>
                                      {perm.description && (
                                        <p className="text-xs text-muted-foreground truncate">
                                          {perm.description}
                                        </p>
                                      )}
                                    </div>
                                    <Button
                                      variant={hasPermission ? 'default' : 'outline'}
                                      size="sm"
                                      disabled={isSaving}
                                      onClick={() =>
                                        handleTogglePermission(user.id, perm.code, hasPermission)
                                      }
                                      className={
                                        hasPermission
                                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                          : ''
                                      }
                                    >
                                      {isSaving ? (
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                      ) : hasPermission ? (
                                        <>
                                          <Check className="h-4 w-4 mr-1" />
                                          Granted
                                        </>
                                      ) : (
                                        <>
                                          <X className="h-4 w-4 mr-1" />
                                          Grant
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
