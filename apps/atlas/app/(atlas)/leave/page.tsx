'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { ColumnDef } from '@tanstack/react-table'
import {
  DashboardApi,
  LeavesApi,
  type DashboardData,
  type LeaveRequest,
} from '@/lib/api-client'
import {
  CalendarDaysIcon,
  PlusIcon,
  XIcon,
  CheckIcon,
} from '@/components/ui/Icons'
import { ListPageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { DataTable, type FilterOption } from '@/components/ui/DataTable'
import { ResultsCount } from '@/components/ui/table'
import { TableEmptyContent } from '@/components/ui/EmptyState'
import {
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_OPTIONS,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPE_OPTIONS,
} from '@/lib/domain/leave/constants'

const LEAVE_TYPE_FILTER_OPTIONS: FilterOption[] = LEAVE_TYPE_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}))

const LEAVE_STATUS_FILTER_OPTIONS: FilterOption[] = LEAVE_STATUS_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}))

const PENDING_STATUSES = new Set([
  'PENDING',
  'PENDING_MANAGER',
  'PENDING_HR',
  'PENDING_SUPER_ADMIN',
])

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }

  if (startDate.toDateString() === endDate.toDateString()) {
    return formatDate(start)
  }

  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${startDate.toLocaleDateString('en-US', opts)} - ${endDate.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
  }

  return `${formatDate(start)} - ${formatDate(end)}`
}

type LeaveItem = {
  id: string
  leaveType: string
  startDate: string
  endDate: string
  totalDays: number
  status: string
  reason?: string | null
  createdAt?: string
  employee: { id: string; firstName: string; lastName: string; avatar?: string | null }
  reviewedBy?: { id: string; firstName: string; lastName: string } | null
  isOwn: boolean
}

function LeavePageContent() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([])
  const [leaveLoading, setLeaveLoading] = useState(true)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [processingId, setProcessingId] = useState<string | null>(null)
  const currentEmployeeId = data?.currentEmployee?.id

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const dashboardData = await DashboardApi.get()
      setData(dashboardData)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load data'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  useEffect(() => {
    async function loadLeave() {
      if (!currentEmployeeId) return
      try {
        setLeaveLoading(true)
        const requestsData = await LeavesApi.list({ employeeId: currentEmployeeId })
        setMyRequests(requestsData.items)
      } catch (e) {
        console.error('Failed to load leave data', e)
      } finally {
        setLeaveLoading(false)
      }
    }
    loadLeave()
  }, [currentEmployeeId])

  const handleCancelLeave = useCallback(async (requestId: string) => {
    if (!currentEmployeeId) return
    setProcessingId(requestId)
    try {
      await LeavesApi.update(requestId, { status: 'CANCELLED' })
      const requestsData = await LeavesApi.list({ employeeId: currentEmployeeId })
      setMyRequests(requestsData.items)
    } finally {
      setProcessingId(null)
    }
  }, [currentEmployeeId])

  const handleDecision = useCallback(async (item: LeaveItem, approved: boolean) => {
    setProcessingId(item.id)
    try {
      switch (item.status) {
        case 'PENDING':
        case 'PENDING_MANAGER':
          await LeavesApi.managerApprove(item.id, { approved })
          break
        case 'PENDING_HR':
          await LeavesApi.hrApprove(item.id, { approved })
          break
        case 'PENDING_SUPER_ADMIN':
          await LeavesApi.superAdminApprove(item.id, { approved })
          break
        default:
          return
      }

      await fetchDashboardData()
    } catch (e) {
      console.error(`Failed to ${approved ? 'approve' : 'reject'} leave`, e)
    } finally {
      setProcessingId(null)
    }
  }, [fetchDashboardData])

  const handleRowClick = useCallback(
    (item: LeaveItem) => {
      router.push(`/leaves/${item.id}`)
    },
    [router]
  )

  // Combine my requests + team requests into unified list
  const allLeaveItems = useMemo<LeaveItem[]>(() => {
    const currentEmployeeId = data?.currentEmployee?.id
    if (!currentEmployeeId) return []

    const items: LeaveItem[] = []
    const seenIds = new Set<string>()

    // Add my requests
    for (const r of myRequests) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id)
        items.push({
          id: r.id,
          leaveType: r.leaveType,
          startDate: r.startDate,
          endDate: r.endDate,
          totalDays: r.totalDays,
          status: r.status,
          reason: r.reason,
          createdAt: r.createdAt,
          employee: {
            id: currentEmployeeId,
            firstName: data?.currentEmployee?.firstName ?? '',
            lastName: data?.currentEmployee?.lastName ?? '',
            avatar: data?.currentEmployee?.avatar,
          },
          reviewedBy: r.reviewedBy,
          isOwn: true,
        })
      }
    }

    // Add team's pending requests
    for (const r of data?.pendingLeaveRequests ?? []) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id)
        items.push({ ...r, isOwn: false })
      }
    }

    // Add team's approval history
    for (const r of data?.leaveApprovalHistory ?? []) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id)
        items.push({ ...r, isOwn: false })
      }
    }

    // Sort by date descending
    return items.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
  }, [data, myRequests])

  // Apply filters
  const filteredItems = useMemo(() => {
    return allLeaveItems.filter((item) => {
      if (filters.status && item.status !== filters.status) return false
      if (filters.leaveType && item.leaveType !== filters.leaveType) return false
      return true
    })
  }, [allLeaveItems, filters])

  const actionableLeaveIds = useMemo(() => {
    return new Set((data?.pendingLeaveRequests ?? []).map((r) => r.id))
  }, [data?.pendingLeaveRequests])

  const columns = useMemo<ColumnDef<LeaveItem>[]>(
    () => [
      {
        id: 'employee',
        header: 'Employee',
        accessorFn: (row) => `${row.employee.firstName} ${row.employee.lastName}`,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar
              src={row.original.employee.avatar}
              alt={`${row.original.employee.firstName} ${row.original.employee.lastName}`}
              size="sm"
            />
            <div>
              <p className="font-medium text-foreground">
                {row.original.employee.firstName} {row.original.employee.lastName}
                {row.original.isOwn && (
                  <span className="ml-1.5 text-xs text-muted-foreground">(You)</span>
                )}
              </p>
              {row.original.reason && (
                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {row.original.reason}
                </p>
              )}
            </div>
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'leaveType',
        header: 'Type',
        meta: {
          filterKey: 'leaveType',
          filterOptions: LEAVE_TYPE_FILTER_OPTIONS,
        },
        cell: ({ getValue }) => {
          const type = getValue<string>()
          return (
            <span className="text-muted-foreground">
              {LEAVE_TYPE_LABELS[type as keyof typeof LEAVE_TYPE_LABELS] ?? type}
            </span>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'startDate',
        header: 'Dates',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDateRange(row.original.startDate, row.original.endDate)}
          </span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'totalDays',
        header: 'Days',
        cell: ({ getValue }) => {
          const days = getValue<number>()
          return <span className="text-muted-foreground">{days} day{days !== 1 ? 's' : ''}</span>
        },
        enableSorting: true,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        meta: {
          filterKey: 'status',
          filterOptions: LEAVE_STATUS_FILTER_OPTIONS,
        },
        cell: ({ getValue }) => {
          const status = getValue<string>()
          return (
            <StatusBadge
              status={LEAVE_STATUS_LABELS[status as keyof typeof LEAVE_STATUS_LABELS] ?? status}
            />
          )
        },
        enableSorting: true,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const item = row.original

          // Own pending request - can cancel
          if (item.isOwn && PENDING_STATUSES.has(item.status)) {
            return (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation()
                  void handleCancelLeave(item.id)
                }}
                disabled={processingId === item.id}
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title="Cancel request"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            )
          }

          // Team request needing action - can approve/reject
          if (!item.isOwn && actionableLeaveIds.has(item.id) && PENDING_STATUSES.has(item.status)) {
            return (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleDecision(item, false)
                  }}
                  disabled={processingId === item.id}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <XIcon className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleDecision(item, true)
                  }}
                  disabled={processingId === item.id}
                >
                  <CheckIcon className="h-4 w-4 mr-1" />
                  Approve
                </Button>
              </div>
            )
          }

          // Approved - show who approved
          if (item.status === 'APPROVED' && item.reviewedBy) {
            return (
              <span className="text-xs text-muted-foreground">
                by {item.reviewedBy.firstName}
              </span>
            )
          }

          return null
        },
        enableSorting: false,
      },
    ],
    [actionableLeaveIds, handleCancelLeave, handleDecision, processingId]
  )

  if (loading) {
    return (
      <>
        <ListPageHeader
          title="Leave"
          description="Request and manage leave"
          icon={<CalendarDaysIcon className="h-6 w-6 text-white" />}
        />
        <div className="animate-pulse h-64 bg-muted/50 rounded-lg" />
      </>
    )
  }

  if (error) {
    return (
      <>
        <ListPageHeader
          title="Leave"
          description="Request and manage leave"
          icon={<CalendarDaysIcon className="h-6 w-6 text-white" />}
        />
        <div className="flex flex-col items-center justify-center h-64">
          <Alert variant="error" className="max-w-md mb-4">
            {error}
          </Alert>
          <Button onClick={fetchDashboardData}>Retry</Button>
        </div>
      </>
    )
  }

  const currentEmployee = data?.currentEmployee

  if (!currentEmployee) {
    return (
      <>
        <ListPageHeader
          title="Leave"
          description="Request and manage leave"
          icon={<CalendarDaysIcon className="h-6 w-6 text-white" />}
        />
        <Card padding="lg">
          <Alert variant="error" className="mb-4">
            Your employee profile was not found.
          </Alert>
          <Button href="/no-access">Request access / support</Button>
        </Card>
      </>
    )
  }

  const pendingCount = data?.pendingLeaveRequests?.length ?? 0

  return (
    <>
      <ListPageHeader
        title="Leave"
        description="Request and manage leave"
        icon={<CalendarDaysIcon className="h-6 w-6 text-white" />}
        action={
          <Button
            href="/leave/request"
            icon={<PlusIcon className="h-4 w-4" />}
          >
            Request Leave
          </Button>
        }
      />

      <div className="space-y-4">
        {pendingCount > 0 && (
          <Alert variant="warning" title="Pending Approvals">
            You have {pendingCount} leave request{pendingCount !== 1 ? 's' : ''} awaiting your approval.
          </Alert>
        )}

        <ResultsCount
          count={filteredItems.length}
          singular="request"
          plural="requests"
          loading={leaveLoading}
        />

        <DataTable
          columns={columns}
          data={filteredItems}
          loading={leaveLoading}
          skeletonRows={5}
          onRowClick={handleRowClick}
          filters={filters}
          onFilterChange={setFilters}
          addRow={{ label: 'Request Leave', onClick: () => router.push('/leave/request') }}
          emptyState={
            <TableEmptyContent
              icon={<CalendarDaysIcon className="h-10 w-10" />}
              title="No leave requests found"
            />
          }
        />
      </div>
    </>
  )
}

function LeavePageSkeleton() {
  return (
    <>
      <ListPageHeader
        title="Leave"
        description="Request and manage leave"
        icon={<CalendarDaysIcon className="h-6 w-6 text-white" />}
      />
      <div className="animate-pulse h-64 bg-muted/50 rounded-lg" />
    </>
  )
}

export default function LeavePage() {
  return (
    <Suspense fallback={<LeavePageSkeleton />}>
      <LeavePageContent />
    </Suspense>
  )
}
