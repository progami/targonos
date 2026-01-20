'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ColumnDef } from '@tanstack/react-table'
import { MeApi, TasksApi, type Me, type Task } from '@/lib/api-client'
import { CheckCircleIcon, PlusIcon } from '@/components/ui/Icons'
import { ListPageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { DataTable } from '@/components/ui/DataTable'
import { ResultsCount } from '@/components/ui/table'
import { TableEmptyContent } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/badge'

const CATEGORY_LABELS: Record<string, string> = {
  GENERAL: 'General',
  CASE: 'Case',
  POLICY: 'Policy',
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function TasksPage() {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [items, setItems] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<'mine' | 'all'>('mine')

  const canSeeAllTasks = Boolean(me?.isHR || me?.isSuperAdmin)

  useEffect(() => {
    let cancelled = false
    MeApi.get()
      .then((data) => {
        if (cancelled) return
        setMe(data)
      })
      .catch(() => {
        if (cancelled) return
        setMe(null)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!canSeeAllTasks && scope === 'all') {
      setScope('mine')
    }
  }, [canSeeAllTasks, scope])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await TasksApi.list({ scope })
      setItems(data.items)
    } catch (e) {
      console.error('Failed to load tasks', e)
      setItems([])
      setError(e instanceof Error ? e.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => {
    load()
  }, [load])

  const columns = useMemo<ColumnDef<Task>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{row.original.title}</p>
            {row.original.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {row.original.description}
              </p>
            )}
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
        enableSorting: true,
      },
      {
        accessorKey: 'category',
        header: 'Category',
        cell: ({ getValue }) => {
          const category = getValue<string>()
          return (
            <span className="text-muted-foreground">
              {CATEGORY_LABELS[category] ?? category}
            </span>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'dueDate',
        header: 'Due',
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{formatDate(getValue<string>())}</span>
        ),
        enableSorting: true,
      },
    ],
    []
  )

  const handleRowClick = useCallback(
    (task: Task) => {
      router.push(`/tasks/${task.id}`)
    },
    [router]
  )

  return (
    <>
      <ListPageHeader
        title="Task List"
        description="Track tasks created for you and by you"
        icon={<CheckCircleIcon className="h-6 w-6 text-white" />}
        action={
          <Button href="/tasks/add" icon={<PlusIcon className="h-4 w-4" />}>
            Add Task
          </Button>
        }
      />

      <div className="space-y-6">
        {error ? (
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <Card padding="md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Work Queue is your inbox. Task List is the full list of tasks.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canSeeAllTasks ? (
                <div className="inline-flex rounded-lg border border-border bg-card p-1">
                  <button
                    type="button"
                    onClick={() => setScope('mine')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      scope === 'mine'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    My tasks
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      scope === 'all'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    All tasks
                  </button>
                </div>
              ) : null}

              <Button href="/work" variant="secondary">
                Work Queue
              </Button>
            </div>
          </div>
        </Card>

        <ResultsCount count={items.length} singular="task" plural="tasks" loading={loading} />

        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          skeletonRows={6}
          onRowClick={handleRowClick}
          addRow={{ label: 'Add Task', onClick: () => router.push('/tasks/add') }}
          emptyState={
            <TableEmptyContent
              icon={<CheckCircleIcon className="h-10 w-10" />}
              title="No tasks yet"
              description="Create a task to get started."
              action={{ label: 'Add Task', href: '/tasks/add' }}
            />
          }
        />
      </div>
    </>
  )
}
