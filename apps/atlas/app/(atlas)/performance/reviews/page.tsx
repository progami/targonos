'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ColumnDef } from '@tanstack/react-table'
import { PerformanceReviewsApi, type PerformanceReview } from '@/lib/api-client'
import { ClipboardDocumentCheckIcon, PlusIcon, StarFilledIcon, ClockIcon, ExclamationTriangleIcon } from '@/components/ui/Icons'
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
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_OPTIONS,
  REVIEW_TYPE_LABELS,
  REVIEW_TYPE_OPTIONS,
} from '@/lib/domain/performance/constants'

function DeadlineBadge({ review }: { review: PerformanceReview }) {
  const deadline = review.deadline ?? (review as { quarterlyCycle?: { deadline?: string } }).quarterlyCycle?.deadline
  if (!deadline) return null

  const now = new Date()
  const deadlineDate = new Date(deadline)
  const daysUntil = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  // Already completed - no badge needed
  if (review.status !== 'DRAFT') return null

  // Escalated
  if (review.escalatedToHR) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-danger-100 text-danger-800">
        <ExclamationTriangleIcon className="h-3 w-3" />
        Escalated
      </span>
    )
  }

  // Overdue
  if (daysUntil < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-danger-100 text-danger-800">
        <ClockIcon className="h-3 w-3" />
        {Math.abs(daysUntil)}d overdue
      </span>
    )
  }

  // Due soon (1-3 days)
  if (daysUntil <= 3) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warning-100 text-warning-800">
        <ClockIcon className="h-3 w-3" />
        {daysUntil}d left
      </span>
    )
  }

  // Normal (> 3 days)
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success-100 text-success-800">
      <ClockIcon className="h-3 w-3" />
      {daysUntil}d left
    </span>
  )
}

function RatingStars({ rating }: { rating: number }) {
  const safeRating = Number.isFinite(rating) ? rating : 0
  if (safeRating <= 0) {
    return <span className="text-xs text-muted-foreground tabular-nums">—</span>
  }

  return (
    <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground tabular-nums">
      <StarFilledIcon className="h-3.5 w-3.5 text-warning-500" />
      <span>{safeRating}/10</span>
    </div>
  )
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function PerformanceReviewsPage() {
  const router = useRouter()
  const [items, setItems] = useState<PerformanceReview[]>([])
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await PerformanceReviewsApi.list({
        status: filters.status ? filters.status : undefined,
        reviewType: filters.reviewType ? filters.reviewType : undefined,
      })
      setItems(data.items)
    } catch (err) {
      console.error('Error fetching reviews:', err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [filters.status, filters.reviewType])

  useEffect(() => {
    load()
  }, [load])

  const stats = useMemo(() => {
    const now = Date.now()
    let completed = 0
    let open = 0
    let escalated = 0
    let overdue = 0

    for (const review of items) {
      const status = review.status
      if (status === 'COMPLETED' || status === 'ACKNOWLEDGED') completed += 1
      else open += 1
      if (review.escalatedToHR) escalated += 1

      const deadline = review.deadline ?? (review as { quarterlyCycle?: { deadline?: string } }).quarterlyCycle?.deadline ?? null
      if (status === 'DRAFT' && deadline) {
        const dt = new Date(deadline).getTime()
        if (!Number.isNaN(dt) && dt < now) overdue += 1
      }
    }

    return { completed, open, escalated, overdue }
  }, [items])

  const statusFilter = filters.status ?? ''
  const typeFilter = filters.reviewType ?? ''

  const columns = useMemo<ColumnDef<PerformanceReview>[]>(
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
        accessorKey: 'reviewerName',
        header: 'Reviewer',
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string>()}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'reviewType',
        header: 'Type',
        cell: ({ getValue }) => {
          const type = getValue<string>()
          return (
            <span className="text-muted-foreground">
              {REVIEW_TYPE_LABELS[type as keyof typeof REVIEW_TYPE_LABELS] ?? type}
            </span>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'reviewPeriod',
        header: 'Period',
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string>()}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'reviewDate',
        header: 'Date',
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{formatDate(getValue<string>())}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'overallRating',
        header: 'Rating',
        cell: ({ getValue }) => <RatingStars rating={getValue<number>()} />,
        enableSorting: true,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue<string>()
          return (
            <StatusBadge
              status={REVIEW_STATUS_LABELS[status as keyof typeof REVIEW_STATUS_LABELS] ?? status}
            />
          )
        },
        enableSorting: true,
      },
      {
        id: 'deadline',
        header: 'Deadline',
        cell: ({ row }) => <DeadlineBadge review={row.original} />,
        enableSorting: false,
      },
    ],
    []
  )

  const handleRowClick = useCallback(
    (review: PerformanceReview) => {
      router.push(`/performance/reviews/${review.id}`)
    },
    [router]
  )

  return (
    <>
      <ListPageHeader
        title="Reviews"
        description="Track employee performance evaluations"
        icon={<ClipboardDocumentCheckIcon className="h-6 w-6 text-white" />}
        showBack
        action={
          <Button href="/performance/reviews/add" icon={<PlusIcon className="h-4 w-4" />}>
            New Review
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
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Open</p>
                <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{stats.open}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card p-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Completed</p>
                <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{stats.completed}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card p-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Escalated</p>
                <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{stats.escalated}</p>
                {stats.overdue > 0 ? (
                  <p className="mt-1 text-xs text-danger-700">{stats.overdue} overdue</p>
                ) : null}
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
                  {REVIEW_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="min-w-[200px]">
                <Label className="text-xs">Type</Label>
                <NativeSelect
                  value={typeFilter}
                  onChange={(e) => {
                    const next = e.target.value
                    setFilters((prev) => ({ ...prev, reviewType: next }))
                  }}
                  className="mt-1"
                >
                  <option value="">All types</option>
                  {REVIEW_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {(statusFilter !== '' || typeFilter !== '') ? (
                <Button variant="secondary" onClick={() => setFilters({})}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        </Card>

        <ResultsCount
          count={items.length}
          singular="review"
          plural="reviews"
          loading={loading}
        />

        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          skeletonRows={5}
          onRowClick={handleRowClick}
          addRow={{ label: 'New Review', onClick: () => router.push('/performance/reviews/add') }}
          emptyState={
            <TableEmptyContent
              icon={<ClipboardDocumentCheckIcon className="h-10 w-10" />}
              title="No reviews found"
            />
          }
        />
      </div>
    </>
  )
}
