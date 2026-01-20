'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ColumnDef } from '@tanstack/react-table'
import { PerformanceReviewsApi, type PerformanceReview } from '@/lib/api-client'
import { ClipboardDocumentCheckIcon, PlusIcon, StarFilledIcon, ClockIcon, ExclamationTriangleIcon } from '@/components/ui/Icons'
import { ListPageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/badge'
import { DataTable, type FilterOption } from '@/components/ui/DataTable'
import { ResultsCount } from '@/components/ui/table'
import { TableEmptyContent } from '@/components/ui/EmptyState'
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_OPTIONS,
  REVIEW_TYPE_LABELS,
  REVIEW_TYPE_OPTIONS,
} from '@/lib/domain/performance/constants'

const REVIEW_TYPE_FILTER_OPTIONS: FilterOption[] = REVIEW_TYPE_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}))

const REVIEW_STATUS_FILTER_OPTIONS: FilterOption[] = REVIEW_STATUS_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}))

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
        status: filters.status || undefined,
        reviewType: filters.reviewType || undefined,
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
        meta: {
          filterKey: 'reviewType',
          filterOptions: REVIEW_TYPE_FILTER_OPTIONS,
        },
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
        meta: {
          filterKey: 'status',
          filterOptions: REVIEW_STATUS_FILTER_OPTIONS,
        },
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
        action={
          <Button href="/performance/reviews/add" icon={<PlusIcon className="h-4 w-4" />}>
            New Review
          </Button>
        }
      />

      <div className="space-y-4">
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
          filters={filters}
          onFilterChange={setFilters}
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
