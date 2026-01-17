'use client'

import { useState, ReactNode, Fragment } from 'react'
import { ChevronUp, ChevronDown, ArrowUpDown } from '@/lib/lucide-icons'

export interface Column<T> {
 key: keyof T | string
 label: string
 sortable?: boolean
 render?: (value: unknown, row: T) => ReactNode
 className?: string
}

export interface DataTableProps<T> {
 data: T[]
 columns: Column<T>[]
 loading?: boolean
 emptyMessage?: string
 rowKey?: keyof T | ((row: T) => string)
 onRowClick?: (row: T) => void
 expandable?: {
 isExpanded: (row: T) => boolean
 onToggle: (row: T) => void
 renderExpanded: (row: T) => ReactNode
 }
 className?: string
 getRowClassName?: (row: T, index: number) => string
}

export function DataTable<T extends Record<string, unknown>>({
 data,
 columns,
 loading = false,
 emptyMessage = 'No data available',
 rowKey,
 onRowClick,
 expandable,
 className = '',
 getRowClassName
}: DataTableProps<T>) {
 const [sortColumn, setSortColumn] = useState<string | null>(null)
 const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

 const handleSort = (column: Column<T>) => {
 if (!column.sortable) return

 const key = column.key as string
 if (sortColumn === key) {
 setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
 } else {
 setSortColumn(key)
 setSortDirection('asc')
 }
 }

 const sortedData = [...data].sort((a, b) => {
 if (!sortColumn) return 0

 const aValue = getNestedValue(a, sortColumn)
 const bValue = getNestedValue(b, sortColumn)

 if (aValue === bValue) return 0

 const comparison = aValue > bValue ? 1 : -1
 return sortDirection === 'asc' ? comparison : -comparison
 })

 const getRowKey = (row: T, index: number): string => {
 if (rowKey) {
 if (typeof rowKey === 'function') {
 return rowKey(row)
 }
 return String(row[rowKey])
 }
 return String(index)
 }

 function getNestedValue(obj: unknown, path: string): unknown {
 return path.split('.').reduce((current, key) => (current as Record<string, unknown>)?.[key], obj)
 }

 const getCellValue = (row: T, column: Column<T>): ReactNode => {
 const value = getNestedValue(row, column.key as string)
 
 if (column.render) {
 return column.render(value, row)
 }
 
 return (value ?? '-') as ReactNode
 }

 const SortIcon = ({ column }: { column: Column<T> }) => {
 if (!column.sortable) return null

 const key = column.key as string
 if (sortColumn !== key) {
 return <ArrowUpDown className="h-4 w-4 text-slate-400 dark:text-slate-500" />
 }

 return sortDirection === 'asc' ? (
 <ChevronUp className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
 ) : (
 <ChevronDown className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
 )
 }

 if (loading) {
 return (
 <div className="flex items-center justify-center h-64">
 <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
 </div>
 )
 }

 if (data.length === 0) {
 return (
 <div className="text-center py-12 text-slate-500 dark:text-slate-400">
 {emptyMessage}
 </div>
 )
 }

 return (
 <div className={`overflow-x-auto ${className}`}>
 <table className="w-full table-auto text-sm">
 <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
 <tr>
 {columns.map((column) => (
 <th
 key={column.key as string}
 onClick={() => handleSort(column)}
 className={`
 px-3 py-2 text-left font-semibold border-b border-border/60
 ${column.sortable ? 'cursor-pointer text-foreground hover:text-primary' : ''}
 ${column.className || ''}
 `}
 >
 <div className="flex items-center gap-2">
 {column.label}
 <SortIcon column={column} />
 </div>
 </th>
 ))}
 </tr>
 </thead>
 <tbody className="bg-white dark:bg-slate-800">
 {sortedData.map((row, rowIndex) => {
 const key = getRowKey(row, rowIndex)
 const isExpanded = expandable?.isExpanded(row) || false
 const rowClassName = getRowClassName?.(row, rowIndex) || ''

 return (
 <Fragment key={key}>
 <tr
 onClick={() => onRowClick?.(row)}
 className={`
 border-b border-border/60 last:border-0
 ${onRowClick ? 'cursor-pointer hover:bg-muted/20' : ''}
 ${isExpanded ? 'bg-muted/20' : ''}
 ${rowClassName}
 `}
 >
 {columns.map((column) => (
 <td
 key={`${key}-${column.key as string}`}
 className={`px-3 py-2 align-middle text-sm text-foreground ${column.className || ''}`}
 >
 {getCellValue(row, column)}
 </td>
 ))}
 </tr>
 {isExpanded && expandable && (
 <tr key={`${key}-expanded`}>
 <td colSpan={columns.length} className="px-6 py-4 bg-slate-50 dark:bg-slate-900">
 {expandable.renderExpanded(row)}
 </td>
 </tr>
 )}
 </Fragment>
 )
 })}
 </tbody>
 </table>
 </div>
 )
}
