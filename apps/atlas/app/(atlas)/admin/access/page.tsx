'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { AdminApi, type EmployeeAccess } from '@/lib/api-client'
import { LockClosedIcon, SearchIcon } from '@/components/ui/Icons'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Avatar } from '@/components/ui/avatar'
import { RoleBadge } from '@/components/ui/role-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default function AccessManagementPage() {
  const router = useRouter()
  const [employees, setEmployees] = useState<EmployeeAccess[]>([])
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [globalFilter, setGlobalFilter] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    loadEmployees()
  }, [])

  async function loadEmployees() {
    setLoading(true)
    setError(null)
    try {
      const data = await AdminApi.getAccessList()
      setEmployees(data.items)
      setCurrentUserId(data.currentUserId)
    } catch (e: any) {
      if (e.message?.includes('403') || e.message?.includes('Forbidden')) {
        router.replace('/')
        return
      }
      setError(e.message || 'Failed to load access list')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle(
    employeeId: string,
    field: 'isSuperAdmin' | 'isHR',
    newValue: boolean
  ) {
    setUpdating(employeeId)
    setError(null)
    try {
      await AdminApi.updateAccess(employeeId, { [field]: newValue })
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === employeeId ? { ...emp, [field]: newValue } : emp
        )
      )
      if (employeeId === currentUserId) {
        window.dispatchEvent(new Event('atlas:me-updated'))
      }
    } catch (e: any) {
      setError(e.message || 'Failed to update access')
    } finally {
      setUpdating(null)
    }
  }

  const columns = useMemo<ColumnDef<EmployeeAccess>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Employee',
        accessorFn: (row) => `${row.firstName} ${row.lastName}`,
        cell: ({ row }) => {
          const emp = row.original
          const fullName = `${emp.firstName} ${emp.lastName}`
          const isCurrentUser = emp.id === currentUserId
          return (
            <div className="flex items-center gap-3">
              <Avatar src={emp.avatar} alt={fullName} size="md" />
              <div>
                <div className="text-sm font-medium text-foreground">
                  {fullName}
                  {isCurrentUser && (
                    <span className="ml-2 text-xs text-accent">(You)</span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">{emp.position}</div>
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: 'department',
        header: 'Department',
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">
            {(getValue() as string) || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'isSuperAdmin',
        header: () => (
          <div className="flex justify-center">
            <RoleBadge role="SUPER_ADMIN" />
          </div>
        ),
        cell: ({ row }) => {
          const emp = row.original
          const isCurrentUser = emp.id === currentUserId
          const cannotRemoveOwn = isCurrentUser && emp.isSuperAdmin
          return (
            <div className="flex flex-col items-center gap-1">
              <Switch
                checked={emp.isSuperAdmin}
                onCheckedChange={(checked) =>
                  handleToggle(emp.id, 'isSuperAdmin', checked)
                }
                disabled={updating === emp.id || cannotRemoveOwn}
                aria-label={`Toggle Super Admin for ${emp.firstName} ${emp.lastName}`}
              />
              {cannotRemoveOwn && (
                <span className="text-xs text-muted-foreground">Cannot remove own</span>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'isHR',
        header: () => (
          <div className="flex justify-center">
            <RoleBadge role="HR" />
          </div>
        ),
        cell: ({ row }) => {
          const emp = row.original
          return (
            <div className="flex justify-center">
              <Switch
                checked={emp.isHR}
                onCheckedChange={(checked) => handleToggle(emp.id, 'isHR', checked)}
                disabled={updating === emp.id}
                aria-label={`Toggle HR for ${emp.firstName} ${emp.lastName}`}
              />
            </div>
          )
        },
      },
    ],
    [currentUserId, updating]
  )

  const table = useReactTable({
    data: employees,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = filterValue.toLowerCase()
      const emp = row.original
      return (
        emp.firstName.toLowerCase().includes(search) ||
        emp.lastName.toLowerCase().includes(search) ||
        emp.email.toLowerCase().includes(search) ||
        emp.department?.toLowerCase().includes(search) ||
        emp.position.toLowerCase().includes(search)
      )
    },
  })

  if (loading) {
    return (
      <>
        <PageHeader
          title="Access Management"
          description="Manage system roles and permissions"
          icon={<LockClosedIcon className="h-6 w-6 text-white" />}
          backHref="/hub"
        />
        <Card padding="lg">
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded w-full max-w-md" />
            <div className="h-64 bg-muted rounded" />
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Access Management"
        description="Manage system roles and permissions"
        icon={<LockClosedIcon className="h-6 w-6 text-white" />}
        backHref="/hub"
      />

      {error && (
        <Alert variant="error" className="mb-6" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card padding="lg">
        <div className="mb-6">
          <div className="relative max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search employees..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => {
                  const isCurrentUser = row.original.id === currentUserId
                  return (
                    <TableRow
                      key={row.id}
                      className={isCurrentUser ? 'bg-accent/5' : undefined}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {globalFilter ? 'No employees match your search' : 'No employees found'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-6 pt-4 border-t border-border text-sm text-muted-foreground">
          <div className="flex gap-6">
            <span>
              Total: <strong>{employees.length}</strong> employees
            </span>
            <span>
              Super Admins: <strong>{employees.filter((e) => e.isSuperAdmin).length}</strong>
            </span>
            <span>
              HR: <strong>{employees.filter((e) => e.isHR).length}</strong>
            </span>
          </div>
        </div>
      </Card>
    </>
  )
}
