'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ColumnDef } from '@tanstack/react-table'
import { EmployeesApi, type Employee } from '@/lib/api-client'
import { ListPageHeader } from '@/components/ui/PageHeader'
import { DataTable } from '@/components/ui/DataTable'
import { ResultsCount } from '@/components/ui/table'
import { UsersIcon } from '@/components/ui/Icons'
import { TableEmptyContent } from '@/components/ui/EmptyState'
import { Avatar } from '@/components/ui/avatar'
import { StatusBadge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/select'
import { ensureMe } from '@/lib/store/me'

function fullName(emp: Pick<Employee, 'firstName' | 'lastName'>) {
  return `${emp.firstName} ${emp.lastName}`.trim()
}

export function EmployeesClientPage() {
  const router = useRouter()
  const [items, setItems] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<{ isHR: boolean; isSuperAdmin: boolean } | null>(null)
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ON_LEAVE' | 'TERMINATED' | 'RESIGNED' | 'ALL'>('ACTIVE')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await EmployeesApi.list({ status: statusFilter === 'ALL' ? undefined : statusFilter })
      setItems(data.items)
    } catch (e) {
      console.error('Failed to load employees', e)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    ensureMe()
      .then((me) => {
        if (cancelled) return
        setMe({ isHR: Boolean(me.isHR), isSuperAdmin: Boolean(me.isSuperAdmin) })
      })
      .catch(() => {
        if (cancelled) return
        setMe(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const columns = useMemo<ColumnDef<Employee>[]>(
    () => [
      {
        accessorKey: 'employeeId',
        header: 'Employee',
        cell: ({ row }) => {
          const emp = row.original
          return (
            <div className="flex items-center gap-3">
              <Avatar src={emp.avatar} alt={fullName(emp)} size="sm" />
              <div className="min-w-0">
                <div className="font-medium text-foreground truncate">{fullName(emp)}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {emp.employeeId} • {emp.email}
                </div>
              </div>
            </div>
          )
        },
        enableSorting: true,
      },
      {
        accessorFn: (row) => row.department ?? row.dept?.name ?? '',
        id: 'department',
        header: 'Department',
        cell: ({ getValue }) => {
          const value = getValue<string>()
          return <span className="text-muted-foreground">{value || '—'}</span>
        },
        enableSorting: true,
      },
      {
        accessorKey: 'position',
        header: 'Role',
        cell: ({ getValue }) => {
          const value = getValue<string>()
          return <span className="text-muted-foreground">{value || '—'}</span>
        },
        enableSorting: true,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue<string>()
          return <StatusBadge status={status} />
        },
        enableSorting: true,
      },
    ],
    []
  )

  const handleRowClick = useCallback(
    (employee: Employee) => {
      router.push(`/employees/${employee.id}`)
    },
    [router]
  )

  return (
    <>
      <ListPageHeader
        title="Employees"
        description="Click on a row to view employee profile."
        icon={<UsersIcon className="h-6 w-6 text-white" />}
        showBack
      />

      <div className="space-y-6">
        {me?.isHR || me?.isSuperAdmin ? (
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium text-foreground">Status</div>
            <NativeSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="ACTIVE">Active</option>
              <option value="ON_LEAVE">On leave</option>
              <option value="RESIGNED">Resigned</option>
              <option value="TERMINATED">Terminated</option>
              <option value="ALL">All</option>
            </NativeSelect>
          </div>
        ) : null}

        <ResultsCount count={items.length} singular="employee" plural="employees" loading={loading} />

        <DataTable
          columns={columns}
          data={items}
          initialSorting={[{ id: 'employeeId', desc: false }]}
          loading={loading}
          skeletonRows={6}
          onRowClick={handleRowClick}
          emptyState={
            <TableEmptyContent
              icon={<UsersIcon className="h-10 w-10" />}
              title="No employees found"
            />
          }
        />
      </div>
    </>
  )
}
