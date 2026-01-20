'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ColumnDef } from '@tanstack/react-table'
import { DisciplinaryActionsApi, type DisciplinaryAction } from '@/lib/api-client'
import { ExclamationTriangleIcon, PlusIcon } from '@/components/ui/Icons'
import { ListPageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/badge'
import { DataTable, type FilterOption } from '@/components/ui/DataTable'
import { ResultsCount } from '@/components/ui/table'
import { TableEmptyContent } from '@/components/ui/EmptyState'
import { DISCIPLINARY_STATUS_OPTIONS } from '@/lib/domain/disciplinary/constants'

const SEVERITY_OPTIONS: FilterOption[] = [
  { value: 'MINOR', label: 'Minor' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'CRITICAL', label: 'Critical' },
]

const STATUS_OPTIONS: FilterOption[] = [...DISCIPLINARY_STATUS_OPTIONS]

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
        status: filters.status || undefined,
        severity: filters.severity || undefined,
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
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string>()}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'severity',
        header: 'Severity',
        meta: {
          filterKey: 'severity',
          filterOptions: SEVERITY_OPTIONS,
        },
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
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string>()}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        meta: {
          filterKey: 'status',
          filterOptions: STATUS_OPTIONS,
        },
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
        action={
          <Button href="/performance/violations/add" icon={<PlusIcon className="h-4 w-4" />}>
            New Violation
          </Button>
        }
      />

      <div className="space-y-4">
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
          filters={filters}
          onFilterChange={setFilters}
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
