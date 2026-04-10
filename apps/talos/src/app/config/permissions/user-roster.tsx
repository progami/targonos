'use client'

import { cn } from '@/lib/utils'
import type { PermissionFilter, PermissionUser } from './view-model'

interface UserRosterProps {
  users: PermissionUser[]
  searchTerm: string
  filter: PermissionFilter
  selectedUserId: string | null
  onSearchTermChange: (value: string) => void
  onFilterChange: (value: PermissionFilter) => void
  onSelectUser: (userId: string) => void
}

const FILTER_OPTIONS: Array<{ value: PermissionFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'admins', label: 'Admins' },
  { value: 'staff', label: 'Staff' },
  { value: 'overrides', label: 'Overrides' },
]

function getOverrideLabel(user: PermissionUser) {
  if (user.isSuperAdmin) return 'all'
  return String(user.permissions.length)
}

export function UserRoster({
  users,
  searchTerm,
  filter,
  selectedUserId,
  onSearchTermChange,
  onFilterChange,
  onSelectUser,
}: UserRosterProps) {
  return (
    <aside className="flex min-h-0 flex-col gap-3 border-b border-slate-200/80 pb-4 dark:border-slate-700/70 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
      <input
        value={searchTerm}
        onChange={(event) => onSearchTermChange(event.target.value)}
        placeholder="Search"
        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-cyan-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
      />

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onFilterChange(option.value)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition',
              filter === option.value
                ? 'border-slate-950 bg-slate-950 text-slate-50 dark:border-slate-50 dark:bg-slate-50 dark:text-slate-950'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-100'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 overflow-y-auto">
        {users.length === 0 ? (
          <div className="py-6 text-sm text-slate-500 dark:text-slate-400">No matching users</div>
        ) : (
          <div className="space-y-1">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => onSelectUser(user.id)}
                className={cn(
                  'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 py-3 text-left transition',
                  selectedUserId === user.id
                    ? 'bg-cyan-50 text-slate-950 dark:bg-cyan-950/40 dark:text-slate-50'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/80'
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{user.fullName ?? user.email}</div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{user.role}</div>
                </div>
                <div className="text-xs font-medium lowercase text-slate-500 dark:text-slate-400">
                  {getOverrideLabel(user)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
