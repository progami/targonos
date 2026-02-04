'use client'

import { useMemo } from 'react'
import type { WorkItemDTO } from '@/lib/contracts/work-items'
import { cn } from '@/lib/utils'

type InboxItemListProps = {
  items: WorkItemDTO[]
  selectedId: string | null
  onSelect: (id: string) => void
}

function getPriorityConfig(item: WorkItemDTO): { dot: string; bg: string; label?: string } {
  if (item.isOverdue) {
    return {
      dot: 'bg-danger-500',
      bg: 'bg-danger-50/70 dark:bg-danger-900/10',
      label: item.overdueDays ? `${item.overdueDays}d overdue` : 'Overdue',
    }
  }
  if (item.priority === 'URGENT') {
    return {
      dot: 'bg-danger-500',
      bg: 'bg-danger-50/70 dark:bg-danger-900/10',
      label: 'Urgent',
    }
  }
  if (item.priority === 'HIGH') {
    return {
      dot: 'bg-warning-500',
      bg: 'bg-warning-50/70 dark:bg-warning-900/10',
    }
  }
  if (item.isActionRequired) {
    return {
      dot: 'bg-accent',
      bg: 'bg-accent/10',
    }
  }
  return {
    dot: 'bg-muted-foreground/60',
    bg: 'bg-card',
  }
}


function InboxItem({
  item,
  selected,
  onSelect,
  index
}: {
  item: WorkItemDTO
  selected: boolean
  onSelect: () => void
  index: number
}) {
  const config = getPriorityConfig(item)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative w-full min-h-[92px] text-left transition-colors duration-200',
        'rounded-xl border',
        config.bg,
        selected
          ? 'border-accent bg-accent/5 shadow-soft'
          : 'border-border hover:bg-muted/40',
      )}
      style={{
        animationDelay: `${index * 30}ms`,
      }}
    >
      {/* Priority indicator bar */}
      <div className={cn(
        'absolute left-0 top-3 bottom-3 w-1 rounded-full transition-all',
        config.dot,
        selected ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'
      )} />

      <div className="pl-4 pr-3 py-3 h-full flex flex-col">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
              {item.typeLabel}
            </span>
          </div>

          {config.label ? (
            <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300">
              {config.label}
            </span>
          ) : null}
        </div>

        {/* Title */}
        <h3 className={cn(
          'mt-2 text-sm font-medium leading-snug line-clamp-2',
          selected ? 'text-foreground' : 'text-foreground'
        )}>
          {item.title}
        </h3>

        {/* Action indicator - pushed to bottom */}
        <div className="mt-auto">
          {item.primaryAction ? (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className={cn(
                  'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
                  config.dot
                )} />
                <span className={cn(
                  'relative inline-flex h-2.5 w-2.5 rounded-full',
                  config.dot
                )} />
              </span>
              <span className={cn(
                'text-xs font-semibold',
                item.isOverdue || item.priority === 'URGENT' ? 'text-danger-700 dark:text-danger-300' :
                item.isActionRequired ? 'text-accent' :
                'text-muted-foreground'
              )}>
                {item.primaryAction.label}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </button>
  )
}

export function InboxItemList({ items, selectedId, onSelect }: InboxItemListProps) {
  // Group items by urgency
  const groupedItems = useMemo(() => {
    const overdue = items.filter(i => i.isOverdue)
    const urgent = items.filter(i => !i.isOverdue && (i.priority === 'URGENT' || i.priority === 'HIGH'))
    const actionRequired = items.filter(i => !i.isOverdue && i.priority !== 'URGENT' && i.priority !== 'HIGH' && i.isActionRequired)
    const other = items.filter(i => !i.isOverdue && i.priority !== 'URGENT' && i.priority !== 'HIGH' && !i.isActionRequired)

    return { overdue, urgent, actionRequired, other }
  }, [items])

  if (!items.length) {
    return (
      <div className="h-full flex items-center justify-center rounded-xl border border-dashed border-border bg-card">
        <div className="text-center px-8 py-12">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h3 className="text-base font-semibold text-foreground tracking-tight">
            Inbox Zero
          </h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-[220px] mx-auto">
            You’re all caught up.
          </p>
        </div>
      </div>
    )
  }

  const renderGroup = (title: string, groupItems: WorkItemDTO[], startIndex: number) => {
    if (!groupItems.length) return null

    return (
      <div className="space-y-2">
        <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-sm py-2 -mx-1 px-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">
            {title} <span className="text-muted-foreground/60">({groupItems.length})</span>
          </span>
        </div>
        {groupItems.map((item, idx) => (
          <InboxItem
            key={item.id}
            item={item}
            selected={selectedId === item.id}
            onSelect={() => onSelect(item.id)}
            index={startIndex + idx}
          />
        ))}
      </div>
    )
  }

  let indexOffset = 0

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-2 -mr-2 space-y-4">
        {renderGroup('Needs Attention', groupedItems.overdue, indexOffset)}
        {(indexOffset += groupedItems.overdue.length, null)}

        {renderGroup('High Priority', groupedItems.urgent, indexOffset)}
        {(indexOffset += groupedItems.urgent.length, null)}

        {renderGroup('Action Required', groupedItems.actionRequired, indexOffset)}
        {(indexOffset += groupedItems.actionRequired.length, null)}

        {renderGroup('Other', groupedItems.other, indexOffset)}
      </div>
    </div>
  )
}
