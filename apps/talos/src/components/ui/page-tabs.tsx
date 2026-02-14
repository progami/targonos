'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface PageTab {
  value: string
  label: string
  icon?: LucideIcon
  count?: number
}

export interface PageTabsProps {
  tabs: PageTab[]
  value: string
  onChange: (value: string) => void
  variant?: 'underline' | 'underline-lg' | 'pills'
  className?: string
}

const variantStyles = {
  underline: {
    container: 'border-b border-border',
    nav: '-mb-px flex space-x-8',
    tab: {
      base: 'py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors',
      active: 'border-primary text-primary',
      inactive: 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
    },
    icon: 'h-4 w-4',
  },
  'underline-lg': {
    container: 'border-b border-border',
    nav: '-mb-px flex space-x-1',
    tab: {
      base: 'py-3 px-6 border-b-4 font-semibold text-base flex items-center gap-2 transition-all',
      active: 'border-primary text-primary',
      inactive: 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
    },
    icon: 'h-5 w-5',
  },
  pills: {
    container: 'inline-flex rounded-xl border border-border bg-muted/30 p-1',
    nav: 'flex',
    tab: {
      base: 'px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all',
      active: 'bg-primary text-primary-foreground shadow-soft',
      inactive: 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
    },
    icon: 'h-4 w-4',
  },
}

export function PageTabs({
  tabs,
  value,
  onChange,
  variant = 'underline',
  className,
}: PageTabsProps) {
  const styles = variantStyles[variant]

  return (
    <div className={cn(styles.container, className)}>
      <nav className={styles.nav}>
        {tabs.map((tab) => {
          const isActive = value === tab.value
          const Icon = tab.icon

          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={cn(
                styles.tab.base,
                isActive ? styles.tab.active : styles.tab.inactive
              )}
            >
              {Icon && <Icon className={styles.icon} />}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'ml-1 rounded-full px-2 py-0.5 text-xs font-medium',
                    isActive
                      ? variant === 'pills'
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
