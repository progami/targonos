'use client'

import type { CompletedWorkItemDTO } from '@/lib/contracts/work-items'
import { cn } from '@/lib/utils'

type CompletedItemListProps = {
  items: CompletedWorkItemDTO[]
  selectedId: string | null
  onSelect: (id: string) => void
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}

function CompletedItem({
  item,
  selected,
  onSelect,
  index,
}: {
  item: CompletedWorkItemDTO
  selected: boolean
  onSelect: () => void
  index: number
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative w-full text-left transition-all duration-200 ease-out',
        'rounded-xl border',
        selected
          ? 'border-accent shadow-soft'
          : 'border-border hover:bg-muted/40',
        'bg-card',
      )}
      style={{
        animationDelay: `${index * 30}ms`,
      }}
    >
      {/* Completed indicator bar */}
      <div className={cn(
        'absolute left-0 top-3 bottom-3 w-1 rounded-full transition-all',
        'bg-success-500',
        selected ? 'opacity-100' : 'opacity-50 group-hover:opacity-70'
      )} />

      <div className="pl-4 pr-3 py-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
              {item.typeLabel}
            </span>
          </div>

          {/* Completed badge */}
          <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300">
            {item.completedLabel}
          </span>
        </div>

        {/* Title */}
        <h3 className={cn(
          'mt-2 text-sm font-medium leading-snug line-clamp-2',
          'text-foreground'
        )}>
          {item.title}
        </h3>

        {/* Completion date */}
        <p className="mt-1.5 text-xs text-muted-foreground truncate flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {formatDate(item.completedAt)}
        </p>
      </div>
    </button>
  )
}

export function CompletedItemList({ items, selectedId, onSelect }: CompletedItemListProps) {
  if (!items.length) {
    return (
      <div className="h-full flex items-center justify-center rounded-xl border border-dashed border-border bg-card">
        <div className="text-center px-8 py-12">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>

          <h3 className="text-base font-semibold text-foreground tracking-tight">
            No completed items
          </h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-[220px] mx-auto">
            Items you complete will appear here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-2 -mr-2 space-y-2">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-sm py-2 -mx-1 px-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">
            Completed <span className="text-muted-foreground/60">({items.length})</span>
          </span>
        </div>
        {items.map((item, idx) => (
          <CompletedItem
            key={item.id}
            item={item}
            selected={selectedId === item.id}
            onSelect={() => onSelect(item.id)}
            index={idx}
          />
        ))}
      </div>
    </div>
  )
}
