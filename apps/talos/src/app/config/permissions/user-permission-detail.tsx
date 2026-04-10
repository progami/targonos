'use client'

import { Button } from '@/components/ui/button'
import type { PermissionRowGroup, PermissionUser } from './view-model'

interface UserPermissionDetailProps {
  user: PermissionUser | null
  groups: PermissionRowGroup[]
  baselineCount: number
  directCount: number
  savingPermission: string | null
  onGrant: (permissionCode: string) => void
  onRevoke: (permissionCode: string) => void
}

const CATEGORY_LABELS: Record<string, string> = {
  purchase_order: 'Purchase Orders',
  user_management: 'User Management',
}

function getCategoryLabel(category: string) {
  const label = CATEGORY_LABELS[category]
  if (label) return label

  return category
    .split('_')
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

export function UserPermissionDetail({
  user,
  groups,
  baselineCount,
  directCount,
  savingPermission,
  onGrant,
  onRevoke,
}: UserPermissionDetailProps) {
  if (!user) {
    return (
      <section className="flex min-h-[320px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        No matching users
      </section>
    )
  }

  return (
    <section className="flex min-h-0 flex-col gap-6">
      <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-4 dark:border-slate-700/70 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
            {user.fullName ?? user.email}
          </h2>
          <div className="mt-1 text-sm lowercase text-slate-500 dark:text-slate-400">{user.role}</div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {user.isSuperAdmin ? (
            <>
              <span className="rounded-full border border-slate-200 px-3 py-1 dark:border-slate-700">
                super admin
              </span>
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300">
                all permissions
              </span>
            </>
          ) : (
            <>
              <span className="rounded-full border border-slate-200 px-3 py-1 dark:border-slate-700">
                {baselineCount} baseline
              </span>
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300">
                {directCount} direct
              </span>
            </>
          )}
        </div>
      </header>

      {groups.map((group) => (
        <div key={group.category}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            {getCategoryLabel(group.category)}
          </h3>

          <div className="divide-y divide-slate-200/80 dark:divide-slate-700/70">
            {group.rows.map((row) => {
              const isSaving = savingPermission === `${user.id}:${row.code}`

              return (
                <div
                  key={row.code}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-950 dark:text-slate-50">
                      {row.code}
                    </div>
                  </div>

                  <span className="text-xs lowercase text-slate-500 dark:text-slate-400">
                    {row.source}
                  </span>

                  {row.action === 'grant' ? (
                    <Button size="sm" onClick={() => onGrant(row.code)} disabled={isSaving}>
                      {isSaving ? 'Saving' : 'Grant'}
                    </Button>
                  ) : row.action === 'revoke' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRevoke(row.code)}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving' : 'Revoke'}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled>
                      {row.action === 'readonly' ? 'All' : 'Locked'}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
