'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from '@/lib/lucide-icons'
import { cn } from '@/lib/utils'

interface FreightSectionProps {
  id: string
  label: string
  defaultOpen?: boolean
  children: React.ReactNode
  hasContent?: boolean
}

export function FreightSection({
  id,
  label,
  defaultOpen = false,
  children,
  hasContent = false,
}: FreightSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const buttonId = `${id}-toggle`
  const contentId = `${id}-content`

  return (
    <div className="rounded-lg border bg-white dark:bg-slate-800 overflow-hidden">
      <button
        type="button"
        id={buttonId}
        onClick={() => setIsOpen(prev => !prev)}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-foreground">{label}</h4>
          {hasContent && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Has data" />
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      <div
        id={contentId}
        aria-labelledby={buttonId}
        className={cn(
          'transition-all duration-200 ease-in-out',
          isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
        )}
      >
        <div className="border-t px-4 py-4">{children}</div>
      </div>
    </div>
  )
}
