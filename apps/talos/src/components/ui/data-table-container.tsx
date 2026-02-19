'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface DataTableContainerProps {
  title?: string
  subtitle?: string
  headerContent?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function DataTableContainer({
  title,
  subtitle,
  headerContent,
  children,
  className,
}: DataTableContainerProps) {
  const hasHeader = title || subtitle || headerContent

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft',
        className
      )}
    >
      {hasHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
          <div>
            {title && (
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {headerContent && <div className="flex items-center gap-2">{headerContent}</div>}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  )
}

// Standardized table header row component
export interface DataTableHeadProps {
  children: React.ReactNode
  className?: string
}

export function DataTableHead({ children, className }: DataTableHeadProps) {
  return (
    <thead
      className={cn(
        'bg-muted text-xs uppercase tracking-wide text-muted-foreground',
        className
      )}
    >
      {children}
    </thead>
  )
}

// Standardized table header cell component
export interface DataTableHeaderCellProps {
  children: React.ReactNode
  className?: string
  align?: 'left' | 'center' | 'right'
}

export function DataTableHeaderCell({
  children,
  className,
  align = 'left',
}: DataTableHeaderCellProps) {
  const alignClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  }[align]

  return (
    <th
      className={cn(
        'sticky top-0 z-10 bg-muted px-2 py-2 font-semibold whitespace-nowrap align-top',
        alignClass,
        className
      )}
    >
      {children}
    </th>
  )
}

// Standardized empty state for tables
export interface DataTableEmptyProps {
  colSpan: number
  message?: string
}

export function DataTableEmpty({
  colSpan,
  message = 'No data available.',
}: DataTableEmptyProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-muted-foreground">
        {message}
      </td>
    </tr>
  )
}
