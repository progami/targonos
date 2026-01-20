'use client'

import * as React from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  ColumnFiltersState,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
} from './table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { ChevronUpIcon, ChevronDownIcon, ChevronDownIcon as FilterIcon, PlusIcon } from './Icons'

export type FilterOption = { value: string; label: string }

export interface ColumnMeta {
  align?: 'left' | 'center' | 'right'
  filterKey?: string
  filterOptions?: FilterOption[]
}

export type DataTableAddRowAction = {
  label: string
  onClick: () => void
  disabled?: boolean
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  initialSorting?: SortingState
  loading?: boolean
  skeletonRows?: number
  emptyState?: React.ReactNode
  onRowClick?: (row: TData) => void
  filters?: Record<string, string>
  onFilterChange?: (filters: Record<string, string>) => void
  addRow?: DataTableAddRowAction
}

function ColumnFilterDropdown({
  filterKey,
  options,
  currentValue,
  onSelect,
}: {
  filterKey: string
  options: FilterOption[]
  currentValue?: string
  onSelect: (key: string, value: string) => void
}) {
  const hasFilter = currentValue && currentValue !== ''

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'ml-1 p-0.5 rounded hover:bg-muted/50 focus:outline-none',
          hasFilter && 'text-primary'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <FilterIcon className={cn('h-3 w-3', hasFilter ? 'text-primary' : 'text-muted-foreground')} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[120px]">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation()
            onSelect(filterKey, '')
          }}
          className={cn(!hasFilter && 'bg-muted')}
        >
          All
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(filterKey, option.value)
            }}
            className={cn(currentValue === option.value && 'bg-muted')}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DataTable<TData, TValue>({
  columns,
  data,
  initialSorting,
  loading = false,
  skeletonRows = 6,
  emptyState,
  onRowClick,
  filters = {},
  onFilterChange,
  addRow,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>(() => initialSorting ?? [])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])

  // Defer showing skeleton to prevent flash on quick loads
  const [showSkeleton, setShowSkeleton] = React.useState(false)
  React.useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => setShowSkeleton(true), 150)
      return () => clearTimeout(timer)
    } else {
      setShowSkeleton(false)
    }
  }, [loading])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters,
    },
  })

  const handleFilterSelect = React.useCallback(
    (key: string, value: string) => {
      if (onFilterChange) {
        onFilterChange({ ...filters, [key]: value })
      }
    },
    [filters, onFilterChange]
  )

  const hasRows = table.getRowModel().rows.length > 0

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} hoverable={false}>
            {headerGroup.headers.map((header) => {
              const canSort = header.column.getCanSort()
              const sorted = header.column.getIsSorted()
              const meta = header.column.columnDef.meta as ColumnMeta | undefined
              const align = meta?.align
              const filterKey = meta?.filterKey
              const filterOptions = meta?.filterOptions

              return (
                <TableHead
                  key={header.id}
                  align={align}
                  className={cn(canSort && 'cursor-pointer select-none')}
                  onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                >
                  <div className={cn('flex items-center gap-1', align === 'right' && 'justify-end')}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {filterKey && filterOptions && filterOptions.length > 0 && (
                      <ColumnFilterDropdown
                        filterKey={filterKey}
                        options={filterOptions}
                        currentValue={filters[filterKey]}
                        onSelect={handleFilterSelect}
                      />
                    )}
                    {canSort && (
                      <span className="ml-1">
                        {sorted === 'asc' ? (
                          <ChevronUpIcon className="h-3.5 w-3.5" />
                        ) : sorted === 'desc' ? (
                          <ChevronDownIcon className="h-3.5 w-3.5" />
                        ) : (
                          <span className="h-3.5 w-3.5 opacity-0 group-hover:opacity-50">
                            <ChevronUpIcon className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {showSkeleton ? (
          <TableSkeleton rows={skeletonRows} columns={columns.length} />
        ) : loading ? (
          // During initial delay, show placeholder matching expected table height
          <>
            {Array.from({ length: skeletonRows }).map((_, i) => (
              <TableRow key={i} hoverable={false}>
              <TableCell colSpan={columns.length} className="h-14" />
            </TableRow>
          ))}
          </>
        ) : !hasRows ? (
          emptyState ? (
            <TableRow hoverable={false}>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {emptyState}
              </TableCell>
            </TableRow>
          ) : null
        ) : (
          <>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                hoverable={Boolean(onRowClick)}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                data-state={row.getIsSelected() && 'selected'}
              >
                {row.getVisibleCells().map((cell) => {
                  const align = (cell.column.columnDef.meta as ColumnMeta | undefined)?.align

                  return (
                    <TableCell key={cell.id} align={align}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}

            {addRow ? (
              <TableRow hoverable={false} className="border-dashed">
                <TableCell colSpan={columns.length} className="p-0">
                  <button
                    type="button"
                    onClick={addRow.onClick}
                    disabled={addRow.disabled}
                    className={cn(
                      'group w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors',
                      'hover:bg-muted/30 hover:text-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      addRow.disabled ? 'opacity-50 pointer-events-none' : null
                    )}
                  >
                    <span className={cn(
                      'h-8 w-8 rounded-lg border border-dashed border-border bg-background/50 flex items-center justify-center transition-colors',
                      'group-hover:border-border/80 group-hover:bg-background'
                    )}>
                      <PlusIcon className="h-4 w-4" />
                    </span>
                    <span>{addRow.label}</span>
                  </button>
                </TableCell>
              </TableRow>
            ) : null}
          </>
        )}
      </TableBody>
    </Table>
  )
}
