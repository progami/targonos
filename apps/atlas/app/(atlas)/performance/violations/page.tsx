'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ColumnDef } from '@tanstack/react-table'
import { DisciplinaryActionsApi, type DisciplinaryAction } from '@/lib/api-client'
import { ExclamationTriangleIcon, PlusIcon } from '@/components/ui/Icons'
import { ListPageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/DataTable'
import { ResultsCount } from '@/components/ui/table'
import { TableEmptyContent } from '@/components/ui/EmptyState'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import {
  DISCIPLINARY_ACTION_TYPE_LABELS,
  DISCIPLINARY_STATUS_OPTIONS,
  VIOLATION_TYPE_LABELS,
} from '@/lib/domain/disciplinary/constants'

const SEVERITY_OPTIONS = [
  { value: 'MINOR', label: 'Minor' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'CRITICAL', label: 'Critical' },
]

const STATUS_OPTIONS = [...DISCIPLINARY_STATUS_OPTIONS]

const SEVERITY_LABELS: Record<string, string> = Object.fromEntries(
  SEVERITY_OPTIONS.map((o) => [o.value, o.label])
)

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label])
)

const SEVERITY_COLORS: Record<string, string> = {
  MINOR: 'bg-muted text-muted-foreground',
  MODERATE: 'bg-warning-100 text-warning-800',
  MAJOR: 'bg-danger-100 text-danger-700',
  CRITICAL: 'bg-danger-500 text-white',
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.MINOR}`}>
      {SEVERITY_LABELS[severity] ?? severity}
    </span>
  )
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function DisciplinaryPage() {
  const router = useRouter()
  const [items, setItems] = useState<DisciplinaryAction[]>([])
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await DisciplinaryActionsApi.list({
        status: filters.status ? filters.status : undefined,
        severity: filters.severity ? filters.severity : undefined,
      })
      setItems(data.items)
    } catch (err) {
      console.error('Error fetching violations:', err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [filters.status, filters.severity])

  useEffect(() => {
    load()
  }, [load])

  const stats = useMemo(() => {
    let closed = 0
    let pending = 0
    let critical = 0
    let major = 0

    for (const v of items) {
      if (v.status === 'CLOSED' || v.status === 'DISMISSED') closed += 1
      if (typeof v.status === 'string' && v.status.startsWith('PENDING_')) pending += 1
      if (v.severity === 'CRITICAL') critical += 1
      if (v.severity === 'MAJOR') major += 1
    }

    return { closed, pending, critical, major }
  }, [items])

  const statusFilter = filters.status ?? ''
  const severityFilter = filters.severity ?? ''

  const columns = useMemo<ColumnDef<DisciplinaryAction>[]>(
    () => [
      {
        accessorFn: (row) => `${row.employee?.firstName} ${row.employee?.lastName}`,
        id: 'employee',
        header: 'Employee',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">
              {row.original.employee?.firstName} {row.original.employee?.lastName}
            </p>
            <p className="text-xs text-muted-foreground">{row.original.employee?.department}</p>
          </div>
        ),
        enableSorting: true,
      },
      {
        id: 'reportedBy',
        header: 'Reported By',
        accessorFn: (row) => {
          if (row.createdBy) {
            return `${row.createdBy.firstName} ${row.createdBy.lastName}`
          }
          return row.reportedBy
        },
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string>()}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'violationType',
        header: 'Type',
        cell: ({ getValue }) => {
          const raw = getValue<string>()
          const label = raw in VIOLATION_TYPE_LABELS ? VIOLATION_TYPE_LABELS[raw as keyof typeof VIOLATION_TYPE_LABELS] : raw
          return <span className="text-muted-foreground">{label}</span>
        },
        enableSorting: true,
      },
      {
        accessorKey: 'severity',
        header: 'Severity',
        cell: ({ getValue }) => <SeverityBadge severity={getValue<string>()} />,
        enableSorting: true,
      },
      {
        accessorKey: 'incidentDate',
        header: 'Incident Date',
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{formatDate(getValue<string>())}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'actionTaken',
        header: 'Action',
        cell: ({ getValue }) => {
          const raw = getValue<string>()
          const label = raw in DISCIPLINARY_ACTION_TYPE_LABELS
            ? DISCIPLINARY_ACTION_TYPE_LABELS[raw as keyof typeof DISCIPLINARY_ACTION_TYPE_LABELS]
            : raw
          return <span className="text-muted-foreground">{label}</span>
        },
        enableSorting: true,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue<string>()
          return <StatusBadge status={STATUS_LABELS[status] ?? status} />
        },
        enableSorting: true,
      },
    ],
    []
  )

  const handleRowClick = useCallback(
    (action: DisciplinaryAction) => {
      router.push(`/performance/violations/${action.id}`)
    },
    [router]
  )

  return (
    <>
      <ListPageHeader
        title="Violations"
        description="Track reported violations"
        icon={<ExclamationTriangleIcon className="h-6 w-6 text-white" />}
        showBack
        action={
          <Button href="/performance/violations/add" icon={<PlusIcon className="h-4 w-4" />}>
            New Violation
          </Button>
        }
      />

      <div className="space-y-4">
        <Card padding="md">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border/60 bg-card p-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Total</p>
                <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{items.length}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card p-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Pending</p>
                <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{stats.pending}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card p-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Closed</p>
                <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{stats.closed}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card p-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">High severity</p>
                <p className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                  <span className="text-danger-700">{stats.critical}</span> critical
                  <span className="text-muted-foreground/50"> • </span>
                  <span className="text-danger-700">{stats.major}</span> major
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="min-w-[200px]">
                <Label className="text-xs">Status</Label>
                <NativeSelect
                  value={statusFilter}
                  onChange={(e) => {
                    const next = e.target.value
                    setFilters((prev) => ({ ...prev, status: next }))
                  }}
                  className="mt-1"
                >
                  <option value="">All statuses</option>
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="min-w-[200px]">
                <Label className="text-xs">Severity</Label>
                <NativeSelect
                  value={severityFilter}
                  onChange={(e) => {
                    const next = e.target.value
                    setFilters((prev) => ({ ...prev, severity: next }))
                  }}
                  className="mt-1"
                >
                  <option value="">All severities</option>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {(statusFilter !== '' || severityFilter !== '') ? (
                <Button variant="secondary" onClick={() => setFilters({})}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        </Card>

        <ResultsCount
          count={items.length}
          singular="violation"
          plural="violations"
          loading={loading}
        />

        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          skeletonRows={5}
          onRowClick={handleRowClick}
          addRow={{ label: 'New Violation', onClick: () => router.push('/performance/violations/add') }}
          emptyState={
            <TableEmptyContent
              icon={<ExclamationTriangleIcon className="h-10 w-10" />}
              title="No violations found"
            />
          }
        />
      </div>
    </>
  )
}
