'use client'

import Link from 'next/link'
import type { CompletedWorkItemDTO, WorkItemEntityData } from '@/lib/contracts/work-items'
import { cn } from '@/lib/utils'

type CompletedActionPaneProps = {
  item: CompletedWorkItemDTO | null
}

function getEntityTypeConfig(type: string) {
  const configs: Record<string, { toneBg: string; toneText: string; icon: React.ReactNode; label: string }> = {
    'TASK': {
      toneBg: 'bg-muted',
      toneText: 'text-foreground',
      label: 'Task',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    'POLICY': {
      toneBg: 'bg-muted',
      toneText: 'text-foreground',
      label: 'Policy',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    'LEAVE_REQUEST': {
      toneBg: 'bg-accent/15',
      toneText: 'text-accent',
      label: 'Leave Request',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    'PERFORMANCE_REVIEW': {
      toneBg: 'bg-warning-100 dark:bg-warning-900/30',
      toneText: 'text-warning-800 dark:text-warning-300',
      label: 'Performance Review',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    'DISCIPLINARY_ACTION': {
      toneBg: 'bg-danger-100 dark:bg-danger-900/30',
      toneText: 'text-danger-800 dark:text-danger-300',
      label: 'Disciplinary Action',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
  }

  return configs[type] ? configs[type] : configs['TASK']
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRating(rating: number): string {
  if (rating >= 4.5) return 'Exceptional'
  if (rating >= 3.5) return 'Exceeds Expectations'
  if (rating >= 2.5) return 'Meets Expectations'
  if (rating >= 1.5) return 'Needs Improvement'
  return 'Unsatisfactory'
}

function EntityContent({ entityType, entityData }: { entityType: string; entityData?: WorkItemEntityData }) {
  if (!entityData) return null

  switch (entityType) {
    case 'POLICY':
      return (
        <div className="space-y-3">
          {entityData.category ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-xs font-medium">
                {entityData.category.replace(/_/g, ' ')}
              </span>
            </div>
          ) : null}
          {entityData.summary ? (
            <div className="p-4 bg-muted/20 rounded-xl border border-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Summary
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {entityData.summary}
              </p>
            </div>
          ) : null}
        </div>
      )

    case 'LEAVE_REQUEST':
      return entityData.reason ? (
        <div className="p-4 bg-muted/20 rounded-xl border border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Reason
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {entityData.reason}
          </p>
        </div>
      ) : null

    case 'DISCIPLINARY_ACTION':
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {entityData.violationType ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-xs font-medium">
                {entityData.violationType.replace(/_/g, ' ')}
              </span>
            ) : null}
            {entityData.severity ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-xs font-medium">
                {entityData.severity}
              </span>
            ) : null}
          </div>
          {entityData.description ? (
            <div className="p-4 bg-muted/20 rounded-xl border border-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Description
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {entityData.description}
              </p>
            </div>
          ) : null}
        </div>
      )

    case 'PERFORMANCE_REVIEW':
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {entityData.reviewType ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-xs font-medium">
                {entityData.reviewType.replace(/_/g, ' ')}
              </span>
            ) : null}
            {entityData.overallRating !== undefined ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-xs font-medium">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                {formatRating(entityData.overallRating)}
              </span>
            ) : null}
          </div>
          {entityData.strengths ? (
            <div className="p-4 bg-muted/20 rounded-xl border border-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Strengths
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {entityData.strengths}
              </p>
            </div>
          ) : null}
        </div>
      )

    default:
      return null
  }
}

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center rounded-xl border border-dashed border-border bg-card">
      <div className="text-center px-8 py-12">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>

        <h3 className="text-base font-semibold text-foreground tracking-tight">
          No item selected
        </h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-[260px]">
          Select an item from the list to view its details.
        </p>
      </div>
    </div>
  )
}

export function CompletedActionPane({ item }: CompletedActionPaneProps) {
  if (!item) {
    return <EmptyState />
  }

  const config = getEntityTypeConfig(item.entity.type)

  return (
    <div className="h-full flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-soft">
      {/* Header section */}
      <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border bg-muted/20">
        {/* Type badge with icon */}
        <div className="flex items-center gap-3 mb-4">
          <div className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center',
            config.toneBg,
            config.toneText,
          )}>
            {config.icon}
          </div>
          <div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {item.typeLabel}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-success-100 dark:bg-success-900/30 text-success-800 dark:text-success-300 text-xs font-semibold">
                {item.completedLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-lg font-semibold text-foreground leading-tight">
          {item.title}
        </h2>

        {/* Completion date */}
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <svg className="w-4 h-4 text-success-600 dark:text-success-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>{formatDate(item.completedAt)}</span>
        </div>
      </div>

      {/* Content section */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
        {/* Description */}
        {item.description ? (
          <div className="mb-4 p-4 bg-muted/20 rounded-xl border border-border">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {item.description}
            </p>
          </div>
        ) : null}

        {/* Entity-specific content */}
        <EntityContent entityType={item.entity.type} entityData={item.entityData} />
      </div>

      {/* Footer - View details link */}
      <div className="shrink-0 px-5 py-4 border-t border-border bg-card">
        <Link
          href={item.href}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/70 text-foreground text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          View full details
        </Link>
      </div>
    </div>
  )
}
