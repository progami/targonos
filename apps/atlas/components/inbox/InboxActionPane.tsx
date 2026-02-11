'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { ActionId } from '@/lib/contracts/action-ids'
import type { WorkItemDTO, WorkItemEntityData } from '@/lib/contracts/work-items'
import { formatWorkItemWhen, getWorkItemDueLabel } from '@/components/work-queue/work-item-utils'
import { cn } from '@/lib/utils'
import {
  ClipboardCheck,
  FileText,
  CalendarDays,
  TrendingUp,
  AlertTriangle,
  Check,
  ExternalLink,
  MousePointerClick,
} from 'lucide-react'

type InboxActionPaneProps = {
  item: WorkItemDTO | null
  onAction: (actionId: ActionId, item: WorkItemDTO) => Promise<void> | void
  currentIndex?: number
  totalCount?: number
}

function getEntityTypeConfig(type: string) {
  const configs: Record<string, { accentColor: string; iconBgColor: string; icon: React.ReactNode; label: string }> = {
    'TASK': {
      accentColor: 'text-accent',
      iconBgColor: 'bg-accent/15',
      label: 'Task',
      icon: <ClipboardCheck className="w-5 h-5" strokeWidth={2} />,
    },
    'POLICY': {
      accentColor: 'text-muted-foreground',
      iconBgColor: 'bg-muted',
      label: 'Policy',
      icon: <FileText className="w-5 h-5" strokeWidth={2} />,
    },
    'LEAVE_REQUEST': {
      accentColor: 'text-accent',
      iconBgColor: 'bg-accent/15',
      label: 'Leave Request',
      icon: <CalendarDays className="w-5 h-5" strokeWidth={2} />,
    },
    'PERFORMANCE_REVIEW': {
      accentColor: 'text-warning-700 dark:text-warning-300',
      iconBgColor: 'bg-warning-100 dark:bg-warning-900/30',
      label: 'Performance Review',
      icon: <TrendingUp className="w-5 h-5" strokeWidth={2} />,
    },
    'DISCIPLINARY_ACTION': {
      accentColor: 'text-danger-700 dark:text-danger-300',
      iconBgColor: 'bg-danger-100 dark:bg-danger-900/30',
      label: 'Disciplinary Action',
      icon: <AlertTriangle className="w-5 h-5" strokeWidth={2} />,
    },
  }

  return configs[type] ? configs[type] : configs['TASK']
}

function formatLeaveType(type: string): string {
  return type.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }

  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.toLocaleDateString('en-US', { ...opts, year: 'numeric' })} - ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
  }
  if (start.getMonth() === end.getMonth() && start.getDate() === end.getDate()) {
    return start.toLocaleDateString('en-US', { ...opts, year: 'numeric' })
  }
  return `${start.toLocaleDateString('en-US', opts)} - ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}

// Get summary text from entity data
function getEntitySummary(item: WorkItemDTO, entityData?: WorkItemEntityData): string | null {
  if (!entityData) return item.description || null

  switch (item.entity.type) {
    case 'POLICY':
      return entityData.summary || null
    case 'LEAVE_REQUEST':
      return entityData.reason || null
    case 'PERFORMANCE_REVIEW':
      return entityData.strengths || null
    case 'DISCIPLINARY_ACTION':
      return entityData.description || null
    case 'TASK':
      return item.description || null
    default:
      return item.description || null
  }
}

// Get category/type badge for the entity
function getEntityCategory(item: WorkItemDTO, entityData?: WorkItemEntityData): string | null {
  if (!entityData) return null

  switch (item.entity.type) {
    case 'POLICY':
      return entityData.category?.replace(/_/g, ' ') || null
    case 'LEAVE_REQUEST':
      return formatLeaveType(entityData.leaveType || '')
    case 'PERFORMANCE_REVIEW':
      return entityData.reviewType?.replace(/_/g, ' ') || null
    case 'DISCIPLINARY_ACTION':
      return entityData.violationType?.replace(/_/g, ' ') || entityData.severity || null
    case 'TASK':
      return item.stageLabel || null
    default:
      return null
  }
}

// Get description line for the header
function getEntityDescription(item: WorkItemDTO, entityData?: WorkItemEntityData): string {
  switch (item.entity.type) {
    case 'POLICY':
      return `Acknowledge "${item.title}" (v${entityData?.version || '1.0'})`
    case 'LEAVE_REQUEST':
      if (entityData?.employeeName && entityData?.startDate && entityData?.endDate) {
        return `${entityData.employeeName} - ${formatDateRange(entityData.startDate, entityData.endDate)} (${entityData.totalDays || 1} ${(entityData.totalDays || 1) === 1 ? 'day' : 'days'})`
      }
      return item.description || 'Review leave request'
    case 'PERFORMANCE_REVIEW':
      if (entityData?.employeeNameForReview) {
        return `Review for ${entityData.employeeNameForReview}`
      }
      return item.description || 'Complete performance review'
    case 'DISCIPLINARY_ACTION':
      return item.description || 'Review disciplinary action'
    case 'TASK':
      return item.description || 'Complete this task'
    default:
      return item.description || ''
  }
}

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center rounded-xl border border-dashed border-border bg-card">
      <div className="text-center px-8 py-12">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <MousePointerClick className="h-6 w-6" strokeWidth={1.5} />
        </div>
        <h3 className="text-base font-semibold text-foreground">Select an item</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-[220px] mx-auto">
          Choose from your inbox to view details.
        </p>
      </div>
    </div>
  )
}

export function InboxActionPane({ item, onAction, currentIndex, totalCount }: InboxActionPaneProps) {
  const [acting, setActing] = useState<ActionId | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successLabel, setSuccessLabel] = useState('')

  useEffect(() => {
    setShowSuccess(false)
    setSuccessLabel('')
  }, [item?.id])

  if (!item) {
    return <EmptyState />
  }

  const entityConfig = getEntityTypeConfig(item.entity.type)
  const dueLabel = getWorkItemDueLabel(item)
  const category = getEntityCategory(item, item.entityData)
  const summary = getEntitySummary(item, item.entityData)
  const description = getEntityDescription(item, item.entityData)
  const hasAction = item.primaryAction && item.isActionRequired

  const handleAction = async (actionId: ActionId) => {
    setActing(actionId)
    try {
      await onAction(actionId, item)
      const action = item.primaryAction?.id === actionId ? item.primaryAction : item.secondaryActions.find(a => a.id === actionId)
      setSuccessLabel(action?.label ?? 'Done')
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 2000)
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="h-full flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-soft">
      {/* Header */}
      <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border bg-muted/20">
        <div className="flex items-center gap-3 mb-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            entityConfig.iconBgColor,
            entityConfig.accentColor,
          )}>
            {entityConfig.icon}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn('font-medium', entityConfig.accentColor)}>{item.typeLabel}</span>
            <span className="text-muted-foreground/60">·</span>
            <span>{item.stageLabel}</span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-lg font-semibold leading-tight mb-3 text-foreground">
          {item.title}
        </h2>

        {/* Action Required badge */}
        {hasAction ? (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/15 text-sm font-medium text-accent">
            <span className="w-2 h-2 rounded-full bg-accent" />
            Action Required
          </div>
        ) : null}
      </div>

      {/* Success feedback */}
      {showSuccess ? (
        <div className="shrink-0 px-5 py-3 bg-success-50 dark:bg-success-900/15 border-b border-success-100 dark:border-success-900/30 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 text-success-800 dark:text-success-200">
            <Check className="w-4 h-4" strokeWidth={2.5} />
            <span className="text-sm font-semibold">{successLabel} complete</span>
          </div>
        </div>
      ) : null}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>

        {/* Category tag */}
        {category ? (
          <div>
            <span className="inline-flex items-center px-3 py-1.5 rounded-md bg-muted text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              {category}
            </span>
          </div>
        ) : null}

        {/* Summary section */}
        {summary ? (
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Summary
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {summary}
            </p>
          </div>
        ) : null}

        {/* Due date and Created date */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Due Date
            </p>
            <p className={cn(
              'text-sm font-semibold',
              item.isOverdue ? 'text-danger-700 dark:text-danger-300' : 'text-foreground'
            )}>
              {item.dueAt ? dueLabel : 'No due date'}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Created
            </p>
            <p className="text-sm font-semibold text-foreground">
              {formatWorkItemWhen(item.createdAt)}
            </p>
          </div>
        </div>

        {/* See full details link */}
        <Link
          href={item.href}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="w-4 h-4" strokeWidth={2} />
          See full details
        </Link>
      </div>

      {/* Action button - sticky at bottom */}
      {item.primaryAction && !showSuccess ? (
        <div className="shrink-0 p-4 border-t border-border bg-card">
          <Button
            className="w-full h-11 rounded-xl text-sm font-semibold"
            disabled={item.primaryAction.disabled || acting === item.primaryAction.id}
            loading={acting === item.primaryAction.id}
            onClick={() => handleAction(item.primaryAction!.id)}
          >
            {item.primaryAction.label}
          </Button>

          {/* Secondary actions */}
          {item.secondaryActions.length > 0 ? (
            <div className="flex gap-2 mt-2">
              {item.secondaryActions.map((action) => (
                <Button
                  key={action.id}
                  variant="secondary"
                  className="flex-1 h-10 text-sm rounded-xl"
                  disabled={action.disabled || acting === action.id}
                  loading={acting === action.id}
                  onClick={() => handleAction(action.id)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
