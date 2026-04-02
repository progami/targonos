'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChangeSummaryProps {
  changes: string[]
  snapshotNote?: string | null
}

export function ChangeSummary({ changes, snapshotNote }: ChangeSummaryProps) {
  const [open, setOpen] = useState(false)

  if (changes.length === 0 && !snapshotNote) return null

  return (
    <div className="border-t bg-gray-50">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-left hover:bg-gray-100 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="font-medium">Changes</span>
        {changes.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
            {changes.length}
          </span>
        )}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1">
          {changes.map((change, i) => (
            <div key={i} className={cn('text-sm text-gray-700 flex items-center gap-2')}>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              {change}
            </div>
          ))}
          {snapshotNote && (
            <p className="text-xs text-muted-foreground mt-2 italic">{snapshotNote}</p>
          )}
        </div>
      )}
    </div>
  )
}
